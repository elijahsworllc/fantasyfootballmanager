// FFU private data store: the jobs' working files live in a private Supabase Storage bucket, not a public git branch.
//
//   node backend/store.mjs pull <dir> [--only a,b,values/] [--skip a,b]   download the files a job needs
//   node backend/store.mjs push <dir>                                    upload what changed (by sha256)
//
// A manifest (_manifest.json) records every file's sha256 and size, so a push only uploads changed files and a pull
// can verify what it got. A file that was pulled and then removed by the job (e.g. replaced by its .gz) is deleted.
// Needs SUPABASE_SECRET_KEY. A pull with no manifest fails, so no job can run on empty data and overwrite the store,
// unless STORE_SEED_FROM_GIT=1 (one-time migration from the old public data branch).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { SB_URL } from "./db.mjs";

const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || "";
export const BUCKET = process.env.STORE_BUCKET || "ffu-data";
const MANIFEST = "_manifest.json", LOCAL = ".store.json";
const auth = () => { const h = { apikey: KEY }; if (!KEY.startsWith("sb_secret_")) h.Authorization = `Bearer ${KEY}`; return h; };
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const typeOf = p => p.endsWith(".gz") ? "application/gzip" : p.endsWith(".json") ? "application/json" : "application/octet-stream";
const enc = p => p.split("/").map(encodeURIComponent).join("/");

async function call(url, opts = {}, tries = 4) {
  for (let i = 0; ; i++) {
    let r; try { r = await fetch(url, opts); } catch (e) { if (i >= tries - 1) throw e; await new Promise(s => setTimeout(s, 1500 * (i + 1))); continue; }
    if (r.ok || (r.status < 500 && r.status !== 429) || i >= tries - 1) return r;
    await new Promise(s => setTimeout(s, 1500 * (i + 1)));
  }
}
export async function ensureBucket() {
  const r = await call(`${SB_URL}/storage/v1/bucket/${BUCKET}`, { headers: auth() });
  if (r.ok) { const b = await r.json(); if (b.public) throw new Error(`bucket ${BUCKET} is public: make it private first`); return "exists"; }
  const c = await call(`${SB_URL}/storage/v1/bucket`, { method: "POST", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) });
  if (!c.ok) throw new Error(`create bucket ${c.status}: ${(await c.text()).slice(0, 300)}`);
  return "created";
}
export async function getObj(p) {
  const r = await call(`${SB_URL}/storage/v1/object/authenticated/${BUCKET}/${enc(p)}`, { headers: auth() });
  if (r.status === 404 || r.status === 400) { const t = await r.text(); if (/not.?found/i.test(t) || r.status === 404) return null; throw new Error(`get ${p} ${r.status}: ${t.slice(0, 200)}`); }
  if (!r.ok) throw new Error(`get ${p} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}
export async function putObj(p, buf) {
  const r = await call(`${SB_URL}/storage/v1/object/${BUCKET}/${enc(p)}`, { method: "POST", headers: { ...auth(), "Content-Type": typeOf(p), "x-upsert": "true", "cache-control": "no-cache" }, body: buf });
  if (!r.ok) throw new Error(`put ${p} ${r.status}: ${(await r.text()).slice(0, 300)}`);
}
async function delObjs(paths) {
  if (!paths.length) return;
  const r = await call(`${SB_URL}/storage/v1/object/${BUCKET}`, { method: "DELETE", headers: { ...auth(), "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: paths }) });
  if (!r.ok) throw new Error(`delete ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
async function manifest() { const b = await getObj(MANIFEST); return b ? JSON.parse(b.toString("utf8")) : null; }
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; }
function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === LOCAL || e.name === MANIFEST) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(f, base)); else if (e.isFile()) out.push(path.relative(base, f).split(path.sep).join("/"));
  }
  return out;
}
const matches = (p, list) => list.some(x => x.endsWith("/") ? p.startsWith(x) : p === x);

export async function pull(dir, { only = null, skip = [] } = {}) {
  if (!KEY) throw new Error("SUPABASE_SECRET_KEY is not set");
  fs.mkdirSync(dir, { recursive: true });
  const m = await manifest();
  if (!m) {
    if (process.env.STORE_SEED_FROM_GIT !== "1") throw new Error("the data store is empty (no manifest): refusing to run on empty data");
    const repo = process.env.GITHUB_REPOSITORY || "elijahsworllc/fantasyfootballmanager";
    fs.rmSync(dir, { recursive: true, force: true });
    execFileSync("git", ["clone", "-q", "--depth", "1", "--branch", "data", `https://github.com/${repo}.git`, dir], { stdio: "inherit" });
    fs.rmSync(path.join(dir, ".git"), { recursive: true, force: true });
    const files = walk(dir);
    fs.writeFileSync(path.join(dir, LOCAL), JSON.stringify({ pulled: {}, seeded: true }));
    return `seeded ${files.length} files from the git data branch`;
  }
  const want = Object.keys(m.files).filter(p => (!only || matches(p, only)) && !matches(p, skip));
  let bytes = 0; const pulled = {};
  await pool(want, 6, async p => {
    const b = await getObj(p); if (!b) throw new Error(`${p} is in the manifest but missing from the store`);
    if (sha(b) !== m.files[p].sha) throw new Error(`${p}: checksum mismatch`);
    const f = path.join(dir, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b);
    pulled[p] = m.files[p].sha; bytes += b.length;
  });
  fs.writeFileSync(path.join(dir, LOCAL), JSON.stringify({ pulled }));
  return `pulled ${want.length} files (${(bytes / 1e6).toFixed(1)} MB)`;
}

export async function push(dir) {
  if (!KEY) throw new Error("SUPABASE_SECRET_KEY is not set");
  await ensureBucket();
  let local = { pulled: {} }; try { local = JSON.parse(fs.readFileSync(path.join(dir, LOCAL), "utf8")); } catch {}
  const files = walk(dir), changed = [], hashes = {};
  const m0 = (await manifest()) || { files: {} };
  for (const p of files) { const b = fs.readFileSync(path.join(dir, p)); hashes[p] = { sha: sha(b), size: b.length }; if (!m0.files[p] || m0.files[p].sha !== hashes[p].sha) changed.push(p); }
  const gone = Object.keys(local.pulled || {}).filter(p => !hashes[p]);
  let bytes = 0;
  await pool(changed, 4, async p => { const b = fs.readFileSync(path.join(dir, p)); await putObj(p, b); bytes += b.length; });
  await delObjs(gone);
  // re-read just before writing so a concurrent job's entries (alerts) aren't lost, then apply only our changes
  const m = (await manifest()) || { files: {} };
  for (const p of changed) m.files[p] = hashes[p];
  for (const p of gone) delete m.files[p];
  m.updated = new Date().toISOString();
  await putObj(MANIFEST, Buffer.from(JSON.stringify(m)));
  return `pushed ${changed.length} changed files (${(bytes / 1e6).toFixed(1)} MB), removed ${gone.length}; store holds ${Object.keys(m.files).length} files`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, dir = "data-branch", ...rest] = process.argv.slice(2);
  const opt = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1].split(",").filter(Boolean) : null; };
  try {
    if (cmd === "pull") console.log("store:", await pull(dir, { only: opt("--only"), skip: opt("--skip") || [] }));
    else if (cmd === "push") console.log("store:", await push(dir));
    else if (cmd === "bucket") console.log("store: bucket", await ensureBucket());
    else { console.log("usage: store.mjs pull|push|bucket <dir> [--only a,b] [--skip a,b]"); process.exit(2); }
  } catch (e) { console.error("store: FAILED", e.message); process.exit(1); }
}

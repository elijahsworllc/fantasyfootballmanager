// FFU database writer: upserts rows into Supabase through its REST API (PostgREST).
// Needs SUPABASE_SECRET_KEY (the project's secret key, "sb_secret_..." or the legacy service_role key).
// Without it every call is a no-op, so the nightly jobs keep working on files alone.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export const SB_URL = process.env.SUPABASE_URL || "https://uxqevvuqibqvypwpccjz.supabase.co";
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || "";
export const dbOn = !!KEY;
const headers = () => {
  const h = { apikey: KEY, "Content-Type": "application/json" };
  if (!KEY.startsWith("sb_secret_")) h.Authorization = `Bearer ${KEY}`;   // legacy JWT keys also go in Authorization
  return h;
};

export async function upsert(table, rows, { onConflict, batch = 500 } = {}) {
  if (!dbOn || !rows.length) return 0;
  let done = 0;
  for (let i = 0; i < rows.length; i += batch) {
    const part = rows.slice(i, i + batch);
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(`${SB_URL}/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ""}`, {
        method: "POST", headers: { ...headers(), Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(part) });
      if (r.ok) { done += part.length; break; }
      const msg = await r.text();
      if (attempt >= 2 || (r.status >= 400 && r.status < 500 && r.status !== 429)) throw new Error(`${table} upsert ${r.status}: ${msg.slice(0, 300)}`);
      await new Promise(s => setTimeout(s, 1500 * (attempt + 1)));
    }
  }
  return done;
}

// Run a database step without ever failing the nightly job: files stay the source of truth until cutover.
export async function safely(label, fn) {
  if (!dbOn) { console.log(`${label}: skipped (no SUPABASE_SECRET_KEY)`); return; }
  try { console.log(`${label}: ${await fn()}`); } catch (e) { console.log(`${label}: FAILED ${e.message}`); }
}

// Data-branch files: read plain or gzipped JSON, write gzipped (the trade database grows all season).
export function readJSON(dir, name, fallback) {
  for (const f of [name + ".gz", name]) {
    try { const b = fs.readFileSync(path.join(dir, f)); return JSON.parse(f.endsWith(".gz") ? zlib.gunzipSync(b).toString("utf8") : b.toString("utf8")); } catch {}
  }
  return fallback;
}
export function writeGz(dir, name, obj) {
  fs.writeFileSync(path.join(dir, name + ".gz"), zlib.gzipSync(JSON.stringify(obj), { level: 9 }));
  try { fs.unlinkSync(path.join(dir, name)); } catch {}
}

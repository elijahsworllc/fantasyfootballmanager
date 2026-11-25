// Shared plumbing for the FFU data API (Vercel functions): key check, database reads, responses.
// Env (Vercel → Project → Settings → Environment Variables): SUPABASE_SECRET_KEY (required), SUPABASE_URL (optional).
const crypto = require("node:crypto");
const SB_URL = process.env.SUPABASE_URL || "https://uxqevvuqibqvypwpccjz.supabase.co";
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || "";
const VERSION = "1.0";
const ATTR = "FFU values: market price × FFU in-house factor from real trades. Market prices: FantasyCalc. Not for resale without an FFU data license.";

function sbHeaders(extra) { const h = { apikey: KEY, "Content-Type": "application/json", ...extra }; if (!KEY.startsWith("sb_secret_")) h.Authorization = `Bearer ${KEY}`; return h; }
async function sb(pathAndQuery, { method = "GET", body, range } = {}) {
  const r = await fetch(`${SB_URL}${pathAndQuery}`, { method, headers: sbHeaders({ ...(range ? { Range: range, "Range-Unit": "items" } : {}), ...(method === "POST" && !pathAndQuery.includes("/rpc/") ? { Prefer: "return=minimal" } : {}) }), body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw Object.assign(new Error(`database ${r.status}`), { status: 502, detail: (await r.text()).slice(0, 200) });
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
// read every row of a filtered table in 1,000-row pages (the database caps a single read)
async function sbAll(pathAndQuery, max = 20000) {
  const out = []; for (let from = 0; from < max; from += 1000) { const page = await sb(pathAndQuery, { range: `${from}-${from + 999}` }); out.push(...page); if (page.length < 1000) break; } return out;
}
function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries({ "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "x-api-key, content-type", ...headers })) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}
// every endpoint: handle CORS preflight, require the database, check the key and the daily limit
function endpoint(fn, { open = false } = {}) {
  return async (req, res) => {
    if (req.method === "OPTIONS") return send(res, 204, {});
    if (req.method !== "GET") return send(res, 405, { error: "GET only" });
    try {
      if (open) return await fn(req, res, {});
      if (!KEY) return send(res, 503, { error: "The FFU data API isn't switched on yet." });
      const key = String(req.headers["x-api-key"] || (req.query || {}).key || "");
      if (!key) return send(res, 401, { error: "Missing API key: send it in the x-api-key header." });
      const hash = crypto.createHash("sha256").update(key).digest("hex");
      const [hit] = await sb("/rest/v1/rpc/ffu_api_hit", { method: "POST", body: { p_hash: hash } });
      if (!hit || hit.plan == null) return send(res, 401, { error: "Unknown or revoked API key, or one that hasn't been approved yet." });
      const limits = { "X-RateLimit-Limit": String(hit.daily_limit), "X-RateLimit-Remaining": String(Math.max(0, hit.daily_limit - hit.calls)) };
      if (!hit.ok) return send(res, 429, { error: "Daily limit reached. It resets at midnight UTC." }, limits);
      return await fn(req, res, { plan: hit.plan, limits, hash, calls: hit.calls, dailyLimit: hit.daily_limit });
    } catch (e) { return send(res, e.status || 500, { error: e.status ? e.message : "Something went wrong.", detail: e.detail }); }
  };
}
// raw market prices (and the factor that reveals them) are only for internal and licensed partner keys
const FULL = new Set(["internal", "partner", "trial"]);
const fieldsFor = plan => FULL.has(plan) ? (r => r) : (({ market, factor, ...r }) => r);
const shapeOf = q => (String((q || {}).shape || "sf").toLowerCase() === "oneqb" || String((q || {}).shape).toLowerCase() === "1qb") ? "oneqb" : "sf";
const okId = s => /^[A-Za-z0-9_-]{1,40}$/.test(String(s || ""));

// ---------- the app's own data (no API key: the site itself), from the private FFU store ----------
const BUCKET = process.env.STORE_BUCKET || "ffu-data";
const zlib = require("node:zlib");
const memo = new Map();   // per warm function instance: file -> { at, data }
async function storeJSON(name, ttlMs = 20 * 60e3) {
  const hit = memo.get(name); if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  const r = await fetch(`${SB_URL}/storage/v1/object/authenticated/${BUCKET}/${name}`, { headers: sbHeaders() });
  if (!r.ok) { if (hit) return hit.data; throw Object.assign(new Error(`store ${r.status}`), { status: r.status === 400 || r.status === 404 ? 404 : 502 }); }
  const buf = Buffer.from(await r.arrayBuffer()), data = JSON.parse((name.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8"));
  memo.set(name, { at: Date.now(), data }); return data;
}
const SITE = /^https:\/\/((www\.)?fantasyfootballuniverse\.com|[a-z0-9-]+-elijah-00f2\.vercel\.app|fantasyfootballuniverse\.vercel\.app|elijahsworllc\.github\.io)$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
function appEndpoint(fn, { methods = ["GET"] } = {}) {
  return async (req, res) => {
    const origin = String(req.headers.origin || ""), cors = SITE.test(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : { "Access-Control-Allow-Origin": "https://fantasyfootballuniverse.com" };
    const out = (st, body, h = {}) => send(res, st, body, { ...cors, "Access-Control-Allow-Methods": methods.join(", "), ...h });
    if (req.method === "OPTIONS") return out(204, {});
    if (!methods.includes(req.method)) return out(405, { error: `${methods.join("/")} only` });
    if (!KEY) return out(503, { error: "not configured" });
    try { return await fn(req, out); } catch (e) { return out(e.status || 500, { error: e.status ? e.message : "Something went wrong." }); }
  };
}
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c); try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}
const idList = (v, max) => [...new Set(String(v || "").split(",").map(s => s.trim()).filter(okId))].slice(0, max);
module.exports = { fieldsFor, sb, sbAll, send, endpoint, shapeOf, okId, VERSION, ATTR, configured: () => !!KEY, storeJSON, appEndpoint, readBody, idList };

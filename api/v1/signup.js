// POST /api/v1/signup {email, name, project, url, use}: request a free FFU data key.
// The key is shown once, here; only its hash is stored. Keys start switched off until FFU approves them
// (Supabase → api_keys → set revoked = false), unless PARTNER_SIGNUPS=open is set in Vercel.
const crypto = require("node:crypto");
const { sb, send, readBody } = require("../_lib/ffu.js");
const OPEN = process.env.PARTNER_SIGNUPS === "open", FREE_LIMIT = 500;
const clean = (v, n) => String(v || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
module.exports = async (req, res) => {
  const origin = String(req.headers.origin || ""), cors = /^https:\/\/(www\.)?fantasyfootballuniverse\.com$|^http:\/\/localhost(:\d+)?$|\.vercel\.app$/.test(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
  const out = (st, b) => send(res, st, b, { ...cors, "Access-Control-Allow-Methods": "POST", "Cache-Control": "no-store" });
  if (req.method === "OPTIONS") return out(204, {});
  if (req.method !== "POST") return out(405, { error: "POST only" });
  try {
    const b = await readBody(req);
    if (b.website) return out(200, { ok: true, pending: true });   // honeypot field: bots fill it, people never see it
    const email = clean(b.email, 120).toLowerCase(), name = clean(b.name, 80), project = clean(b.project, 120), url = clean(b.url, 200), use = clean(b.use, 600);
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return out(400, { error: "Enter a real email address." });
    if (!name || !project || use.length < 20) return out(400, { error: "Tell us your name, your project and, in a sentence or two, what you'll build." });
    const ipHash = crypto.createHash("sha256").update(String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() + "|ffu").digest("hex").slice(0, 16);
    const today = new Date().toISOString().slice(0, 10), like = s => encodeURIComponent(`*${s}*`);
    const mine = await sb(`/rest/v1/api_keys?select=revoked,plan&owner=like.${like(`"email":"${email}"`)}`);
    if (mine.some(k => k.plan === "free")) return out(409, { error: "There's already a free key for that email. Lost it? Email hello@fantasyfootballuniverse.com." });
    const fromIp = await sb(`/rest/v1/api_keys?select=key_hash&owner=like.${like(`"ip":"${ipHash}"`)}&created_at=gte.${today}`);
    if (fromIp.length >= 3) return out(429, { error: "Too many requests from here today. Try again tomorrow." });
    const key = "ffu_live_" + crypto.randomBytes(24).toString("base64url"), hash = crypto.createHash("sha256").update(key).digest("hex");
    const owner = JSON.stringify({ email, name, project, url, use, ip: ipHash, at: new Date().toISOString() });
    await sb("/rest/v1/api_keys", { method: "POST", body: { key_hash: hash, owner, plan: "free", daily_limit: FREE_LIMIT, revoked: !OPEN } });
    return out(200, { ok: true, key, pending: !OPEN, dailyLimit: FREE_LIMIT,
      note: OPEN ? "Your key works now. Save it: we only show it once." : "Save this key now: we only show it once. It switches on when we approve your request, usually within a day." });
  } catch (e) { return out(e.status === 502 ? 502 : 500, { error: "Couldn't create the key right now. Try again in a minute." }); }
};

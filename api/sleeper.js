// POST /api/sleeper {op, variables} — the Sign in with Sleeper (beta) relay.
//
// Browsers can't call Sleeper's GraphQL from another site, so the app sends each request here and this function
// forwards it to https://sleeper.com/graphql unchanged. It is a pass-through only:
//   - the Sleeper session token arrives in the x-sleeper-token header and is never stored or logged;
//   - only the operations below can be sent (the query text lives here, not in the request), so this can't be
//     used as an open proxy into someone's account;
//   - only the FFU site may call it.
// Operation shapes follow Sleeper's own web client (verified by github.com/AJFrio/sleeper-cli and
// github.com/joscaz/sleeper-mcp, Sep–Nov 2026). Sleeper doesn't document or support this API.
const GQL = "https://sleeper.com/graphql";
const TX = "transaction_id type status status_updated created creator leg league_id roster_ids consenter_ids adds drops draft_picks waiver_budget settings metadata";
const LEG = "league_id roster_id matchup_id round leg starters";
const OPS = {
  login: { anon: true, q: `query login($who: String!, $password: String) { login(email_or_phone_or_username: $who, password: $password) { user_id username display_name token verification } }` },
  me: { q: `query me { me { user_id username display_name } }` },
  matchup_legs: { q: `query matchup_legs($league_id: Snowflake!, $round: Int!) { matchup_legs(league_id: $league_id, round: $round) { ${LEG} } }` },
  update_matchup_leg: { q: `mutation update_matchup_leg($league_id: Snowflake!, $roster_id: Int!, $round: Int!, $leg: Int!, $starters: [String]) { update_matchup_leg(league_id: $league_id, roster_id: $roster_id, round: $round, leg: $leg, starters: $starters) { ${LEG} } }` },
  submit_waiver_claim: { q: `mutation submit_waiver_claim($league_id: Snowflake!, $k_adds: [String], $v_adds: [Int], $k_drops: [String], $v_drops: [Int], $k_settings: [String], $v_settings: [Int]) { submit_waiver_claim(league_id: $league_id, k_adds: $k_adds, v_adds: $v_adds, k_drops: $k_drops, v_drops: $v_drops, k_settings: $k_settings, v_settings: $v_settings) { ${TX} } }` },
  cancel_waiver_claim: { q: `mutation cancel_waiver_claim($league_id: Snowflake!, $transaction_id: Snowflake!, $leg: Int!) { cancel_waiver_claim(league_id: $league_id, transaction_id: $transaction_id, leg: $leg) { ${TX} } }` },
  propose_trade: { q: `mutation propose_trade($league_id: Snowflake!, $k_adds: [String], $v_adds: [Int], $k_drops: [String], $v_drops: [Int], $draft_picks: [String], $waiver_budget: [String]) { propose_trade(league_id: $league_id, k_adds: $k_adds, v_adds: $v_adds, k_drops: $k_drops, v_drops: $v_drops, draft_picks: $draft_picks, waiver_budget: $waiver_budget) { ${TX} } }` },
  accept_trade: { q: `mutation accept_trade($league_id: Snowflake!, $transaction_id: Snowflake!, $leg: Int!) { accept_trade(league_id: $league_id, transaction_id: $transaction_id, leg: $leg) { ${TX} } }` },
  reject_trade: { q: `mutation reject_trade($league_id: Snowflake!, $transaction_id: Snowflake!, $leg: Int!) { reject_trade(league_id: $league_id, transaction_id: $transaction_id, leg: $leg) { ${TX} } }` },
};
const SITE = /^https:\/\/((www\.)?fantasyfootballuniverse\.com|[a-z0-9-]+-elijah-00f2\.vercel\.app|fantasyfootballuniverse\.vercel\.app)$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const ID = /^\d{1,24}$/;

async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}
// light checks so malformed requests never reach Sleeper
function valid(op, v) {
  if (!v || typeof v !== "object") return false;
  if (op === "login") return typeof v.who === "string" && v.who.length <= 120 && typeof v.password === "string" && v.password.length <= 200;
  if (op === "me") return true;
  if (!ID.test(String(v.league_id || ""))) return false;
  const ints = ["roster_id", "round", "leg"].filter(k => k in v);
  if (ints.some(k => !Number.isInteger(v[k]) || v[k] < 0 || v[k] > 10000)) return false;
  for (const k of ["starters", "k_adds", "k_drops", "k_settings", "draft_picks", "waiver_budget"]) if (k in v && v[k] != null && (!Array.isArray(v[k]) || v[k].length > 60 || v[k].some(x => typeof x !== "string" || x.length > 40))) return false;
  for (const k of ["v_adds", "v_drops", "v_settings"]) if (k in v && v[k] != null && (!Array.isArray(v[k]) || v[k].some(x => !Number.isInteger(x)))) return false;
  if ("transaction_id" in v && !ID.test(String(v.transaction_id))) return false;
  return true;
}

module.exports = async (req, res) => {
  const origin = String(req.headers.origin || "");
  const out = (status, obj) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (SITE.test(origin)) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
    res.setHeader("Access-Control-Allow-Headers", "content-type, x-sleeper-token");
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.end(JSON.stringify(obj));
  };
  if (req.method === "OPTIONS") return out(204, {});
  if (req.method !== "POST") return out(405, { error: "POST only" });
  if (!SITE.test(origin)) return out(403, { error: "Only the FFU app can use this." });
  const b = await body(req), op = String(b.op || ""), def = OPS[op], vars = b.variables || {};
  if (!def) return out(400, { error: "That action isn't supported." });
  if (!valid(op, vars)) return out(400, { error: "That request doesn't look right." });
  const token = String(req.headers["x-sleeper-token"] || "");
  if (!def.anon && (!token || token.length > 4000)) return out(401, { error: "Connect your Sleeper account first.", code: "unauthorized" });
  const headers = { accept: "application/json", "content-type": "application/json", origin: "https://sleeper.com", referer: "https://sleeper.com/",
    "user-agent": "FFU Command Center (+https://fantasyfootballuniverse.com)", "x-sleeper-graphql-op": op };
  if (!def.anon) headers.authorization = token;
  // one line per call for troubleshooting: the operation, Sleeper's status and the time taken (never the token or the body)
  const t0 = Date.now(), note = (st, extra) => console.log(`sleeper ${op} -> ${st} in ${Date.now() - t0}ms${extra ? " " + extra : ""}`);
  let r; const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 12000);
  try { r = await fetch(GQL, { method: "POST", headers, body: JSON.stringify({ operationName: op, variables: vars, query: def.q }), signal: ctl.signal }); }
  catch (e) { note("network", e.name); return out(504, { error: e.name === "AbortError" ? "Sleeper took too long to answer. Try again in a minute." : "Couldn't reach Sleeper. Try again in a minute." }); }
  finally { clearTimeout(timer); }
  const text = await r.text(); let j = {};
  try { j = text ? JSON.parse(text) : {}; } catch { note(r.status, "non-json " + (r.headers.get("content-type") || "")); return out(502, { error: `Sleeper answered with something unexpected (HTTP ${r.status}).` }); }
  note(r.status, (j.errors || [])[0] ? "error " + String((j.errors[0].code || j.errors[0].message || "")).slice(0, 60) : "");
  const err = (j.errors || [])[0];
  if (r.status === 401 || (err && err.code === "unauthorized")) return out(401, { error: "Sleeper signed you out. Connect again.", code: "unauthorized" });
  if (r.status === 429) return out(429, { error: "Sleeper is rate-limiting. Wait a minute and try again." });
  if (err) return out(422, { error: err.message || "Sleeper refused that.", code: err.code || null });
  if (!r.ok) return out(502, { error: `Sleeper error (HTTP ${r.status}).` });
  return out(200, { data: (j.data || {})[op] ?? null });
};

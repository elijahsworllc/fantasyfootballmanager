// GET /api/app/pulse: the trade market right now, from the FFU trade database, for the Trade Optimizer's market panel.
// today: every dynasty/keeper trade in the last 24 hours (newest first, max 60) with its league shape;
// vol: how many times each player was traded in the last 7 days, per league shape ("sf" or "oneqb").
// Players and picks only: no league names, no user ids.
const { appEndpoint, sb, sbAll } = require("../ffu.js");
const shapeOf = l => (l && l.qbs === 2 ? "sf" : "oneqb");
module.exports = appEndpoint(async (req, out) => {
  const now = Date.now(), since = encodeURIComponent(new Date(now - 7 * 864e5).toISOString());
  const rows = await sbAll(`/rest/v1/ffu_trades?select=id,league_id,ts,rids,adds,picks&ts=gte.${since}&order=ts.desc`, 15000);
  const lids = [...new Set(rows.map(r => r.league_id))], L = {};
  for (let i = 0; i < lids.length; i += 120) {
    const part = lids.slice(i, i + 120).map(encodeURIComponent).join(",");
    for (const l of await sb(`/rest/v1/ffu_leagues?select=league_id,type,teams,qbs,tep&league_id=in.(${part})`)) L[l.league_id] = l;
  }
  const vol = { sf: {}, oneqb: {} }, today = []; let n24 = 0;
  for (const t of rows) {
    const lg = L[t.league_id]; if (!lg || !lg.type || !t.rids || t.rids.length !== 2) continue;   // dynasty and keeper only
    const sh = shapeOf(lg), side = { [t.rids[0]]: [], [t.rids[1]]: [] };
    for (const [pid, rid] of Object.entries(t.adds || {})) if (side[rid]) { side[rid].push(pid); vol[sh][pid] = (vol[sh][pid] || 0) + 1; }
    for (const pk of t.picks || []) if (side[pk.to]) side[pk.to].push(`K${pk.season}-${pk.round}`);
    const A = side[t.rids[0]], B = side[t.rids[1]], ts = Date.parse(t.ts);
    if (!A.length || !B.length || ts < now - 864e5) continue;
    n24++; if (today.length < 60) today.push({ ts, sh, teams: lg.teams || null, tep: lg.tep || 0, A, B });
  }
  out(200, { built: now, n24, n7: rows.length, today, vol }, { "Cache-Control": "public, max-age=600, s-maxage=1200, stale-while-revalidate=7200" });
});

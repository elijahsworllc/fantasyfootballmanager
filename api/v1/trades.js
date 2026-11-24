// GET /api/v1/trades?player={id} | owner={userId} | league={id} [&limit=50]
const { endpoint, send, sb, okId } = require("../_lib/ffu.js");
module.exports = endpoint(async (req, res, ctx) => {
  const q = req.query || {}, limit = Math.min(200, Math.max(1, parseInt(q.limit, 10) || 50)), sel = "id,league_id,ts,rids,owners,adds,picks";
  let rows;
  if (q.player) { if (!okId(q.player)) return send(res, 400, { error: "Bad player id." }); rows = await sb("/rest/v1/rpc/ffu_trades_with_player", { method: "POST", body: { p_id: String(q.player), p_limit: limit } }); }
  else if (q.owner) { if (!okId(q.owner)) return send(res, 400, { error: "Bad user id." }); rows = await sb(`/rest/v1/ffu_trades?select=${sel}&owners=cs.{${q.owner}}&order=ts.desc&limit=${limit}`); }
  else if (q.league) { if (!okId(q.league)) return send(res, 400, { error: "Bad league id." }); rows = await sb(`/rest/v1/ffu_trades?select=${sel}&league_id=eq.${q.league}&order=ts.desc&limit=${limit}`); }
  else return send(res, 400, { error: "Filter by player, owner or league." });
  send(res, 200, { meta: { count: rows.length, limit }, data: rows.map(t => ({ id: t.id, league: t.league_id, at: t.ts, sides: (t.rids || []).map((r, i) => ({ roster: r, owner: (t.owners || [])[i] || null,
    gets: { players: Object.entries(t.adds || {}).filter(([, to]) => to === r).map(([p]) => p), picks: (t.picks || []).filter(pk => pk.to === r).map(pk => `${pk.season}-${pk.round}`) } })) })) }, { ...ctx.limits, "Cache-Control": "private, max-age=300" });
});

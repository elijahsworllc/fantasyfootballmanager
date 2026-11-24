// GET /api/v1/managers/{sleeperUserId}
const { endpoint, send, sb, okId } = require("../../_lib/ffu.js");
const CATS = ["QB", "RB", "WR", "TE", "Picks"];
module.exports = endpoint(async (req, res, ctx) => {
  const id = (req.query || {}).id; if (!okId(id)) return send(res, 400, { error: "Bad user id." });
  const [m] = await sb(`/rest/v1/ffu_managers?select=user_id,season,trades,profile,updated_at&user_id=eq.${encodeURIComponent(id)}`);
  if (!m) return send(res, 404, { error: "No trades from that manager in the FFU database yet." });
  const p = m.profile || {}, shares = a => Object.fromEntries(CATS.map((c, i) => [c, (a || [])[i] || 0]));
  send(res, 200, { data: { userId: m.user_id, season: m.season, trades: m.trades, leagues: p.leagues, partners: p.partners,
    lastTrade: p.lastDay ? new Date(p.lastDay * 864e5).toISOString().slice(0, 10) : null,
    pricing: p.pricing == null ? null : { medianGap: p.pricing / 1000, trades: p.pricedN, note: "Positive = gives more value than they get, each trade valued on its own day" },
    buys: shares(p.buy), sells: shares(p.sell), buyingTopPosition: p.buyPricing ? { medianGap: p.buyPricing[0] / 1000, trades: p.buyPricing[1] } : null,
    updated: m.updated_at } }, { ...ctx.limits, "Cache-Control": "private, max-age=600" });
});

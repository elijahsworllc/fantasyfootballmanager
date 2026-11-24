// GET /api/v1/players/{sleeperId}?shape=sf|oneqb[&days=90]
const { endpoint, send, sb, shapeOf, okId, ATTR } = require("../../_lib/ffu.js");
module.exports = endpoint(async (req, res, ctx) => {
  const q = req.query || {}, id = q.id, shape = shapeOf(q), days = Math.min(730, Math.max(1, parseInt(q.days, 10) || 90));
  if (!okId(id)) return send(res, 400, { error: "Bad player id." });
  const rows = await sb(`/rest/v1/ffu_values?select=day,ffu,market,factor,n,src&asset=eq.${encodeURIComponent(id)}&shape=eq.${shape}&order=day.desc&limit=${days}`);
  if (!rows.length) return send(res, 404, { error: "No FFU value for that player." });
  send(res, 200, { meta: { asset: id, shape, days: rows.length, attribution: ATTR }, data: rows }, { ...ctx.limits, "Cache-Control": "private, max-age=300" });
});

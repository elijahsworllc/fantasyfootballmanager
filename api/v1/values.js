// GET /api/v1/values?shape=sf|oneqb[&day=YYYY-MM-DD][&src=trades,market,experts]
const { fieldsFor, endpoint, send, sb, sbAll, shapeOf, ATTR } = require("../_lib/ffu.js");
module.exports = endpoint(async (req, res, ctx) => {
  const q = req.query || {}, shape = shapeOf(q);
  let day = /^\d{4}-\d{2}-\d{2}$/.test(q.day || "") ? q.day : null;
  if (!day) { const [r] = await sb(`/rest/v1/ffu_values?select=day&shape=eq.${shape}&order=day.desc&limit=1`); day = r ? r.day : null; }
  if (!day) return send(res, 404, { error: "No values published yet." });
  const src = String(q.src || "trades,market").split(",").filter(s => ["trades", "market", "experts"].includes(s));
  const rows = await sbAll(`/rest/v1/ffu_values?select=asset,ffu,market,factor,n,src&shape=eq.${shape}&day=eq.${day}&src=in.(${src.join(",")})&order=ffu.desc`);
  send(res, 200, { meta: { day, shape, count: rows.length, src, attribution: ATTR }, data: rows.map(fieldsFor(ctx.plan)) }, { ...ctx.limits, "Cache-Control": "private, max-age=300" });
});

// GET /api/app/market?leagues=a,b,c: the nightly transaction cache, only for the leagues asked about (max 150)
const { appEndpoint, storeJSON, idList } = require("../ffu.js");
module.exports = appEndpoint(async (req, out) => {
  const ids = idList((req.query || {}).leagues, 150); if (!ids.length) return out(400, { error: "leagues=id,id,... required" });
  const m = await storeJSON("market.json"), want = new Set(ids), leagues = {};
  for (const id of ids) if (m.leagues && m.leagues[id]) leagues[id] = m.leagues[id];
  out(200, { built: m.built, season: m.season, week: m.week, leagues, tx: (m.tx || []).filter(t => want.has(t.lid)) }, { "Cache-Control": "public, max-age=600, s-maxage=1800, stale-while-revalidate=21600" });
});

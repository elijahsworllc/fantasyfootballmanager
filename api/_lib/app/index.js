// GET /api/app/index: the FFU Index (values fitted only on real trades) for the Trade Optimizer's market signals.
// Only the value maps are sent; the scorecard stays private.
const { appEndpoint, storeJSON } = require("../ffu.js");
module.exports = appEndpoint(async (req, out) => {
  const x = await storeJSON("ffu-index.json");
  out(200, x ? { built: x.built, sf: x.sf || {}, oneqb: x.oneqb || {} } : null, { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" });
});

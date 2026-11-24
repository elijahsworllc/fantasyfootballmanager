// GET /api/app/inhouse: the app's in-house value factors (private store, cached at the edge)
const { appEndpoint, storeJSON } = require("../_lib/ffu.js");
module.exports = appEndpoint(async (req, out) => out(200, await storeJSON("inhouse.json"), { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" }));

// GET /api/app/dp: expert (DynastyProcess) second-opinion values for players the market doesn't price
const { appEndpoint, storeJSON } = require("../ffu.js");
module.exports = appEndpoint(async (req, out) => out(200, await storeJSON("dp.json"), { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" }));

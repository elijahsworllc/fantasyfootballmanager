// /api/app/<name>: one function for every private app endpoint, so the deployment stays within the
// Hobby plan's 12-function limit. Each handler lives in api/_lib/app/ (underscore folders don't deploy).
const H = {
  dp: require("../_lib/app/dp.js"),            // GET  expert second-opinion values
  index: require("../_lib/app/index.js"),      // GET  FFU Index value maps
  inhouse: require("../_lib/app/inhouse.js"),  // GET  in-house value factors
  managers: require("../_lib/app/managers.js"),// POST league-mate trade profiles
  market: require("../_lib/app/market.js")     // GET  nightly transaction cache
};
module.exports = (req, res) => {
  const h = H[String((req.query || {}).name || "")];
  if (h) return h(req, res);
  res.statusCode = 404; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Not found" }));
};

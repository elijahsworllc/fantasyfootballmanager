// GET /api/v1 — what the API offers and how fresh the data is (no key needed)
const { endpoint, send, sb, VERSION, ATTR, configured } = require("../_lib/ffu.js");
module.exports = endpoint(async (req, res) => {
  let latest = null;
  if (configured()) { try { const [r] = await sb("/rest/v1/ffu_values?select=day&order=day.desc&limit=1"); latest = r ? r.day : null; } catch {} }
  send(res, 200, { name: "FFU data API", version: VERSION, live: configured(), latestValues: latest,
    endpoints: {
      "GET /api/v1/values?shape=sf|oneqb[&day=YYYY-MM-DD][&src=trades,market]": "Daily FFU value for every player and pick",
      "GET /api/v1/players/{sleeperId}?shape=sf|oneqb[&days=90]": "One player's FFU value history",
      "GET /api/v1/managers/{sleeperUserId}": "How a manager trades: activity, what they buy and sell, how they price trades",
      "GET /api/v1/trades?player={id}|owner={userId}|league={id}[&limit=50]": "Recent completed trades from the FFU database",
      "GET /api/v1/usage": "Your key's plan, today's calls and the last 30 days",
      "POST /api/v1/signup": "Request a free key (or use the form at /developers.html#key)" },
    auth: "Send your key in the x-api-key header. Limits are per key per day (UTC).", attribution: ATTR, docs: "/developers.html" }, { "Cache-Control": "public, s-maxage=300" });
}, { open: true });

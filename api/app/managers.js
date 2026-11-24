// POST /api/app/managers {users:[sleeperUserId,...]}: FFU database trade profiles for the league-mates the app shows (max 2,000)
const { appEndpoint, readBody, sb, storeJSON, okId } = require("../_lib/ffu.js");
const PROFILE = p => [null, p.lastDay, p.leagues, p.partners, p.pricing, p.pricedN, p.buy, p.sell, p.buyPricing];
module.exports = appEndpoint(async (req, out) => {
  const body = await readBody(req), ids = [...new Set((body.users || []).map(String).filter(okId))].slice(0, 2000);
  const meta = await storeJSON("managers-meta.json").catch(() => ({})), users = {}, excluded = {};
  for (let i = 0; i < ids.length; i += 150) {
    const part = ids.slice(i, i + 150), rows = await sb(`/rest/v1/ffu_managers?select=user_id,trades,profile&user_id=in.(${part.map(encodeURIComponent).join(",")})`);
    for (const r of rows) { const p = r.profile || {};
      if (p.excluded) excluded[r.user_id] = [p.excluded.trades, p.excluded.leagues];
      else { const a = PROFILE(p); a[0] = r.trades; users[r.user_id] = a; } }
  }
  out(200, { built: meta.built || null, season: meta.season || null, trades: meta.trades || null, priced: meta.priced || null, total: meta.total || null, cats: meta.cats || ["QB", "RB", "WR", "TE", "Picks"], users, excluded }, { "Cache-Control": "private, max-age=600" });
}, { methods: ["POST"] });

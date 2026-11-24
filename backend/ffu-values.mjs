// Daily FFU values: one number per player and pick, per league shape (Superflex "sf", 1QB "oneqb").
//   FFU value = today's market price × the in-house factor (what real trades in the FFU database pay against
//   the market price; inhouse.mjs, held near ×1.00 where trades are few). Players the market doesn't price get
//   the DynastyProcess expert value mapped onto the market scale by rank, flagged src "experts".
// This is the step from "market values, adjusted" toward fully FFU-owned values: the share of total value that
// rests on 5+ trades is reported each night ("tradeBacked") so we can see when the market anchor can go.
//
// Output (data branch): ffu-values.json { day, built, method, stats, sf: {asset: [ffu, market, factor, n, src]}, oneqb: {...} }
//   assets: Sleeper player ids, picks as "2027-1" and tiers as "2027-1-early" / "-mid" / "-late"
import fs from "node:fs";
import path from "node:path";
import { readJSON, upsert, safely } from "./db.mjs";

const DIR = process.env.DATA_DIR || process.argv[2] || "data-branch";
const snaps = fs.readdirSync(path.join(DIR, "values")).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
if (!snaps.length) { console.log("no market snapshots yet"); process.exit(0); }
const day = snaps[snaps.length - 1].slice(0, 10), snap = JSON.parse(fs.readFileSync(path.join(DIR, "values", snaps[snaps.length - 1]), "utf8"));
const ih = readJSON(DIR, "inhouse.json", { players: {}, picks: {} }), dp = readJSON(DIR, "dp.json", { players: {} });
const out = { day, built: Date.now(), method: "market price × FFU in-house factor (trade-implied, ridge toward market); expert value rank-mapped for players the market doesn't price", stats: {} };

function pickAsset(k) {                   // FP_2027_1 → 2027-1 ; FP_2027_early_0 → 2027-1-early (tier keys count rounds from 0)
  let m = k.match(/^FP_(\d{4})_(\d)$/); if (m) return { asset: `${m[1]}-${m[2]}`, base: `${m[1]}-${m[2]}` };
  m = k.match(/^FP_(\d{4})_(early|mid|late)_(\d)$/); if (m) { const r = +m[3] + 1; return { asset: `${m[1]}-${r}-${m[2]}`, base: `${m[1]}-${r}` }; }
  return null;
}
for (const [shape, j] of [["sf", 1], ["oneqb", 0]]) {
  const vals = snap[shape] || {}, res = {};
  let tot = 0, backed = 0, nTrades = 0, nMarket = 0, nExperts = 0;
  for (const [k, market] of Object.entries(vals)) {
    if (!(market > 0)) continue;
    const pk = k.startsWith("FP_") ? pickAsset(k) : null; if (k.startsWith("FP_") && !pk) continue;
    const f = pk ? ih.picks[pk.base] : ih.players[k], factor = f ? f.f : 1, n = f ? f.n : 0, ffu = Math.round(market * factor);
    const src = n >= 5 ? "trades" : "market"; res[pk ? pk.asset : k] = [ffu, market, +factor.toFixed(4), n, src];
    tot += ffu; if (n >= 5) { backed += ffu; nTrades++; } else nMarket++;
  }
  // expert values for players the market doesn't price, mapped onto this shape's market scale by rank
  const both = Object.entries(dp.players || {}).filter(([id, e]) => e[j] > 0 && vals[id] > 0).map(([id, e]) => [e[j], vals[id]]);
  if (both.length >= 50) {
    const xs = both.map(b => b[0]).sort((a, b) => a - b), ys = both.map(b => b[1]).sort((a, b) => a - b);
    const map = d => { let lo = 0, hi = xs.length; while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] < d) lo = m + 1; else hi = m; }
      if (lo <= 0) return ys[0] * d / xs[0]; if (lo >= xs.length) return ys[ys.length - 1] * d / xs[xs.length - 1];
      const t = (d - xs[lo - 1]) / ((xs[lo] - xs[lo - 1]) || 1); return ys[lo - 1] + t * (ys[lo] - ys[lo - 1]); };
    for (const [id, e] of Object.entries(dp.players)) if (!res[id] && e[j] > 0) { res[id] = [Math.round(map(e[j])), null, 1, 0, "experts"]; nExperts++; }
  }
  out[shape] = res;
  out.stats[shape] = { assets: Object.keys(res).length, tradeBackedAssets: nTrades, marketOnly: nMarket, expertsOnly: nExperts, tradeBacked: tot ? +(backed / tot).toFixed(3) : 0 };
}
fs.writeFileSync(path.join(DIR, "ffu-values.json"), JSON.stringify(out));
await safely("database: daily values", async () => {
  const rows = []; for (const shape of ["sf", "oneqb"]) for (const [asset, v] of Object.entries(out[shape])) rows.push({ day, shape, asset, ffu: v[0], market: v[1], factor: v[2], n: v[3], src: v[4] });
  return `${await upsert("ffu_values", rows, { onConflict: "day,shape,asset" })} rows for ${day}`;
});
const s = out.stats;
console.log(`ffu-values.json (${day}): sf ${s.sf.assets} assets, ${Math.round(s.sf.tradeBacked * 100)}% of value trade-backed; 1QB ${s.oneqb.assets} assets, ${Math.round(s.oneqb.tradeBacked * 100)}% trade-backed; ${s.sf.expertsOnly} expert-only`);

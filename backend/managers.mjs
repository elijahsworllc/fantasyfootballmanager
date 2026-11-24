// Manager profiles (FFU database): how each person trades, across every league we've crawled.
// For every completed two-team trade with known roster owners, each side is valued with the market snapshot
// from the trade's own day (values/YYYY-MM-DD.json, Superflex or 1QB by league), so later value swings don't
// count against them. Redraft trades count toward activity and what they buy/sell, but not pricing.
//
// Output (data branch): managers.json
//   { built, season, trades, users: { userId: [n, lastDay, leagues, partners, pricing, pricedN, buy[5], sell[5], buyPricing] } }
//   n: trades this season · lastDay: days since epoch of the latest · leagues/partners: distinct counts
//   pricing: median of (sent - received) / bigger side, ×1000, positive = gives more than they get (null if none priced)
//   buy/sell: value shares in % for [QB, RB, WR, TE, Picks] · buyPricing: [median ×1000, n] on trades where their top buy came in
import fs from "node:fs";
import path from "node:path";
import { getJSON } from "./sleeper.mjs";
import { readJSON, upsert, safely } from "./db.mjs";
import { tradeFilter, lopsided } from "./clean.mjs";

const DIR = process.env.DATA_DIR || process.argv[2] || "data-branch";
const P = 1.45, FLOOR_SHARE = 0.5, CATS = ["QB", "RB", "WR", "TE", "Picks"];
const read = (f, d) => readJSON(DIR, f, d);

const market = read("market.json", { leagues: {}, tx: [] }), crawled = read("trades-db.json", { leagues: {}, owners: {}, trades: [] });
const owners = crawled.owners || {};
if (process.env.FAKE_OWNERS) for (const t of market.tx.concat(crawled.trades)) for (const r of t.rids || []) ((owners[t.lid] ||= {})[r] ||= `${t.lid}:${r}`); // local testing only
const shapes = { ...crawled.leagues, ...market.leagues };

// positions: Sleeper's player list, falling back to the calibration inputs if the API is unreachable
const pos = {};
try { const pl = await getJSON("/v1/players/nfl"); for (const [id, p] of Object.entries(pl || {})) if (p && p.position) pos[id] = p.position; }
catch (e) { console.log("players list unavailable:", e.message); }
if (!Object.keys(pos).length) { const c = read("calib-inputs.json", {}); for (const lst of Object.values(c.fc || {})) for (const p of lst) pos[p.id] = p.pos; for (const wk of Object.values(c.proj || {})) for (const [id, p] of Object.entries(wk)) pos[id] ||= p.pos; }

const snapFiles = fs.readdirSync(path.join(DIR, "values")).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(), snapDays = snapFiles.map(f => f.slice(0, 10)), snapCache = new Map();
function snapFor(ts) { const d = new Date(ts).toISOString().slice(0, 10); let i = 0; while (i < snapDays.length - 1 && snapDays[i + 1] <= d) i++;
  if (!snapCache.has(i)) snapCache.set(i, JSON.parse(fs.readFileSync(path.join(DIR, "values", snapFiles[i]), "utf8"))); return snapCache.get(i); }
const floorOf = new Map(), floor = vals => { if (!floorOf.has(vals)) { const v = Object.values(vals).filter(x => x > 0).sort((a, b) => a - b); floorOf.set(vals, (v[0] || 50) * FLOOR_SHARE); } return floorOf.get(vals); };
const pm = S => Math.pow(S.reduce((s, x) => s + Math.pow(x, P), 0), 1 / P);
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

const all = new Map(); for (const t of market.tx.concat(crawled.trades)) if (t.type === "trade" && (!t.status || t.status === "complete") && !all.has(t.id)) all.set(t.id, t);
const U = new Map(), get = uid => { if (!U.has(uid)) U.set(uid, { n: 0, last: 0, lg: new Set(), pt: new Set(), prem: [], recv: [0, 0, 0, 0, 0], sent: [0, 0, 0, 0, 0], byBuy: {} }); return U.get(uid); };
let used = 0, priced = 0, dropEx = 0, dropLop = 0; const CL = tradeFilter(DIR);
for (const t of all.values()) {
  if (!t.rids || t.rids.length !== 2 || !snapDays.length) continue;
  if (!CL.keep(t)) { dropEx++; continue; }
  const own = owners[t.lid]; if (!own) continue;
  const [ra, rb] = t.rids, ua = own[ra], ub = own[rb]; if (!ua || !ub || ua === ub) continue;
  const meta = shapes[t.lid] || {}, dyn = meta.type !== 0, vals = snapFor(t.ts)[meta.qbs === 2 ? "sf" : "oneqb"] || {}, fl = floor(vals);
  const side = { [ra]: { got: [], cats: [0, 0, 0, 0, 0], real: 0 }, [rb]: { got: [], cats: [0, 0, 0, 0, 0], real: 0 } };
  for (const [pid, rid] of Object.entries(t.adds || {})) { const s = side[rid]; if (!s) continue; const v = vals[pid] > 0 ? vals[pid] : fl, c = CATS.indexOf(pos[pid]); s.got.push(v); if (vals[pid] > 0) s.real++; if (c >= 0) s.cats[c] += v; }
  for (const pk of t.picks || []) { const s = side[pk.to]; if (!s) continue; const k = `FP_${pk.season}_${pk.round}`, v = vals[k] > 0 ? vals[k] : fl; s.got.push(v); if (vals[k] > 0) s.real++; s.cats[4] += v; }
  if (!side[ra].got.length || !side[rb].got.length) continue;
  used++;
  let canPrice = dyn && side[ra].real && side[rb].real;
  if (canPrice) { const ga = pm(side[ra].got), gb = pm(side[rb].got); if (lopsided(Math.abs(ga - gb) / Math.max(ga, gb))) { canPrice = false; dropLop++; } }   // still counts as activity, not pricing
  if (canPrice) priced++;
  for (const [me, them, uid, other] of [[ra, rb, ua, ub], [rb, ra, ub, ua]]) {
    const u = get(uid), g = side[me], s = side[them];
    u.n++; u.last = Math.max(u.last, t.ts || 0); u.lg.add(t.lid); u.pt.add(other);
    g.cats.forEach((v, i) => { u.recv[i] += v; }); s.cats.forEach((v, i) => { u.sent[i] += v; });
    if (canPrice) { const G = pm(g.got), Sv = pm(s.got), gap = (Sv - G) / Math.max(G, Sv); u.prem.push(gap);
      const top = g.cats.indexOf(Math.max(...g.cats)); if (g.cats[top] > 0) (u.byBuy[top] ||= []).push(gap); }
  }
}
const share = a => { const s = a.reduce((x, y) => x + y, 0); return s ? a.map(v => Math.round(v / s * 100)) : [0, 0, 0, 0, 0]; };
const users = {};
for (const [uid, u] of U) {
  const buy = share(u.recv), top = buy.indexOf(Math.max(...buy)), bp = u.byBuy[top] || [];
  users[uid] = [u.n, Math.floor(u.last / 864e5), u.lg.size, u.pt.size, u.prem.length ? Math.round(median(u.prem) * 1000) : null, u.prem.length, buy, share(u.sent), bp.length ? [Math.round(median(bp) * 1000), bp.length] : null];
}
const exf = readJSON(DIR, "excluded.json", { users: {} });
const excluded = Object.fromEntries(Object.entries(exf.users || {}).map(([u, x]) => [u, [x.trades, x.leagues]]));
const out = { built: Date.now(), season: crawled.season || market.season, trades: used, priced, cats: CATS, users, excluded, cleaning: { excludedTrades: dropEx, lopsidedUnpriced: dropLop } };
fs.writeFileSync(path.join(DIR, "managers.json"), JSON.stringify(out));
fs.writeFileSync(path.join(DIR, "managers-meta.json"), JSON.stringify({ built: out.built, season: out.season, trades: used, priced, total: Object.keys(users).length, excluded: Object.keys(excluded).length, cats: CATS }));
await safely("database: manager profiles", async () => {
  const season = +(out.season || new Date().getFullYear()), now = new Date().toISOString();
  const rows = Object.entries(users).map(([user_id, u]) => ({ user_id, season, trades: u[0], profile: { lastDay: u[1], leagues: u[2], partners: u[3], pricing: u[4], pricedN: u[5], buy: u[6], sell: u[7], buyPricing: u[8] }, updated_at: now }));
  // excluded accounts get a row too, so the app and partners can see why a busy account has no profile
  for (const [user_id, x] of Object.entries(excluded)) if (!users[user_id]) rows.push({ user_id, season, trades: 0, profile: { excluded: { trades: x[0], leagues: x[1] } }, updated_at: now });
  return `${await upsert("ffu_managers", rows, { onConflict: "user_id" })} upserted`;
});
console.log(`managers.json: ${Object.keys(users).length} managers from ${used} trades (${priced} priced at trade-day values); owners known for ${Object.keys(owners).length} leagues`);

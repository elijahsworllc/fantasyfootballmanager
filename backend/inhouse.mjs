// In-house market values (FFU): what players are worth according to the trades people actually make.
//
// Model. Every asset i (player, or a pick class like "2027 1st") gets a factor a_i, a log-multiplier on
// the market price on the day of the trade:  value_i(t) = market_i(t) * exp(a_i).
// A trade is fair when both sides are worth the same after the stud premium:
//     r_t = log pm(side A) - log pm(side B) ~ 0,   pm(S) = (sum v^p)^(1/p)
// We pick the factors that make real trades as fair as possible, with a pull toward 0 (the market price)
// that fades as an asset shows up in more trades:
//     minimize  sum_t w_t * huber(r_t)  +  lambda * sum_i a_i^2
// w_t halves every HALF_LIFE days, so recent trades count more. Huber loss limits the pull of lopsided
// trades (dumps, collusion). Players without a market price get a small floor price.
// Held-out check: the last 20% of trades (by date) are not used for fitting; we report how much fairer
// they look with in-house values than with market values alone.
//
// Input (data branch): market.json (trades + league shapes), values/YYYY-MM-DD.json (daily market snapshots).
// Output: inhouse.json  { built, method, fit, holdout, players: {id: {f, n}}, picks: {"2027-1": {f, n}} }
import fs from "node:fs";
import path from "node:path";
import { readJSON } from "./db.mjs";

const DIR = process.env.DATA_DIR || process.argv[2] || "data-branch";
const P = 1.45, HALF_LIFE = 90, HUBER = 0.35, FLOOR_SHARE = 0.5, CLAMP = 0.7;
const LAMBDAS = [0.5, 1, 2, 4, 8, 16, 32, 64];   // 16 was the best at the top of the old grid (Nov 23), so the grid goes higher

const market = JSON.parse(fs.readFileSync(path.join(DIR, "market.json"), "utf8"));
const snapFiles = fs.readdirSync(path.join(DIR, "values")).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const snapDays = snapFiles.map(f => f.slice(0, 10));
const snapCache = new Map();
function snapFor(ts) {
  const d = new Date(ts).toISOString().slice(0, 10);
  let i = 0; while (i < snapDays.length - 1 && snapDays[i + 1] <= d) i++;
  if (!snapCache.has(i)) snapCache.set(i, JSON.parse(fs.readFileSync(path.join(DIR, "values", snapFiles[i]), "utf8")));
  return snapCache.get(i);
}
const floorOf = vals => { const v = Object.values(vals).filter(x => x > 0).sort((a, b) => a - b); return (v[0] || 50) * FLOOR_SHARE; };

// ---- build trades: each side is a list of {key, price}
// the user's own leagues (market.json) plus every crawled league (trades-db.json), deduplicated
let crawled = { leagues: {}, trades: [] };
crawled = readJSON(DIR, "trades-db.json", null) || (console.log("no trades-db.json yet: own leagues only"), crawled);
const shapes = { ...crawled.leagues, ...market.leagues };
const all = new Map(); for (const t of market.tx.concat(crawled.trades)) if (t.type === "trade" && !all.has(t.id)) all.set(t.id, t);
const trades = [];
for (const t of all.values()) {
  if (!t.rids || t.rids.length !== 2) continue;
  const meta = shapes[t.lid] || {}; if (meta.type === 0) continue;               // redraft trades don't price dynasty value
  const shape = meta.qbs === 2 ? "sf" : "oneqb";
  const snap = snapFor(t.ts); const vals = snap[shape]; if (!vals) continue;
  const floor = floorOf(vals); const sides = { [t.rids[0]]: [], [t.rids[1]]: [] };
  for (const [pid, rid] of Object.entries(t.adds || {})) if (sides[rid]) sides[rid].push({ key: "P:" + pid, price: vals[pid] > 0 ? vals[pid] : floor, priced: vals[pid] > 0 });
  for (const pk of t.picks || []) if (sides[pk.to]) { const k = `FP_${pk.season}_${pk.round}`; sides[pk.to].push({ key: `K:${pk.season}-${pk.round}`, price: vals[k] > 0 ? vals[k] : floor, priced: vals[k] > 0 }); }
  const A = sides[t.rids[0]], B = sides[t.rids[1]];
  if (!A.length || !B.length || !A.some(x => x.priced) || !B.some(x => x.priced)) continue;   // need a real price on each side
  trades.push({ ts: t.ts, A, B, shape });
}
trades.sort((a, b) => a.ts - b.ts);
const now = Date.now();
for (const t of trades) t.w = Math.pow(0.5, (now - t.ts) / 864e5 / HALF_LIFE);

// ---- fit
const logpm = (S, a) => { let s = 0; for (const x of S) s += Math.pow(x.price * Math.exp(a.get(x.key) || 0), P); return Math.log(s) / P; };
function fit(train, lambda, iters = 400) {
  const a = new Map(), m = new Map(), v = new Map(); const lr = 0.03, b1 = 0.9, b2 = 0.999;
  for (let it = 1; it <= iters; it++) {
    const g = new Map();
    for (const t of train) {
      const r = logpm(t.A, a) - logpm(t.B, a);
      const dr = Math.abs(r) <= HUBER ? r : HUBER * Math.sign(r);               // huber derivative
      for (const [S, sgn] of [[t.A, 1], [t.B, -1]]) {
        let tot = 0; const vp = S.map(x => { const q = Math.pow(x.price * Math.exp(a.get(x.key) || 0), P); tot += q; return q; });
        S.forEach((x, i) => g.set(x.key, (g.get(x.key) || 0) + 2 * t.w * dr * sgn * vp[i] / tot));
      }
    }
    for (const [k, gk] of g) {
      const ak = a.get(k) || 0, grad = gk + 2 * lambda * ak;
      const mk = b1 * (m.get(k) || 0) + (1 - b1) * grad, vk = b2 * (v.get(k) || 0) + (1 - b2) * grad * grad;
      m.set(k, mk); v.set(k, vk);
      const step = lr * (mk / (1 - Math.pow(b1, it))) / (Math.sqrt(vk / (1 - Math.pow(b2, it))) + 1e-8);
      a.set(k, Math.max(-CLAMP, Math.min(CLAMP, ak - step)));
    }
  }
  return a;
}
const absGap = (t, a) => { const x = Math.exp(logpm(t.A, a)), y = Math.exp(logpm(t.B, a)); return Math.abs(x - y) / Math.max(x, y, 1); };
const median = xs => { const s = xs.slice().sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const mean = xs => xs.reduce((s, x) => s + x, 0) / Math.max(xs.length, 1);

// time-ordered split: tune lambda on the end of the training window, then score on trades never used for tuning
const cut = Math.floor(trades.length * 0.8), train = trades.slice(0, cut), test = trades.slice(cut);
const vcut = Math.floor(train.length * 0.8), tune = train.slice(0, vcut), val = train.slice(vcut);
const none = new Map();
let best = null; const tried = [];
for (const lambda of LAMBDAS) {
  const a = fit(tune, lambda); const g = val.map(t => absGap(t, a));
  const row = { lambda, valMean: +mean(g).toFixed(4) }; tried.push(row);
  if (!best || row.valMean < best.valMean) best = row;
}
const aT = fit(train, best.lambda), gT = test.map(t => absGap(t, aT)), g0 = test.map(t => absGap(t, none));
const base = { median: median(g0), mean: mean(g0) }; best.median = median(gT); best.mean = mean(gT);
const better = test.filter((t, i) => gT[i] < g0[i] - 0.005).length, worse = test.filter((t, i) => gT[i] > g0[i] + 0.005).length;
console.log(`trades usable: ${trades.length} (tune ${tune.length}, validate ${val.length}, held out ${test.length})`);
for (const r of tried) console.log(`  lambda ${r.lambda}: validation mean |gap| ${(r.valMean * 100).toFixed(1)}%`);
console.log(`held-out (never used): market median ${(base.median*100).toFixed(1)}% mean ${(base.mean*100).toFixed(1)}%  ->  in-house median ${(best.median*100).toFixed(1)}% mean ${(best.mean*100).toFixed(1)}%  (fairer on ${better}, less fair on ${worse} of ${test.length})`);

// ---- final fit on every trade with the best lambda, and publish
const a = fit(trades, best.lambda, 500);
const count = new Map(); for (const t of trades) for (const x of t.A.concat(t.B)) count.set(x.key, (count.get(x.key) || 0) + 1);
const players = {}, picks = {};
for (const [k, f] of a) {
  const n = count.get(k) || 0; if (!n || Math.abs(f) < 0.005) continue;
  const e = { f: +Math.exp(f).toFixed(4), n };
  if (k.startsWith("P:")) players[k.slice(2)] = e; else picks[k.slice(2)] = e;
}
const out = {
  built: now, method: "trade-implied factor on market price; huber loss; ridge toward market; 90-day half-life",
  fit: { p: P, lambda: best.lambda, halfLife: HALF_LIFE, huber: HUBER, clamp: [+Math.exp(-CLAMP).toFixed(3), +Math.exp(CLAMP).toFixed(3)], trades: trades.length, leagues: new Set([...all.values()].map(t => t.lid)).size, ownLeagues: Object.keys(market.leagues).length },
  holdout: { trades: test.length, marketMedian: +base.median.toFixed(4), marketMean: +base.mean.toFixed(4), inhouseMedian: +best.median.toFixed(4), inhouseMean: +best.mean.toFixed(4), fairer: better, lessFair: worse, tried },
  players, picks
};
fs.writeFileSync(path.join(DIR, "inhouse.json"), JSON.stringify(out));
console.log(`inhouse.json: ${Object.keys(players).length} players and ${Object.keys(picks).length} pick classes adjusted (lambda ${best.lambda}); held-out mean |gap| ${(base.mean * 100).toFixed(1)}% -> ${(best.mean * 100).toFixed(1)}%`);

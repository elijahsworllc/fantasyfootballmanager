// FFU Index: player and pick values fitted ONLY on real trades in the FFU database (no outside prices).
//
// Each asset gets a log value θ = baseline(position, age, experience; pick round and year) + its own trade
// evidence δ, plus format offsets by position (Superflex, TE premium, league size, 6-pt pass TDs). Values are chosen so real trades come out as even as possible
// (Huber loss on log power-mean gap, P = 1.45, 30-day half-life, a 30-day trend per asset, format offsets by position), with a ridge pulling δ toward the baseline,
// so players with few trades lean on players like them. Scale is arbitrary (power means are scale-free), so the
// index is pinned to our own anchor: the mean of the top 24 Superflex assets = 9,000.
//
// Scorecard: trades are split by time; the newest 20% are never used for fitting. On them (static fit, and walk-forward:
// refit weekly on everything before each week, the way nightly values are really used) we compare
//   market    = FantasyCalc price on the trade's day (what most sites use)
//   anchored  = market × FFU in-house factor (today's FFU values; same fitting code)
//   index     = this model
// using the median and mean |gap| of real trades (lower = explains what managers actually pay better).
// The index replaces the market anchor only when it wins on held-out trades (the "gate").
//
// Output (data branch): ffu-index.json { built, method, scorecard, gate, sf: {asset: [value, n]}, oneqb: {...} }
import fs from "node:fs";
import path from "node:path";
import { getJSON } from "./sleeper.mjs";
import { readJSON } from "./db.mjs";
import { tradeFilter, lopsided } from "./clean.mjs";

const DIR = process.env.DATA_DIR || process.argv[2] || "data-branch";
const SLOPE = +(process.env.INDEX_SLOPE ?? 2);   // ridge on each asset's 30-day trend (0 = off). Nov 24, walk-forward: trends cut the mean gap 17.3% -> 16.2%
const P = 1.45, HUBER = 0.35, HALF_LIFE = +(process.env.INDEX_HALF_LIFE || 30),   // index memory: 30-day half-life (Nov 24, walk-forward: 30 beat 45 and 90)
  FLOOR_SHARE = 0.5, ITERS = +(process.env.INDEX_ITERS || 350);
const CATS = ["QB", "RB", "WR", "TE", "PK"];
const market = readJSON(DIR, "market.json", { leagues: {}, tx: [] }), crawled = readJSON(DIR, "trades-db.json", { leagues: {}, trades: [] });
const shapes = { ...crawled.leagues, ...market.leagues };

// ---- player attributes (facts only: position, age, years in the league, NFL draft slot)
const attr = {}, season = +(crawled.season || market.season || new Date().getFullYear()), yrs = d => (Date.now() - Date.parse(d)) / (365.25 * 864e5);
const facts = readJSON(DIR, "player-facts.json", { players: {} }).players || {};
for (const [id, f] of Object.entries(facts)) attr[id] = { pos: f[0], age: f[1] ? yrs(f[1]) : null, exp: f[2] ? season - f[2] : null, ovr: f[3] ?? (f[2] ? 999 : null) };
try { const pl = await getJSON("/v1/players/nfl"); for (const [id, p] of Object.entries(pl || {})) if (p && p.position) { const a = attr[id] ||= { pos: p.position, age: null, exp: null, ovr: null }; a.age ??= p.age ?? null; a.exp ??= p.years_exp ?? null; } }
catch (e) { console.log("players list unavailable:", e.message); }
if (Object.keys(attr).length < 1000) { const c = readJSON(DIR, "calib-inputs.json", {}); for (const lst of Object.values(c.fc || {})) for (const p of lst) attr[p.id] = { pos: p.pos, age: p.age ?? null, exp: null };
  for (const wk of Object.values(c.proj || {})) for (const [id, p] of Object.entries(wk)) attr[id] ||= { pos: p.pos, age: null, exp: null }; }

// ---- market snapshots (only for the scorecard and the anchored comparison, never for the index itself)
const snapFiles = fs.readdirSync(path.join(DIR, "values")).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(), snapDays = snapFiles.map(f => f.slice(0, 10)), cache = new Map();
const snapFor = ts => { const d = new Date(ts).toISOString().slice(0, 10); let i = 0; while (i < snapDays.length - 1 && snapDays[i + 1] <= d) i++; if (!cache.has(i)) cache.set(i, JSON.parse(fs.readFileSync(path.join(DIR, "values", snapFiles[i]), "utf8"))); return cache.get(i); };
const floors = new Map(), floorOf = v => { if (!floors.has(v)) { const a = Object.values(v).filter(x => x > 0).sort((x, y) => x - y); floors.set(v, (a[0] || 50) * FLOOR_SHARE); } return floors.get(v); };

// ---- features: one baseline per position × age band and position × experience band; picks by round × year
const FEAT = new Map(), fid = k => { if (!FEAT.has(k)) FEAT.set(k, FEAT.size); return FEAT.get(k); };
const ageBand = a => a == null ? "na" : a <= 21 ? "21" : a >= 33 ? "33" : String(Math.floor(a));
const expBand = e => e == null ? "na" : e >= 6 ? "6" : String(Math.max(0, e));
const dcBand = o => o == null ? "na" : o <= 10 ? "1-10" : o <= 32 ? "11-32" : o <= 64 ? "33-64" : o <= 100 ? "65-100" : o <= 160 ? "101-160" : o <= 262 ? "161+" : "udfa";
const ASSET = new Map();   // key -> {i, cat, feats:[ids], n}
function asset(key) {
  if (ASSET.has(key)) return ASSET.get(key);
  let cat, feats;
  if (key.startsWith("K:")) { const [season, round] = key.slice(2).split("-").map(Number); cat = "PK"; feats = [fid(`pk:r${Math.min(round, 5)}`), fid(`pk:r${Math.min(round, 5)}:y${season}`)]; }
  else { const a = attr[key.slice(2)] || {}; cat = CATS.includes(a.pos) ? a.pos : "RB"; feats = [fid(`pos:${cat}`), fid(`age:${cat}:${ageBand(a.age)}`), fid(`exp:${cat}:${expBand(a.exp)}`), fid(`dc:${cat}:${dcBand(a.ovr)}`), fid(`dcx:${cat}:${dcBand(a.ovr)}:${a.exp == null ? "na" : Math.min(3, Math.max(0, a.exp))}`)]; }
  const o = { i: ASSET.size, key, cat, c: CATS.indexOf(cat), feats, n: 0 }; ASSET.set(key, o); return o;
}

// ---- trades: dynasty two-team trades; each side is a list of items {a: asset, lm: log market price that day}
const all = new Map(); for (const t of market.tx.concat(crawled.trades)) if (t.type === "trade" && (!t.status || t.status === "complete") && !all.has(t.id)) all.set(t.id, t);
const marketGap = t => { const L = S => { const z = S.map(x => P * x.lm), m = Math.max(...z); return (m + Math.log(z.reduce((s, v) => s + Math.exp(v - m), 0))) / P; }; return 1 - Math.exp(-Math.abs(L(t.A) - L(t.B))); };
// league format: each asset class can trade higher or lower by format. Superflex, tight-end premium (points per TE catch on top
// of PPR), league size and 6-point passing TDs, each a learned offset per position (market prices only split Superflex / 1QB)
const FMT = process.env.INDEX_FMT === "0" ? ["sf"] : ["sf", "tep", "teams", "pass6"], NFM = FMT.length;
const fmtOf = (m, sf) => [sf, +(m.tep || 0), ((m.teams || 12) - 12) / 2, m.passTd === 6 ? 1 : 0].slice(0, NFM);
const trades = [], CL = tradeFilter(DIR); let dropEx = 0, dropLop = 0;
for (const t of all.values()) {
  if (!t.rids || t.rids.length !== 2) continue;
  if (!CL.keep(t)) { dropEx++; continue; }
  const meta = shapes[t.lid] || {}; if (meta.type === 0) continue;
  const sf = meta.qbs === 2 ? 1 : 0, vals = snapFor(t.ts)[sf ? "sf" : "oneqb"] || {}, fl = floorOf(vals);
  const side = { [t.rids[0]]: [], [t.rids[1]]: [] }; let priced = { [t.rids[0]]: 0, [t.rids[1]]: 0 };
  for (const [pid, rid] of Object.entries(t.adds || {})) if (side[rid]) { const v = vals[pid]; side[rid].push({ a: asset("P:" + pid), lm: Math.log(v > 0 ? v : fl) }); if (v > 0) priced[rid]++; }
  for (const pk of t.picks || []) if (side[pk.to]) { const v = vals[`FP_${pk.season}_${pk.round}`]; side[pk.to].push({ a: asset(`K:${pk.season}-${pk.round}`), lm: Math.log(v > 0 ? v : fl) }); if (v > 0) priced[pk.to]++; }
  const A = side[t.rids[0]], B = side[t.rids[1]]; if (!A.length || !B.length) continue;
  const mk = priced[t.rids[0]] > 0 && priced[t.rids[1]] > 0, tr = { ts: t.ts, sf, fm: fmtOf(meta, sf), A, B, mk, cw: CL.weight(t) };
  if (mk && lopsided(marketGap(tr))) { dropLop++; continue; }
  trades.push(tr);
}
console.log(`cleaning: ${dropEx} trades with excluded accounts and ${dropLop} lopsided trades left out; ${CL.capped} heavy traders capped`);
trades.sort((a, b) => a.ts - b.ts);
const NA = ASSET.size, NF = FEAT.size, assets = [...ASSET.values()];

// ---- one fitting routine for both models
// mode "index":    θ_k = w·x_k + δ_k + o[sf][cat]           (no market input at all)
// mode "anchored": θ_k = log market price that day + δ_k    (today's in-house approach, for comparison)
function fit(train0, mode, lambda, iters = ITERS, hl = HALF_LIFE, init = null) {
  // the anchored comparison is fitted exactly like inhouse.mjs: only trades with a market price on each side, factors capped at e^±0.7
  const train = mode === "anchored" ? train0.filter(t => t.mk) : train0;
  const now = train.length ? train[train.length - 1].ts : Date.now();
  for (const t of train) t.w = Math.pow(0.5, (now - t.ts) / 864e5 / hl) * (t.cw ?? 1);
  const d = new Float64Array(NA), w = new Float64Array(NF), o = new Float64Array(NFM * CATS.length), sl = new Float64Array(NA);   // o: format offsets [format × category]; sl: trend per 30 days
  if (init) { d.set(init.d); w.set(init.w); o.set(init.o); }   // warm start from the previous refit (walk-forward scoring)
  const adam = n => ({ m: new Float64Array(n), v: new Float64Array(n) }), Ad = adam(NA), Aw = adam(NF), Ao = adam(NFM * CATS.length), As = adam(NA);
  const TREND = mode === "index" && SLOPE > 0, ago = t => (t.ts - now) / (30 * 864e5);
  const step = (x, g, s, i, it, lr) => { s.m[i] = .9 * s.m[i] + .1 * g; s.v[i] = .999 * s.v[i] + .001 * g * g; x[i] -= lr * (s.m[i] / (1 - Math.pow(.9, it))) / (Math.sqrt(s.v[i] / (1 - Math.pow(.999, it))) + 1e-8); };
  const gd = new Float64Array(NA), gw = new Float64Array(NF), go = new Float64Array(NFM * CATS.length), gs = new Float64Array(NA);
  let tAgo = 0;   // months before "now" of the trade being scored (0 when valuing today)
  const fo = (fm, c) => { let s = 0; for (let j = 0; j < NFM; j++) if (fm[j]) s += fm[j] * o[j * CATS.length + c]; return s; };
  const th = (it, fm) => mode === "index" ? it.a.feats.reduce((s, f) => s + w[f], 0) + d[it.a.i] + fo(fm, it.a.c) + (TREND ? sl[it.a.i] * tAgo : 0) : it.lm + d[it.a.i];
  for (let it = 1; it <= iters; it++) {
    gd.fill(0); gw.fill(0); go.fill(0); gs.fill(0);
    for (const t of train) { tAgo = ago(t);
      const side = S => { const z = S.map(x => P * th(x, t.fm)), m = Math.max(...z), e = z.map(v => Math.exp(v - m)), s = e.reduce((a, b) => a + b, 0); return { L: (m + Math.log(s)) / P, sm: e.map(v => v / s) }; };
      const a = side(t.A), b = side(t.B), r = a.L - b.L, h = (Math.abs(r) <= HUBER ? r : HUBER * Math.sign(r)) * t.w;
      for (const [S, sm, sg] of [[t.A, a.sm, 1], [t.B, b.sm, -1]]) S.forEach((x, k) => { const g = sg * h * sm[k]; gd[x.a.i] += g; if (TREND) gs[x.a.i] += g * tAgo; if (mode === "index") { for (const f of x.a.feats) gw[f] += g; for (let j = 0; j < NFM; j++) if (t.fm[j]) go[j * CATS.length + x.a.c] += g * t.fm[j]; } });
    }
    const lr = init ? (it < iters * .5 ? .02 : .01) : it < iters * .7 ? .05 : .015;
    for (let i = 0; i < NA; i++) if (gd[i] || d[i]) step(d, gd[i] + lambda * d[i], Ad, i, it, lr);
    if (TREND) for (let i = 0; i < NA; i++) if (gs[i] || sl[i]) step(sl, gs[i] + SLOPE * sl[i], As, i, it, lr);
    tAgo = 0;
    if (mode === "index") { for (let f = 0; f < NF; f++) step(w, gw[f] + 0.05 * w[f], Aw, f, it, lr); for (let c = 0; c < NFM * CATS.length; c++) step(o, go[c] + 0.05 * o[c], Ao, c, it, lr); }
  }
  if (mode === "anchored") for (let i = 0; i < NA; i++) d[i] = Math.max(-0.7, Math.min(0.7, d[i]));
  return { gap: (t) => { tAgo = TREND ? Math.max(0, ago(t)) : 0; const L = S => { const z = S.map(x => P * th(x, t.fm)), m = Math.max(...z); return (m + Math.log(z.reduce((s, v) => s + Math.exp(v - m), 0))) / P; }; return 1 - Math.exp(-Math.abs(L(t.A) - L(t.B))); },
    theta: (a, sf) => mode === "index" ? a.feats.reduce((s, f) => s + w[f], 0) + d[a.i] + (sf ? o[a.c] : 0) : null,   // published for a standard 12-team, no-TEP, 4-pt passing TD league
    fmtOffsets: () => Object.fromEntries(FMT.map((f, j) => [f, Object.fromEntries(CATS.map((c, i) => [c, +Math.exp(o[j * CATS.length + i]).toFixed(3)]))])), w, o, sl, d };
}
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const score = (set, g) => { const v = set.map(g); return { median: +median(v).toFixed(4), mean: +mean(v).toFixed(4) }; };

// ---- scorecard: tune memory (half-life) and ridge strength on a validation slice, then judge once on the newest 20% (never fitted)
const cut = Math.floor(trades.length * 0.8), train = trades.slice(0, cut), hold = trades.slice(cut), vcut = Math.floor(train.length * 0.8);
const tr2 = train.slice(0, vcut), val = train.slice(vcut).filter(t => t.mk), holdMk = hold.filter(t => t.mk);
const HLS = (process.env.INDEX_HLS || "45,90").split(",").map(Number);   // anchored comparison only; the index uses HALF_LIFE
const tune = (mode, grid) => { let best = null; for (const hl of (mode === "index" ? [HALF_LIFE] : HLS)) for (const lam of grid) { const m = fit(tr2, mode, lam, Math.round(ITERS * .6), hl), v = score(val, m.gap), s = (v.mean + v.median) / 2;
  console.log(`  ${mode} half-life ${hl}d, lambda ${lam}: validation ${(v.median * 100).toFixed(1)}% / ${(v.mean * 100).toFixed(1)}%`); if (!best || s < best.s) best = { lam, hl, s }; } return best; };
const bI = tune("index", (process.env.INDEX_LAMBDAS || "0.1,0.5").split(",").map(Number)), bA = tune("anchored", [16, 32]), lamI = bI.lam, lamA = bA.lam;
const mI = fit(train, "index", bI.lam, ITERS, bI.hl), mA = fit(train, "anchored", bA.lam, ITERS, bA.hl);
const scorecard = { trades: trades.length, holdout: hold.length, holdoutWithMarket: holdMk.length, from: new Date(hold[0].ts).toISOString().slice(0, 10),
  market: score(holdMk, marketGap), anchored: score(holdMk, mA.gap), index: score(holdMk, mI.gap), indexAllHoldout: score(hold, mI.gap), lambda: { index: lamI, anchored: lamA }, halfLife: { index: bI.hl, anchored: bA.hl } };
// walk-forward: score the held-out weeks the way the values are actually used. Each week is priced by a model refit on
// every trade before that week (warm-started from the previous week's fit), like the nightly job does; the market price
// is always that day's, and the anchored model's factors are refit the same way. This is the fair test for a live index.
const WALK = +(process.env.INDEX_WALK_DAYS ?? 7);
function walk(mode, lam, hl) {
  const g = new Map(); if (!WALK) return g;
  let prev = null;
  for (let start = hold[0].ts; start <= hold[hold.length - 1].ts; start += WALK * 864e5) {
    const week = hold.filter(t => t.ts >= start && t.ts < start + WALK * 864e5); if (!week.length) continue;
    const m = fit(trades.filter(t => t.ts < start), mode, lam, prev ? Math.round(ITERS * .35) : ITERS, hl, prev); prev = m;
    for (const t of week) g.set(t, m.gap(t));
  }
  return g;
}
const wI = walk("index", bI.lam, bI.hl), wA = walk("anchored", bA.lam, bA.hl);
if (WALK) { scorecard.walkForward = { refitEveryDays: WALK, market: scorecard.market, anchored: score(holdMk, t => wA.get(t)), index: score(holdMk, t => wI.get(t)), indexAllHoldout: score(hold, t => wI.get(t)) };
  const wf = scorecard.walkForward; console.log(`walk-forward (refit every ${WALK} days): market ${(wf.market.median * 100).toFixed(1)}% / ${(wf.market.mean * 100).toFixed(1)}%  ·  anchored ${(wf.anchored.median * 100).toFixed(1)}% / ${(wf.anchored.mean * 100).toFixed(1)}%  ·  INDEX ${(wf.index.median * 100).toFixed(1)}% / ${(wf.index.mean * 100).toFixed(1)}%`); }
if (process.env.INDEX_EXPERIMENT) process.exit(0);
const better = holdMk.filter(t => mI.gap(t) < mA.gap(t)).length;
scorecard.indexFairerThanAnchored = better; scorecard.indexLessFair = holdMk.length - better;
// two milestones, judged walk-forward (how the values are really used: refit as new trades arrive):
// independence = the index explains real trades better than the market price it would replace;
// replacement (the gate) = it also beats today's FFU values (market × in-house factor)
const J = scorecard.walkForward || scorecard;
const independent = J.index.mean <= J.market.mean && J.index.median <= J.market.median;
const gate = J.index.mean <= J.anchored.mean && J.index.median <= J.anchored.median;
// the settings (30-day memory, trends, format offsets) were chosen on Nov 24 by looking at that night's held-out trades;
// trades after that day never influenced any choice, so they are the clean test (reported once there are enough)
const SELECTED = Date.parse("2026-11-25T00:00:00Z"), clean = holdMk.filter(t => t.ts >= SELECTED);
if (WALK && clean.length >= 300) scorecard.cleanSinceSettings = { since: "2026-11-25", trades: clean.length, market: score(clean, marketGap), anchored: score(clean, t => wA.get(t)), index: score(clean, t => wI.get(t)) };
if (scorecard.cleanSinceSettings) { const c = scorecard.cleanSinceSettings; console.log(`clean test (${c.trades} trades since ${c.since}): market ${(c.market.median * 100).toFixed(1)}% / ${(c.market.mean * 100).toFixed(1)}%  ·  anchored ${(c.anchored.median * 100).toFixed(1)}% / ${(c.anchored.mean * 100).toFixed(1)}%  ·  INDEX ${(c.index.median * 100).toFixed(1)}% / ${(c.index.mean * 100).toFixed(1)}%`); }
console.log(`held-out (${holdMk.length} trades with market prices, from ${scorecard.from}): market ${(scorecard.market.median * 100).toFixed(1)}% / ${(scorecard.market.mean * 100).toFixed(1)}%  ·  anchored ${(scorecard.anchored.median * 100).toFixed(1)}% / ${(scorecard.anchored.mean * 100).toFixed(1)}%  ·  INDEX ${(scorecard.index.median * 100).toFixed(1)}% / ${(scorecard.index.mean * 100).toFixed(1)}%  (median / mean |gap|)  static fit · milestones (walk-forward): beats market ${independent ? "YES" : "not yet"} · beats FFU values (gate) ${gate ? "YES" : "not yet"}`);

// ---- publish: refit on every trade, scale to our own anchor, values per shape
for (const t of trades) for (const S of [t.A, t.B]) for (const x of S) x.a.n++;
const final = fit(trades, "index", bI.lam, ITERS, bI.hl);
// published values lean on the baseline in proportion to how little trade evidence there is (credibility n / (n + 10)),
// and assets with too few trades aren't published: players need 3+, picks need 20+ (deep-round picks trade too rarely to price)
const CRED = 10, pub = a => { if (!a.key.startsWith("K:")) return a.n >= 3; const [y, r] = a.key.slice(2).split("-").map(Number); return y > season && r <= 5 && a.n >= 20; };   // picks: future drafts, rounds 1–5
const raw = sf => assets.filter(pub).map(a => [a, Math.exp(final.theta(a, sf) - final.d[a.i] * (CRED / (a.n + CRED)))]);
const top = raw(1).map(x => x[1]).sort((a, b) => b - a).slice(0, 24), k = 9000 / mean(top);
const out = { built: Date.now(), method: "values fitted only on real trades in the FFU database: baseline by position, age, experience and NFL draft slot (picks by round and year) plus each asset's trade evidence and 30-day trend, format offsets by position (Superflex, TE premium, league size, 6-pt passing TDs); Huber loss on power-mean gap (P 1.45), 30-day half-life, ridge tuned on validation; scored walk-forward (refit weekly) on the newest 20% of trades; published values shrunk toward the baseline by n/(n+10); players with 3+ trades and future picks (rounds 1–5) with 20+; scaled so the top 24 Superflex assets average 9,000",
  scorecard, independent, gate, sfOffset: Object.fromEntries(CATS.map((c, i) => [c, +Math.exp(final.o[i]).toFixed(3)])), formatOffsets: final.fmtOffsets(),
  formatNote: "multiply a value by the offset raised to the setting: tep per point of TE premium, teams per 2 teams above 12, pass6 for 6-point passing TDs" };
for (const [shape, sf] of [["sf", 1], ["oneqb", 0]]) { const res = {}; for (const [a, v] of raw(sf)) res[a.key.startsWith("K:") ? a.key.slice(2) : a.key.slice(2)] = [Math.round(v * k), a.n]; out[shape] = res; }
fs.writeFileSync(path.join(DIR, "ffu-index.json"), JSON.stringify(out));
console.log(`ffu-index.json: ${Object.keys(out.sf).length} assets; Superflex QB offset ×${out.sfOffset.QB}`);

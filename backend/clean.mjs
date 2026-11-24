// Cleaning rules for the FFU database (Nov 24, 2026). Market sentiment should come from managers running their
// own teams, not from a handful of accounts trading in hundreds of leagues, and not from dumps or collusion.
//
//  1. Extreme accounts are discarded: trades this season more than 4 robust standard deviations above the typical
//     manager on a log scale (median and MAD of log trade counts), and at least 150 trades. Their trades are removed
//     from the trade database and never written to Supabase. The threshold is recomputed from the data each run;
//     once excluded, an account stays excluded (listed in excluded.json with its numbers). Seed accounts (FFU's own
//     users) are never excluded.
//  2. Heavy traders who remain are capped: each counts at most like a manager at the 99th percentile of trade
//     volume. A trade's weight is min(1, cap / trades of its busier side).
//  3. Lopsided trades are discarded from value fitting and manager pricing: one side worth less than 25% of the
//     other at that day's market (a gap over 75%) with a real market price on each side.
import { readJSON } from "./db.mjs";

export const LOPSIDED = 0.75, Z_MAX = 4, MIN_TRADES = 150;
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

// count each account's trades this season (two-team trades with known owners)
export function tradeCounts(trades, owners) {
  const n = new Map(), lg = new Map(), seen = new Set();
  for (const t of trades) {
    if (t.type !== "trade" || seen.has(t.id) || !t.rids || t.rids.length !== 2) continue; seen.add(t.id);
    const o = owners[t.lid]; if (!o) continue;
    for (const r of t.rids) { const u = o[r]; if (!u) continue; n.set(u, (n.get(u) || 0) + 1); if (!lg.has(u)) lg.set(u, new Set()); lg.get(u).add(t.lid); }
  }
  return { n, lg };
}

// decide who's extreme and where the cap sits; `prev` keeps earlier exclusions sticky
export function decide(trades, owners, seeds = new Set(), prev = {}) {
  const { n, lg } = tradeCounts(trades, owners), logs = [...n.values()].map(c => Math.log(c));
  const med = median(logs), mad = median(logs.map(x => Math.abs(x - med))) || 0.5, sd = 1.4826 * mad;
  const threshold = Math.max(MIN_TRADES, Math.ceil(Math.exp(med + Z_MAX * sd)));
  const users = { ...(prev.users || {}) };
  for (const [u, c] of n) if (c >= threshold && !seeds.has(u) && !users[u]) users[u] = { trades: c, leagues: lg.get(u).size, at: new Date().toISOString().slice(0, 10), why: `${c} trades in ${lg.get(u).size} leagues this season (threshold ${threshold})` };
  for (const u of Object.keys(users)) if (seeds.has(u)) delete users[u];
  const kept = [...n.entries()].filter(([u]) => !users[u]).map(([, c]) => c).sort((a, b) => a - b);
  const cap = Math.max(40, kept[Math.floor(kept.length * 0.99)] || 40), weights = {};
  for (const [u, c] of n) if (!users[u] && c > cap) weights[u] = +(cap / c).toFixed(4);
  return { built: Date.now(), rule: { zMax: Z_MAX, minTrades: MIN_TRADES, threshold, logMedian: +med.toFixed(3), logSd: +sd.toFixed(3), lopsided: LOPSIDED }, cap, users, weights,
    stats: { accounts: n.size, excluded: Object.keys(users).length, capped: Object.keys(weights).length } };
}

// what every valuation job uses: drop trades with an excluded account, weight capped accounts down
export function tradeFilter(dir) {
  const ex = readJSON(dir, "excluded.json", { users: {}, weights: {} }), db = readJSON(dir, "trades-db.json", { owners: {} });
  const owners = db.owners || {}, out = new Set(Object.keys(ex.users || {})), w = ex.weights || {};
  const who = t => (t.rids || []).map(r => (owners[t.lid] || {})[r]).filter(Boolean);
  return {
    keep: t => !who(t).some(u => out.has(u)),
    weight: t => who(t).reduce((m, u) => Math.min(m, w[u] ?? 1), 1),
    who, excluded: out.size, capped: Object.keys(w).length, cap: ex.cap || null,
  };
}
export const lopsided = gap => gap > LOPSIDED;

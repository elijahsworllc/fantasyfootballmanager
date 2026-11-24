// Grows the FFU trade database beyond the user's own leagues.
// Each run: start from the seed users (platform users), add their league-mates, look up the leagues
// those people play in, and collect completed trades from every known league. Leagues and users are
// remembered in crawl-state.json, so each nightly run picks up where the last one stopped and the
// database grows by a bounded amount per run (Sleeper asks for fewer than 1,000 calls a minute).
// Stored per trade: league id, time, roster ids, player ids and picks moved. No names, no messages.
// Output (data branch): trades-db.json  { built, season, leagues: {lid: shape}, owners: {lid: {rosterId: userId}}, trades: [...] }, crawl-state.json
import fs from "node:fs";
import path from "node:path";
import { getJSON, pool } from "./sleeper.mjs";
import { upsert, remove, safely, dbOn, readJSON, writeGz } from "./db.mjs";
import { decide } from "./clean.mjs";

const OUT = process.env.OUT_DIR || "out";
const SEEDS = (process.env.SEED_USERS || process.env.SLEEPER_USERNAME || "jahswor").split(",").map(s => s.trim()).filter(Boolean);
const NEW_USERS = +(process.env.CRAWL_USERS || 500);     // new people whose leagues we look up per run
const MAX_LEAGUES = +(process.env.CRAWL_LEAGUES || 1200);  // leagues whose trades we refresh per run
const read = (f, d) => readJSON(OUT, f, d);

const st = await getJSON("/v1/state/nfl"); const season = st.season, week = Math.max(1, Math.min(18, st.week || 1));
const state = read("crawl-state.json", { season, users: {}, leagues: {} });
if (state.season !== season) { state.season = season; state.leagues = {}; }
const db = read("trades-db.json", { season, leagues: {}, trades: [] });
if (db.season !== season) { db.season = season; db.leagues = {}; db.trades = []; }
const seen = new Set(db.trades.map(t => t.id)), newIds = new Set();
// stay well under Sleeper's ~1,000 calls/minute: one call every 100 ms across all workers (~600/min)
let calls = 0, nextAt = 0;
const get = async p => { const wait = Math.max(0, nextAt - Date.now()); nextAt = Math.max(Date.now(), nextAt) + 100; if (wait) await new Promise(r => setTimeout(r, wait)); calls++; return getJSON(p); };

// 1) seed users and their leagues
for (const name of SEEDS) {
  try { const u = await get(`/v1/user/${encodeURIComponent(name)}`); if (u && u.user_id) state.users[u.user_id] ||= { at: 0, seed: true }; } catch (e) { console.log("seed", name, e.message); }
}
const shapeOf = l => { const rp = l.roster_positions || [], sc = l.scoring_settings || {};
  return { type: (l.settings || {}).type || 0, teams: l.total_rosters, qbs: rp.includes("SUPER_FLEX") || rp.filter(p => p === "QB").length > 1 ? 2 : 1, ppr: sc.rec || 0, tep: sc.bonus_rec_te || 0, passTd: sc.pass_td || 4 }; };
// 2) look up leagues for users not crawled yet this season (seeds first)
const todo = Object.entries(state.users).filter(([, u]) => !u.at || u.season !== season).sort((a, b) => (b[1].seed ? 1 : 0) - (a[1].seed ? 1 : 0)).slice(0, NEW_USERS);
await pool(todo, 8, async ([uid, u]) => {
  const ls = await get(`/v1/user/${uid}/leagues/nfl/${season}`);
  for (const l of ls || []) if (l.status !== "pre_draft" && !state.leagues[l.league_id]) state.leagues[l.league_id] = { shape: shapeOf(l), weeks: {}, mates: false };
  u.at = Date.now(); u.season = season;
});
// 3) league-mates of known leagues become future users to crawl
const needMates = Object.entries(state.leagues).filter(([, l]) => !l.mates).slice(0, +(process.env.CRAWL_MATES || 800));
await pool(needMates, 8, async ([lid, l]) => {
  const us = await get(`/v1/league/${lid}/users`);
  for (const u of us || []) if (u.user_id && !state.users[u.user_id]) state.users[u.user_id] = { at: 0 };
  l.mates = true;
});
// 4) trades: every week once, then keep refreshing the last two weeks
const jobs = [];
// new leagues first, then the ones refreshed longest ago
const pick = Object.entries(state.leagues).sort((a, b) => (Object.keys(a[1].weeks).length ? 1 : 0) - (Object.keys(b[1].weeks).length ? 1 : 0) || (a[1].ref || 0) - (b[1].ref || 0)).slice(0, MAX_LEAGUES);
for (const [lid, l] of pick){ l.ref = Date.now(); for (let w = 1; w <= week; w++) if (!l.weeks[w] || w >= week - 1) jobs.push({ lid, w }); }
await pool(jobs, 10, async j => {
  const arr = await get(`/v1/league/${j.lid}/transactions/${j.w}`);
  for (const t of arr || []) {
    if (t.type !== "trade" || t.status !== "complete" || seen.has(t.transaction_id)) continue;
    seen.add(t.transaction_id); newIds.add(t.transaction_id);
    db.trades.push({ lid: j.lid, id: t.transaction_id, type: "trade", ts: t.status_updated || t.created || Date.now(), rids: t.roster_ids || [], adds: t.adds || {},
      picks: (t.draft_picks || []).map(p => ({ season: +p.season, round: p.round, orig: p.roster_id, to: p.owner_id, from: p.previous_owner_id })) });
  }
  state.leagues[j.lid].weeks[j.w] = 1;
  db.leagues[j.lid] = state.leagues[j.lid].shape;
});
// 5) who owns each roster, so trades can be tied to people across leagues (refreshed every two weeks)
const market = read("market.json", { tx: [] });
const tradeLids = new Set(db.trades.map(t => t.lid).concat(market.tx.filter(t => t.type === "trade").map(t => t.lid)));
const OWNER_CALLS = +(process.env.CRAWL_OWNERS || 2500);
const needOwn = [...tradeLids].filter(lid => { const l = state.leagues[lid] ||= { shape: db.leagues[lid] || {}, weeks: {}, mates: true }; return !l.own || Date.now() - (l.ownAt || 0) > 14 * 864e5; }).slice(0, OWNER_CALLS);
await pool(needOwn, 10, async lid => {
  const rs = await get(`/v1/league/${lid}/rosters`); const own = {};
  for (const r of rs || []) if (r.owner_id) own[r.roster_id] = r.owner_id;
  state.leagues[lid].own = own; state.leagues[lid].ownAt = Date.now();
});
db.owners = {}; for (const lid of tradeLids) if (state.leagues[lid] && state.leagues[lid].own) db.owners[lid] = state.leagues[lid].own;

// 5b) cleaning: discard extreme-volume accounts (clean.mjs); their trades leave the database
const seeds = new Set(Object.entries(state.users).filter(([, u]) => u.seed).map(([id]) => id));
const prevEx = read("excluded.json", {}), ex = decide(market.tx.concat(db.trades), db.owners, seeds, prevEx);
fs.writeFileSync(path.join(OUT, "excluded.json"), JSON.stringify(ex));
const isOut = t => (t.rids || []).some(r => ex.users[((db.owners[t.lid] || {})[r])]);
const before = db.trades.length; db.trades = db.trades.filter(t => !isOut(t));
const newlyOut = Object.keys(ex.users).filter(u => !(prevEx.users || {})[u]);
console.log(`cleaning: ${ex.stats.excluded} accounts excluded (threshold ${ex.rule.threshold} trades; ${newlyOut.length} new), ${before - db.trades.length} of their trades removed; ${ex.stats.capped} accounts capped at ${ex.cap} trades`);
db.built = Date.now();
writeGz(OUT, "trades-db.json", db);
writeGz(OUT, "crawl-state.json", state);

// 6) the FFU database: leagues and trades into Supabase (everything once, then what's new or changed)
await safely("database", async () => {
  const full = !state.dbSync, since = state.dbSync || 0;
  const lgRows = Object.entries(state.leagues).filter(([lid, l]) => tradeLids.has(lid) && (full || (l.ownAt || 0) > since || (l.ref || 0) > since))
    .map(([lid, l]) => ({ league_id: lid, season: +season, type: l.shape.type ?? null, teams: l.shape.teams ?? null, qbs: l.shape.qbs ?? null, ppr: l.shape.ppr ?? null, tep: l.shape.tep ?? null, pass_td: l.shape.passTd ?? null,
      owners: l.own || null, owners_at: l.ownAt ? new Date(l.ownAt).toISOString() : null, updated_at: new Date().toISOString() }));
  const trRows = db.trades.filter(t => full || newIds.has(t.id) || (state.leagues[t.lid] && (state.leagues[t.lid].ownAt || 0) > since))
    .map(t => { const own = (state.leagues[t.lid] || {}).own || {}; return { id: t.id, league_id: t.lid, season: +season, ts: new Date(t.ts).toISOString(), rids: t.rids, owners: t.rids.map(r => own[r] || null), adds: t.adds, picks: t.picks }; });
  const a = await upsert("ffu_leagues", lgRows, { onConflict: "league_id" }), b = await upsert("ffu_trades", trRows, { onConflict: "id" });
  // anything already stored from an account excluded since: delete it (owners overlap the excluded list)
  const purge = full ? [] : newlyOut; for (let i = 0; i < purge.length; i += 50) await remove("ffu_trades", `owners=ov.{${purge.slice(i, i + 50).join(",")}}`);
  state.dbSync = Date.now(); writeGz(OUT, "crawl-state.json", state);
  return `${a} leagues, ${b} trades upserted${full ? " (first full load)" : ""}${purge.length ? `; trades of ${purge.length} newly excluded accounts deleted` : ""}`;
});
const users = Object.keys(state.users).length, crawled = Object.values(state.users).filter(u => u.at).length;
console.log(`crawl: ${calls} API calls; ${Object.keys(state.leagues).length} leagues known; ${crawled}/${users} users crawled; trades-db ${db.trades.length} trades from ${Object.keys(db.leagues).length} leagues; owners for ${Object.keys(db.owners).length} leagues`);

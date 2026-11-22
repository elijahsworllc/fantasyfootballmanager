// Grows the FFU trade database beyond the user's own leagues.
// Each run: start from the seed users (platform users), add their league-mates, look up the leagues
// those people play in, and collect completed trades from every known league. Leagues and users are
// remembered in crawl-state.json, so each nightly run picks up where the last one stopped and the
// database grows by a bounded amount per run (Sleeper asks for fewer than 1,000 calls a minute).
// Stored per trade: league id, time, roster ids, player ids and picks moved. No names, no messages.
// Output (data branch): trades-db.json  { built, season, leagues: {lid: shape}, trades: [...] }, crawl-state.json
import fs from "node:fs";
import path from "node:path";
import { getJSON, pool } from "./sleeper.mjs";

const OUT = process.env.OUT_DIR || "out";
const SEEDS = (process.env.SEED_USERS || process.env.SLEEPER_USERNAME || "jahswor").split(",").map(s => s.trim()).filter(Boolean);
const NEW_USERS = +(process.env.CRAWL_USERS || 250);     // new people whose leagues we look up per run
const MAX_LEAGUES = +(process.env.CRAWL_LEAGUES || 600);  // leagues whose trades we refresh per run
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")); } catch { return d; } };

const st = await getJSON("/v1/state/nfl"); const season = st.season, week = Math.max(1, Math.min(18, st.week || 1));
const state = read("crawl-state.json", { season, users: {}, leagues: {} });
if (state.season !== season) { state.season = season; state.leagues = {}; }
const db = read("trades-db.json", { season, leagues: {}, trades: [] });
if (db.season !== season) { db.season = season; db.leagues = {}; db.trades = []; }
const seen = new Set(db.trades.map(t => t.id));
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
const needMates = Object.entries(state.leagues).filter(([, l]) => !l.mates).slice(0, 400);
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
    seen.add(t.transaction_id);
    db.trades.push({ lid: j.lid, id: t.transaction_id, type: "trade", ts: t.status_updated || t.created, rids: t.roster_ids || [], adds: t.adds || {},
      picks: (t.draft_picks || []).map(p => ({ season: +p.season, round: p.round, orig: p.roster_id, to: p.owner_id, from: p.previous_owner_id })) });
  }
  state.leagues[j.lid].weeks[j.w] = 1;
  db.leagues[j.lid] = state.leagues[j.lid].shape;
});
db.built = Date.now();
fs.writeFileSync(path.join(OUT, "trades-db.json"), JSON.stringify(db));
fs.writeFileSync(path.join(OUT, "crawl-state.json"), JSON.stringify(state));
const users = Object.keys(state.users).length, crawled = Object.values(state.users).filter(u => u.at).length;
console.log(`crawl: ${calls} API calls; ${Object.keys(state.leagues).length} leagues known; ${crawled}/${users} users crawled; trades-db ${db.trades.length} trades from ${Object.keys(db.leagues).length} leagues`);

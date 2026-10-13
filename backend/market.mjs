// Run on push, nightly, or by hand from the Actions tab.
// Nightly: collect every completed transaction in the user's leagues (trades, waiver bids, adds)
// so the app loads one file instead of hundreds of requests, and snapshot dynasty values for trend history.
import fs from "node:fs";
import path from "node:path";
import { getJSON, pool, loadContext } from "./sleeper.mjs";

const USER = process.env.SLEEPER_USERNAME || "jahswor";
const OUT_DIR = process.env.OUT_DIR || "out";
fs.mkdirSync(path.join(OUT_DIR, "values"), { recursive: true });

const { st, week, leagues } = await loadContext(USER);
const list = leagues.filter(l => l.status !== "pre_draft");
const jobs = [];
for (const lg of list) for (let w = 1; w <= week; w++) jobs.push({ lg, w });
const got = await pool(jobs, 8, async j => ({ lid: j.lg.league_id, arr: await getJSON(`/v1/league/${j.lg.league_id}/transactions/${j.w}`) }));
const tx = [], seen = new Set();
for (const g of got) {
  if (!g || g.error || !Array.isArray(g.arr)) continue;
  for (const t of g.arr) {
    if (t.status !== "complete" || seen.has(t.transaction_id)) continue;
    seen.add(t.transaction_id);
    tx.push({ lid: g.lid, id: t.transaction_id, type: t.type, status: "complete", ts: t.status_updated || t.created, leg: t.leg,
      adds: t.adds || {}, drops: {}, rids: t.roster_ids || [],
      picks: (t.draft_picks || []).map(p => ({ season: +p.season, round: p.round, orig: p.roster_id, to: p.owner_id, from: p.previous_owner_id })),
      bid: (t.settings && t.settings.waiver_bid) || 0 });
  }
}
const meta = {};
for (const lg of list) {
  const rp = lg.roster_positions || [];
  meta[lg.league_id] = { teams: lg.total_rosters, qbs: rp.includes("SUPER_FLEX") || rp.filter(p => p === "QB").length > 1 ? 2 : 1,
    ppr: (lg.scoring_settings || {}).rec || 0, tep: (lg.scoring_settings || {}).bonus_rec_te || 0, budget: (lg.settings || {}).waiver_budget || 0 };
}
fs.writeFileSync(path.join(OUT_DIR, "market.json"), JSON.stringify({ built: Date.now(), season: st.season, week, leagues: meta, tx }));
console.log(`market.json: ${list.length} leagues, ${tx.length} transactions, ${tx.filter(t => t.type === "trade").length} trades, ${tx.filter(t => t.bid).length} FAAB claims`);

// Dynasty value snapshot (FantasyCalc) for trend history.
const snap = {};
for (const [k, q] of [["sf", 2], ["oneqb", 1]]) {
  try {
    const arr = await getJSON(`https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=${q}&numTeams=12&ppr=1`);
    snap[k] = Object.fromEntries(arr.map(x => [x.player.sleeperId || x.player.name, x.value]));
  } catch (e) { console.log("values", k, e.message); }
}
const day = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(OUT_DIR, "values", `${day}.json`), JSON.stringify(snap));
console.log(`values/${day}.json written`);

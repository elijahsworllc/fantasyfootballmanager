// Run by hand (Actions tab) or on push of this file: saves the inputs the value-model
// calibration needs (league scoring + lineups, player positions/ages, this week's and
// season projections) to the data branch as calib-inputs.json. Analysis runs offline.
import fs from "node:fs";
import path from "node:path";
import { getJSON, loadContext } from "./sleeper.mjs";

const USER = process.env.SLEEPER_USERNAME || "jahswor";
const OUT_DIR = process.env.OUT_DIR || "out";
const { st, week, leagues } = await loadContext(USER);
const lg = {};
for (const l of leagues) lg[l.league_id] = { name: l.name, type: (l.settings || {}).type || 0, teams: l.total_rosters, rp: l.roster_positions || [], sc: l.scoring_settings || {} };
const POS = "position[]=QB&position[]=RB&position[]=WR&position[]=TE";
const slim = arr => Object.fromEntries((arr || []).filter(e => e && e.stats).map(e => [e.player_id, { pos: (e.player || {}).position, team: (e.player || {}).team, stats: e.stats }]));
const wk = {};
for (const w of [week - 2, week - 1, week, week + 1].filter(w => w >= 1 && w <= 18)) {
  try { wk[w] = slim(await getJSON(`/projections/nfl/${st.season}/${w}?season_type=regular&${POS}`)); } catch (e) { console.log("week", w, e.message); }
}
let season = null;
try { season = slim(await getJSON(`/projections/nfl/${st.season}?season_type=regular&${POS}`)); } catch (e) { console.log("season projections:", e.message); }
const fc = {};
for (const [k, q, d] of [["sf", 2, true], ["oneqb", 1, true], ["sf_redraft", 2, false]]) {
  try {
    const arr = await getJSON(`https://api.fantasycalc.com/values/current?isDynasty=${d}&numQbs=${q}&numTeams=12&ppr=1`);
    fc[k] = arr.map(x => ({ id: x.player.sleeperId || x.player.name, name: x.player.name, pos: x.player.position, age: x.player.maybeAge, v: x.value, r: x.redraftValue, sd: x.maybeMovingStandardDeviationPerc }));
  } catch (e) { console.log("fc", k, e.message); }
}
fs.writeFileSync(path.join(OUT_DIR, "calib-inputs.json"), JSON.stringify({ built: Date.now(), season: st.season, week, leagues: lg, proj: wk, seasonProj: season, fc }));
console.log(`calib-inputs.json: ${Object.keys(lg).length} leagues, weeks ${Object.keys(wk).join(",")}, season projections ${season ? Object.keys(season).length : "none"}, fc ${Object.keys(fc).join(",")}`);

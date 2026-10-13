// Pre-kickoff lineup check. Runs every 15 minutes on game days; sends at most one alert per window.
import fs from "node:fs";
import { getJSON, pool, leagueScore, loadContext, nyNow, SLOT_ELIG, OUT } from "./sleeper.mjs";

const USER = process.env.SLEEPER_USERNAME || "jahswor";
const TOPIC = process.env.NTFY_TOPIC || "";
const APP_URL = process.env.APP_URL || "https://elijahsworllc.github.io/fantasyfootballmanager/";
const STATE_FILE = process.env.STATE_FILE || "alert-state.json";
const FORCE = process.env.FORCE === "true";

// Alert windows in New York time. "only" limits the alert to games on that day.
const WINDOWS = [
  { id: "thu",       dow: 4, h: 18, m: 30, label: "Thursday night",  only: "today" },
  { id: "sat",       dow: 6, h: 21, m: 0,  label: "Weekend preview" },
  { id: "sun-early", dow: 0, h: 8,  m: 30, label: "Sunday morning" },
  { id: "sun-1pm",   dow: 0, h: 11, m: 30, label: "Before the 1pm games",  questionable: true },
  { id: "sun-4pm",   dow: 0, h: 15, m: 0,  label: "Before the late games", questionable: true },
  { id: "sun-night", dow: 0, h: 19, m: 15, label: "Before Sunday night",   questionable: true },
  { id: "mon",       dow: 1, h: 18, m: 30, label: "Before Monday night",   questionable: true, only: "today" }
];

const now = nyNow();
const mins = now.hour * 60 + now.minute;
const win = WINDOWS.find(w => w.dow === now.dow && mins >= w.h * 60 + w.m && mins < w.h * 60 + w.m + 60);
const active = win || (FORCE ? { id: "test", label: "Test alert", questionable: true } : null);
if (!active) { console.log(`No alert window at ${now.date} ${now.hour}:${String(now.minute).padStart(2, "0")} New York time.`); process.exit(0); }
const key = `${now.date}-${active.id}`;
let state = {};
try { state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch {}
if (!FORCE && state.last === key) { console.log(`Already sent ${key}.`); process.exit(0); }

const { user, st, week, byTeam, leagues } = await loadContext(USER);
const pos = ["QB", "RB", "WR", "TE", "K", "DEF"].map(p => "position%5B%5D=" + p).join("&");
const projArr = await getJSON(`/projections/nfl/${st.season}/${week}?season_type=regular&${pos}`);
const proj = {}; for (const e of projArr) proj[e.player_id] = e;
const name = pid => { const p = proj[pid] && proj[pid].player; return p && p.first_name ? `${p.first_name[0]}. ${p.last_name}` : (isNaN(+pid) ? `${pid} D/ST` : `Player ${pid}`); };
const today = now.date;

const active_leagues = leagues.filter(l => l.status === "in_season" && (l.settings || {}).best_ball !== 1);
const rows = await pool(active_leagues, 8, async lg => {
  const rosters = await getJSON(`/v1/league/${lg.league_id}/rosters`);
  const mine = rosters.find(r => r.owner_id === user.user_id || (r.co_owners || []).includes(user.user_id));
  if (!mine) return null;
  const slots = lg.roster_positions.filter(p => p !== "BN");
  const starters = (mine.starters || []).slice(0, slots.length);
  const reserve = new Set(mine.reserve || []), taxi = new Set(mine.taxi || []);
  const info = pid => {
    const e = proj[pid], p = (e && e.player) || {};
    const team = p.team || (isNaN(+pid) ? pid : null), g = team ? byTeam[team] : null;
    const position = p.position || (isNaN(+pid) ? "DEF" : "?");
    const locked = !!(g && (g.status === "complete" || g.status === "in_game"));
    let why = null;
    if (!team) why = "not on a team"; else if (!g) why = "BYE"; else if (g.status === "canceled") why = "game canceled";
    else if (OUT.has(p.injury_status)) why = p.injury_status === "IR" ? "IR" : p.injury_status.toUpperCase();
    const pts = why ? 0 : leagueScore(e && e.stats, lg.scoring_settings || {}, position);
    return { pid, team, g, locked, why, q: p.injury_status === "Questionable", pts, elig: p.fantasy_positions && p.fantasy_positions.length ? p.fantasy_positions : [position] };
  };
  const bench = (mine.players || []).filter(p => !starters.includes(p) && !reserve.has(p) && !taxi.has(p)).map(info).filter(b => !b.locked && !b.why);
  const issues = [];
  starters.forEach((pid, i) => {
    const elig = SLOT_ELIG[slots[i]] || [];
    const sub = () => { const b = bench.filter(x => x.elig.some(e => elig.includes(e))).sort((a, c) => c.pts - a.pts)[0]; if (b) bench.splice(bench.indexOf(b), 1); return b; };
    if (!pid || pid === "0") { const s = sub(); issues.push({ sev: 2, date: null, text: `empty ${slots[i]} slot${s ? ` → start ${name(s.pid)}` : ""}` }); return; }
    const f = info(pid);
    if (f.locked) return;
    if (f.why) { const s = sub(); issues.push({ sev: 2, date: f.g && f.g.date, text: `${name(pid)} ${f.why}${s ? ` → start ${name(s.pid)}` : " → no healthy sub on bench"}` }); }
    else if (f.q) issues.push({ sev: 1, date: f.g.date, text: `${name(pid)} Questionable` });
  });
  return { lg, issues };
}).then(r => r.filter(x => x && !x.error));

// Keep issues that matter for this window.
const relevant = rows.map(r => ({ ...r, issues: r.issues.filter(i => (active.questionable || i.sev === 2) && (!active.only || !i.date || i.date === today)) }))
  .filter(r => r.issues.length)
  .sort((a, b) => Math.max(...b.issues.map(i => i.sev)) - Math.max(...a.issues.map(i => i.sev)));
const must = relevant.filter(r => r.issues.some(i => i.sev === 2)).length;
const checks = relevant.length - must;

if (!relevant.length && active.id !== "sat" && !FORCE) {
  console.log(`${key}: nothing to fix.`); state.last = key; fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); process.exit(0);
}
const lines = relevant.slice(0, 12).map(r => `• ${r.lg.name.replace(/\s+/g, " ").trim().slice(0, 28)}: ${r.issues.slice(0, 2).map(i => i.text).join("; ")}${r.issues.length > 2 ? ` (+${r.issues.length - 2} more)` : ""}`);
if (relevant.length > 12) lines.push(`…and ${relevant.length - 12} more leagues in the app`);
const title = relevant.length
  ? `${active.label}: ${must ? `${must} lineup${must === 1 ? "" : "s"} to fix` : ""}${must && checks ? ", " : ""}${checks ? `${checks} to check` : ""}`
  : `${active.label}: all ${rows.length} lineups are set`;
const message = relevant.length ? lines.join("\n") : "No starters on bye, out or doubtful. Enjoy the games.";
console.log(title + "\n" + message);

if (!TOPIC) { console.log("NTFY_TOPIC secret is not set, so nothing was sent."); process.exit(0); }
const r = await fetch("https://ntfy.sh/", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ topic: TOPIC, title, message, priority: must ? 4 : 3, tags: [must ? "rotating_light" : relevant.length ? "warning" : "white_check_mark"],
    click: APP_URL, actions: [{ action: "view", label: "Open Command Center", url: APP_URL }] })
});
console.log("ntfy:", r.status);
if (!r.ok) process.exit(1);
if (!FORCE) { state.last = key; state.sentAt = new Date().toISOString(); fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }

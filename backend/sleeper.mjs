// Shared helpers for the scheduled jobs. Runs on Node 20+ (global fetch).
export const API = "https://api.sleeper.app";
export const SLOT_ELIG = {QB:["QB"],RB:["RB"],WR:["WR"],TE:["TE"],K:["K"],DEF:["DEF"],FLEX:["RB","WR","TE"],
  WRRB_FLEX:["RB","WR"],REC_FLEX:["WR","TE"],SUPER_FLEX:["QB","RB","WR","TE"],DL:["DL"],LB:["LB"],DB:["DB"],IDP_FLEX:["DL","LB","DB"]};
export const OUT = new Set(["Out","IR","PUP","Sus","NA","DNR","COV","Doubtful"]);
const SKIP = /^(adp_|pos_adp_|pts_std$|pts_ppr$|pts_half_ppr$|gp$|cmp_pct$|rec_tgt$)/;

export async function getJSON(path, tries = 3) {
  const url = path.startsWith("http") ? path : API + path;
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "command-center-bot" } });
      if (!r.ok) throw new Error(`${r.status} for ${url}`);
      return await r.json();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise(res => setTimeout(res, 800 * (i + 1)));
    }
  }
}
export async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  const worker = async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: String(e.message || e) }; } } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}
export function leagueScore(stats, sc, pos) {
  if (!stats) return 0;
  let t = 0;
  for (const k in stats) { if (SKIP.test(k)) continue; const w = sc[k]; if (w) t += w * stats[k]; }
  const rec = stats.rec || 0;
  if (rec) {
    if (pos === "TE" && sc.bonus_rec_te && stats.bonus_rec_te == null) t += sc.bonus_rec_te * rec;
    if (pos === "WR" && sc.bonus_rec_wr && stats.bonus_rec_wr == null) t += sc.bonus_rec_wr * rec;
    if (pos === "RB" && sc.bonus_rec_rb && stats.bonus_rec_rb == null) t += sc.bonus_rec_rb * rec;
  }
  return t;
}
// The week people are setting lineups for: next week once every game this week has started.
export async function loadContext(username) {
  const user = await getJSON(`/v1/user/${encodeURIComponent(username)}`);
  if (!user || !user.user_id) throw new Error(`No Sleeper user ${username}`);
  const st = await getJSON("/v1/state/nfl");
  const sched = await getJSON(`/schedule/nfl/${st.season_type === "post" ? "post" : "regular"}/${st.season}`);
  const left = sched.filter(g => g.week === st.week && g.status === "pre_game").length;
  const week = left === 0 && st.week < 18 ? st.week + 1 : st.week;
  const byTeam = {};
  for (const g of sched) if (g.week === week) for (const t of [g.home, g.away]) byTeam[t] = { date: g.date, status: g.status, opp: t === g.home ? g.away : "@" + g.home };
  const leagues = await getJSON(`/v1/user/${user.user_id}/leagues/nfl/${st.season}`);
  return { user, st, week, byTeam, leagues };
}
// New York local time parts, independent of the runner's time zone.
export function nyNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(d).map(x => [x.type, x.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { dow, hour: +p.hour % 24, minute: +p.minute, date: `${p.year}-${p.month}-${p.day}` };
}

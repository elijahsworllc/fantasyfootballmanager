// Sleeper trade crawl. Runs on a schedule from .github/workflows/crawl.yml.
// Snowball: start from SLEEPER_USERNAME's leagues → read each league's completed trades and its
// managers → read those managers' other leagues → repeat. Dynasty leagues are scanned first.
// Everything is stored in private Supabase tables (backend/crawl.sql). Logs print counts only,
// because Actions logs on a public repo are public.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (secret key), SLEEPER_USERNAME,
//      BUDGET_MIN (minutes per run, default 15), RATE (Sleeper requests per second, default 5),
//      MAX_BACKLOG (stop discovering new leagues while this many are waiting, default 5000).
import { API } from "./sleeper.mjs";

const SB = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_KEY || "";
const USER = process.env.SLEEPER_USERNAME || "jahswor";
const BUDGET_MS = +(process.env.BUDGET_MIN || 15) * 60e3;
const RATE = +(process.env.RATE || 5);
const MAX_BACKLOG = +(process.env.MAX_BACKLOG || 5000);
const REVISIT_DAYS = +(process.env.REVISIT_DAYS || 3);
const BATCH = 40;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- Sleeper, rate limited ----------
let nextSlot = 0, calls = 0;
async function slot() {
  const now = Date.now(), at = Math.max(now, nextSlot);
  nextSlot = at + 1000 / RATE;
  if (at > now) await sleep(at - now);
}
export async function sleeper(path, tries = 3) {
  for (let i = 0; ; i++) {
    await slot(); calls++;
    try {
      const r = await fetch(API + path, { headers: { "user-agent": "ffu-trade-crawl" } });
      if (r.status === 404) return null;
      if (r.status === 429 || r.status >= 500) throw new Error(`sleeper ${r.status}`);
      if (!r.ok) throw new Error(`sleeper ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await sleep(2000 * 2 ** i);
    }
  }
}

// ---------- Supabase REST ----------
function sbHeaders(extra = {}) {
  const h = { apikey: KEY, "content-type": "application/json", ...extra };
  if (!KEY.startsWith("sb_")) h.authorization = `Bearer ${KEY}`; // legacy service_role JWT
  return h;
}
export async function sb(path, { method = "GET", body, prefer, raw = false } = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers: sbHeaders(prefer ? { prefer } : {}), body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(`supabase ${method} ${path.split("?")[0]} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  if (raw) return r;
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function upsert(table, rows, conflict, mode = "merge-duplicates") {
  for (let i = 0; i < rows.length; i += 500)
    await sb(`${table}?on_conflict=${conflict}`, { method: "POST", body: rows.slice(i, i + 500), prefer: `resolution=${mode},return=minimal` });
}
async function count(table, filter) {
  const r = await sb(`${table}?select=${table === "crawl_users" ? "user_id" : "league_id"}&${filter}&limit=1`, { prefer: "count=exact", raw: true });
  const m = /\/(\d+)$/.exec(r.headers.get("content-range") || "");
  return m ? +m[1] : 0;
}

// ---------- Shapes ----------
export function fingerprint(lg) {
  const s = lg.settings || {}, sc = lg.scoring_settings || {}, rp = lg.roster_positions || [];
  return {
    league_id: String(lg.league_id), season: +lg.season, status: lg.status || null, kind: s.type ?? 0,
    best_ball: !!s.best_ball, teams: lg.total_rosters ?? null,
    qbs: rp.includes("SUPER_FLEX") || rp.filter(p => p === "QB").length > 1 ? 2 : 1,
    ppr: sc.rec ?? 0, tep: sc.bonus_rec_te ?? 0, pass_td: sc.pass_td ?? 4,
    idp: rp.some(p => ["DL", "LB", "DB", "IDP_FLEX"].includes(p)),
    starters: rp.filter(p => !["BN", "IR", "TAXI"].includes(p)).join(","), roster_size: rp.length,
    taxi: s.taxi_slots ?? 0, faab: s.waiver_budget ?? 0, previous_league_id: lg.previous_league_id || null,
  };
}
export function tradeRow(t, league_id, season) {
  return {
    transaction_id: String(t.transaction_id), league_id, season, week: t.leg ?? null,
    ts: new Date(t.status_updated || t.created).toISOString(),
    roster_ids: t.roster_ids || [], adds: t.adds || {}, drops: t.drops || {},
    picks: (t.draft_picks || []).map(p => ({ season: +p.season, round: p.round, orig: p.roster_id, to: p.owner_id, from: p.previous_owner_id })),
    faab: (t.waiver_budget || []).map(w => ({ from: w.sender, to: w.receiver, amount: w.amount })),
  };
}

// ---------- Steps ----------
async function seed(season) {
  const have = await count("crawl_leagues", "season=eq." + season);
  if (have) return 0;
  const u = await sleeper(`/v1/user/${encodeURIComponent(USER)}`);
  if (!u || !u.user_id) throw new Error("seed user not found");
  const leagues = (await sleeper(`/v1/user/${u.user_id}/leagues/nfl/${season}`)) || [];
  await upsert("crawl_leagues", leagues.map(fingerprint), "league_id");
  await upsert("crawl_users", [{ user_id: String(u.user_id), scanned_at: new Date().toISOString() }], "user_id");
  return leagues.length;
}

async function expandUsers(season, stats) {
  const users = await sb(`crawl_users?select=user_id&scanned_at=is.null&order=discovered_at.asc&limit=${BATCH}`);
  if (!users.length) return false;
  const found = new Map();
  for (const { user_id } of users) {
    try {
      const leagues = (await sleeper(`/v1/user/${user_id}/leagues/nfl/${season}`)) || [];
      for (const lg of leagues) found.set(String(lg.league_id), fingerprint(lg));
    } catch { stats.errors++; }
  }
  // New leagues only: never overwrite scan progress on leagues we already know.
  if (found.size) await upsert("crawl_leagues", [...found.values()], "league_id", "ignore-duplicates");
  await upsert("crawl_users", users.map(u => ({ user_id: u.user_id, scanned_at: new Date().toISOString() })), "user_id");
  stats.usersExpanded += users.length; stats.leaguesSeen += found.size;
  return true;
}

async function scanLeagues(season, week, stats) {
  const stale = new Date(Date.now() - REVISIT_DAYS * 864e5).toISOString();
  const leagues = await sb(`crawl_leagues?select=league_id,scanned_week,users_done&season=eq.${season}&status=neq.pre_draft` +
    `&or=(scanned_at.is.null,scanned_at.lt.${stale})&order=kind.desc,scanned_at.asc.nullsfirst&limit=${BATCH}`);
  if (!leagues.length) return false;
  const trades = [], newUsers = new Set(), done = [];
  for (const lg of leagues) {
    const from = lg.scanned_week ? Math.max(1, lg.scanned_week - 1) : 1, to = Math.max(1, week);
    try {
      for (let w = from; w <= to; w++) {
        const arr = (await sleeper(`/v1/league/${lg.league_id}/transactions/${w}`)) || [];
        for (const t of arr) if (t.type === "trade" && t.status === "complete") trades.push(tradeRow(t, lg.league_id, season));
      }
      if (!lg.users_done) {
        const members = (await sleeper(`/v1/league/${lg.league_id}/users`)) || [];
        for (const m of members) if (m && m.user_id) newUsers.add(String(m.user_id));
      }
    } catch { stats.errors++; }
    done.push({ league_id: lg.league_id, scanned_at: new Date().toISOString(), scanned_week: to, users_done: true });
  }
  const unique = [...new Map(trades.map(t => [t.transaction_id, t])).values()];
  if (unique.length) await upsert("trades", unique, "transaction_id");
  if (newUsers.size) await upsert("crawl_users", [...newUsers].map(user_id => ({ user_id })), "user_id", "ignore-duplicates");
  await upsert("crawl_leagues", done, "league_id");
  stats.leaguesScanned += leagues.length; stats.trades += unique.length; stats.usersSeen += newUsers.size;
  return true;
}

export async function run() {
  if (!SB || !KEY) { console.log("SUPABASE_URL / SUPABASE_SERVICE_KEY not set: skipping the crawl."); return null; }
  const t0 = Date.now(), left = () => BUDGET_MS - (Date.now() - t0);
  const st = await sleeper("/v1/state/nfl");
  const season = +(st.league_season || st.season), week = +st.week || 1;
  const stats = { season, week, seeded: await seed(season), leaguesScanned: 0, trades: 0, usersSeen: 0, usersExpanded: 0, leaguesSeen: 0, errors: 0 };
  while (left() > 90e3) {
    let worked = false;
    if (await count("crawl_leagues", `season=eq.${season}&scanned_at=is.null`) < MAX_BACKLOG)
      worked = (await expandUsers(season, stats)) || worked;
    if (left() < 90e3) break;
    worked = (await scanLeagues(season, week, stats)) || worked;
    if (!worked) break;
  }
  stats.sleeperCalls = calls; stats.minutes = +((Date.now() - t0) / 60e3).toFixed(1);
  stats.totals = { leagues: await count("crawl_leagues", `season=eq.${season}`), trades: await count("trades", `season=eq.${season}`) };
  console.log(JSON.stringify(stats));
  return stats;
}

if (import.meta.url === `file://${process.argv[1]}`) await run();

/* =====================================================================
   Live (Nov 24, 2026): every matchup you're in, live, in one place.
   Scores from Sleeper (they update during games); game clocks from ESPN's scoreboard.
   Projected final = points so far + each starter's projection × the share of his game still to play.
   Win chance: normal model on the projected margin, each starter's remaining points able to miss by
   about 70% of his remaining projection. Refreshes every minute while games are on.
   ===================================================================== */
Object.assign(NI, {live:'<circle cx="12" cy="12" r="2.6"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>'});
VIEWS.add("live");
const LIVE = {data:null, busy:false, err:null, timer:null, prev:null, anyLive:false, at:0, proj:{}, users:{}};
const nCdf = z => { const t = 1/(1 + .2316419*Math.abs(z)), d = .3989423*Math.exp(-z*z/2), p = d*t*(.3193815 + t*(-.3565638 + t*(1.781478 + t*(-1.821256 + t*1.330274)))); return z > 0 ? 1 - p : p; };

async function liveGames(season, week){
  const j = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`, {cache:"network"});
  const by = {}; let any = false, next = null;
  for(const ev of j.events || []){ const c = ev.competitions && ev.competitions[0]; if(!c) continue;
    const st = (c.status || ev.status || {}), ty = (st.type || {}).state || "pre", per = st.period || 0, clk = st.clock || 0;
    const left = ty === "post" ? 0 : ty === "pre" ? 1 : Math.max(0, Math.min(1, ((4 - Math.min(4, per))*900 + (per <= 4 ? clk : 0))/3600));
    const g = {state:ty, left, detail:(st.type || {}).shortDetail || "", ts:Date.parse(ev.date)};
    if(ty === "in") any = true; if(ty === "pre" && (!next || g.ts < next)) next = g.ts;
    for(const t of c.competitors || []){ const a = t.team && t.team.abbreviation; if(a) by[ESPN_FIX[a] || a] = g; }
  }
  return {by, any, next};
}
async function liveRefresh(manual){
  if(LIVE.busy) return; LIVE.busy = true; LIVE.err = null; if(manual) render();
  try{
    const st = await getJSON("/v1/state/nfl", {cache:"network"}), season = st.season, week = st.week;
    const leagues = (S.raw || []).filter(x => !x.error && x.mine && x.lg.status === "in_season");
    const [games, proj] = await Promise.all([liveGames(season, week).catch(()=>({by:{}, any:false, next:null})),
      week === S.week ? Promise.resolve(S.proj) : LIVE.proj[week] ? Promise.resolve(LIVE.proj[week]) : getJSON(`${API}/projections/nfl/${season}/${week}?season_type=regular&${["QB","RB","WR","TE","K","DEF","DL","LB","DB"].map(p=>"position%5B%5D="+p).join("&")}`, {cache:"prefer"}).then(a=>{ const m = {}; for(const e of a) m[e.player_id] = e; return LIVE.proj[week] = m; }).catch(()=>({}))]);
    const rows = (await pool(leagues, 10, async x => {
      const lid = x.lg.league_id, [mu, users] = await Promise.all([getJSON(`/v1/league/${lid}/matchups/${week}`, {cache:"network"}), LIVE.users[lid] || getJSON(`/v1/league/${lid}/users`, {cache:"prefer"}).catch(()=>[])]);
      LIVE.users[lid] = users;
      const me = (mu || []).find(m => m.roster_id === x.mine.roster_id); if(!me) return null;
      const opp = me.matchup_id != null ? mu.find(m => m.matchup_id === me.matchup_id && m.roster_id !== me.roster_id) : null;
      const side = m => { if(!m) return null; let rem = 0, v = 0, live = 0, yet = 0, done = 0; const top = [];
        (m.starters || []).forEach((pid, i) => { if(!pid || pid === "0") return;
          const e = proj[pid], pos = e && e.player ? e.player.position : null, team = e && e.player ? e.player.team : null, g = team ? games.by[team] : null;
          const full = e && e.stats ? leagueScore(e.stats, x.lg.scoring_settings || {}, pos) * ((FACTOR[(e.player || {}).injury_status] ?? 1)) : 0;
          const f = g ? g.left : 0, r = Math.max(0, full*f); rem += r; v += f > 0 ? Math.pow((.7*full + 1.5), 2)*f : 0;
          if(!g || g.state === "post") done++; else if(g.state === "in") live++; else yet++;
          const pts = (m.players_points || {})[pid] ?? (m.starters_points || [])[i] ?? 0; top.push({pid, pts, state: g ? g.state : "post"}); });
        top.sort((a, b) => b.pts - a.pts);
        const pts = m.points != null ? m.points : top.reduce((s, t) => s + t.pts, 0);
        const u = users.find(u => { const r = x.rosters && x.rosters.find(r => r.roster_id === m.roster_id); return r && u.user_id === r.owner_id; });
        return {rid:m.roster_id, pts, rem, v, fin:pts + rem, live, yet, done, top:top.slice(0, 3), name:(u && ((u.metadata || {}).team_name || u.display_name)) || `Team ${m.roster_id}`}; };
      const A = side(me), B = side(opp);
      let win = null; if(B){ const sd = Math.sqrt(A.v + B.v), d = A.fin - B.fin; win = sd > .5 ? nCdf(d/sd) : d > 0 ? 1 : d < 0 ? 0 : .5; }
      return {lid, name:x.lg.name, me:A, opp:B, win, playing:A.live + (B ? B.live : 0), left:A.live + A.yet + (B ? B.live + B.yet : 0)};
    })).filter(r => r && !r.error);
    // big moments since the last refresh: a starter's points jumping 6+ in one of your matchups
    const jumps = []; if(LIVE.prev) for(const r of rows){ const p = LIVE.prev[r.lid]; if(p != null && r.me.pts - p >= 6) jumps.push({r, d:r.me.pts - p}); }
    LIVE.prev = Object.fromEntries(rows.map(r => [r.lid, r.me.pts]));
    LIVE.data = {week, season, rows, games, at:Date.now()}; LIVE.anyLive = games.any; LIVE.at = Date.now();
    const ws = rows.filter(r => r.win != null);
    SKY.mood(ws.length && (games.any || ws.some(r => r.left)) ? ws.reduce((s, r) => s + r.win, 0)/ws.length : null);
    if(jumps.length){ const big = jumps.sort((a, b) => b.d - a.d)[0];
      toast(jumps.length === 1 ? `+${big.d.toFixed(1)} in ${big.r.name}` : `+${big.d.toFixed(1)} in ${big.r.name}, and ${jumps.length - 1} more league${jumps.length > 2 ? "s" : ""} scoring`);
      SKY.pulse(big.d >= 12); if(navigator.vibrate && !reduceMotion()) try{ navigator.vibrate([10, 40, 14]); }catch(_){} }
  }catch(e){ LIVE.err = e.message || String(e); }
  LIVE.busy = false; render(); liveSchedule();
}
function liveSchedule(){
  clearTimeout(LIVE.timer);
  const watching = S.view === "live" || LIVE.anyLive;   // keep the side panel and sky current while games are on
  if(!watching) return;
  LIVE.timer = setTimeout(()=>{ if(document.visibilityState === "visible") liveRefresh(); else liveSchedule(); }, LIVE.anyLive ? 60e3 : 5*60e3);
}
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState === "visible" && (S.view === "live" || LIVE.anyLive) && Date.now() - LIVE.at > 45e3) liveRefresh(); });

function liveCard(r, i){
  const A = r.me, B = r.opp, p = r.win, pc = p == null ? null : Math.round(p*100), cls = p == null ? "" : p >= .5 ? "up" : "dn";
  const close = p != null && p > .3 && p < .7 && r.left > 0;
  const who = s => s.top.map(t => `${esc(pname(t.pid).split(" ").slice(-1)[0])} <span class="num">${t.pts.toFixed(1)}</span>${t.state === "in" ? '<i class="lvdot" aria-label="playing"></i>' : ""}`).join(" · ");
  const status = s => [s.live ? `${s.live} playing` : "", s.yet ? `${s.yet} to play` : "", !s.live && !s.yet ? "all done" : ""].filter(Boolean).join(" · ");
  return `<article class="glass lvcard${close ? " close" : ""}" style="--i:${i}">
    <div class="lvtop"><b class="lvlg">${esc(r.name)}</b>${pc != null ? `<span class="lvp num ${cls}">${r.left ? pc + "% to win" : p >= .5 ? "Won" : "Lost"}</span>` : ""}</div>
    <div class="lvsc"><div><small>You</small><b class="num">${A.pts.toFixed(1)}</b><span class="num">${r.left ? "→ " + A.fin.toFixed(1) : "final"}</span></div>
      ${B ? `<div class="r"><small>${esc(B.name)}</small><b class="num">${B.pts.toFixed(1)}</b><span class="num">${r.left ? "→ " + B.fin.toFixed(1) : "final"}</span></div>` : `<div class="r"><small>No opponent this week</small></div>`}</div>
    ${pc != null ? `<div class="lvbar" role="img" aria-label="${pc}% chance to win"><i style="width:${pc}%"></i></div>` : ""}
    <div class="lvfoot"><span>${status(A)}</span><span>${who(A)}</span></div></article>`;
}
function viewLive(){
  if(!LIVE.data && !LIVE.busy && !LIVE.err) setTimeout(()=>liveRefresh(), 0);
  else if(!LIVE.timer && !LIVE.busy) liveSchedule();
  let h = `<section class="pagehead">${backBtn("home","Home")}<h1 class="h1">Live</h1><div class="sub">Every matchup you're in, as it happens. Scores from Sleeper, game clocks from ESPN; projected finals add each starter's projection for the part of his game still to play.</div></section>`;
  const d = LIVE.data;
  if(!d) return h + (LIVE.err ? `<div class="glass ccempty">Couldn't load live scores: ${esc(LIVE.err)} <button class="ghost tint" data-liverefresh="1">Try again</button></div>` : `<div class="statusline"><span class="livedot"></span>Loading your matchups…</div><div class="skel" aria-hidden="true"><i style="height:90px"></i><i style="height:240px"></i></div>`);
  const ws = d.rows.filter(r => r.win != null), going = ws.filter(r => r.left), winning = ws.filter(r => r.win >= .5).length, close = going.filter(r => r.win > .3 && r.win < .7).length;
  const exp = ws.reduce((s, r) => s + r.win, 0);
  const label = d.games.any ? `<span class="lvlive"><i></i>Live</span>` : going.length ? `<span class="lvsoon">Next kickoff ${d.games.next ? esc(kickLabel({ts:d.games.next})) : "soon"}</span>` : `<span class="lvsoon">Week ${d.week} final</span>`;
  h += `<section class="glass lvsum">${label}<div class="lvstats">
    <div><b class="num">${winning}<small>/${ws.length}</small></b><span>${going.length ? "winning now" : "won"}</span></div>
    <div><b class="num">${exp.toFixed(1)}</b><span>expected wins</span></div>
    <div><b class="num">${close}</b><span>coin flips</span></div></div>
    <button class="ghost" data-liverefresh="1" ${LIVE.busy ? "disabled" : ""}>${LIVE.busy ? "Refreshing…" : "Refresh"}</button>
    <small class="lvat">Updated ${new Date(d.at).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})}${d.games.any ? " · every minute while games are on" : ""}</small></section>`;
  // the matchups that need watching first: closest to a coin flip, then the rest by margin
  const order = d.rows.slice().sort((a, b) => (a.win == null) - (b.win == null) || (b.left > 0) - (a.left > 0) || Math.abs((a.win ?? .5) - .5) - Math.abs((b.win ?? .5) - .5));
  if(!order.length) h += `<div class="glass ccempty">No matchups this week in your in-season leagues.</div>`;
  else h += `<div class="lvgrid">${order.map(liveCard).join("")}</div>`;
  h += `<p class="src">Win chance treats each starter's remaining points as able to miss his projection by about 70%, so a 10-point lead with one player left is far from safe. Leagues without head-to-head matchups show your score only.</p>`;
  return h;
}
function liveSideHTML(){
  const d = LIVE.data; if(!d || !LIVE.anyLive) return "";
  const ws = d.rows.filter(r => r.win != null && r.left), win = ws.filter(r => r.win >= .5).length, close = ws.filter(r => r.win > .3 && r.win < .7);
  return `<section class="glass ccs"><h2><span class="lvlive"><i></i>Live</span></h2><button class="ccq" data-go="live"><i style="background:#FF4D6D;box-shadow:0 0 10px #FF4D6D"></i><span><b>Winning ${win} of ${ws.length}</b><small>${close.length ? `${close.length} coin flip${close.length > 1 ? "s" : ""}: ${esc(close.slice(0, 2).map(r => r.name).join(", "))}` : "No coin flips right now"}</small></span></button></section>`;
}
document.addEventListener("click", e => { const t = e.target.closest("[data-liverefresh]"); if(!t) return; liveRefresh(true); });
// on game days, check once after load so the rail badge, side panel and sky know games are on
setTimeout(()=>{ const d = new Date().getDay(); if([0, 1, 4].includes(d) && S.raw && S.raw.length && !LIVE.data) liveRefresh(); }, 6000);

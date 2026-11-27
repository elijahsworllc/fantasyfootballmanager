/* ---------- game weather: National Weather Service hourly forecast for each outdoor game, applied to this week's projections ----------
   Same forecast source mysportsweather.com uses (NWS). US games: api.weather.gov (public domain, CORS open).
   International games and NWS outages: Open-Meteo. Domes and roofed stadiums (ESPN venue.indoor) get no adjustment.
   The multiplier lands in pinfo()/weekInfo(), so lineups, the optimizer, Must fix swaps and Start/Sit all use it. */
const WX = {wk:null, p:null, g:{}, at:0};
const RETRACT = new Set(["ARI","ATL","DAL","HOU","IND"]);
const MSW = "https://mysportsweather.com/nfl";
const mphOf = s => { const n = String(s || "").match(/\d+/g); return n ? Math.max(...n.map(Number)) : 0; };
// the game window: the kickoff hour and the two after it
async function nwsAt(ll, ts){
  const pt = await getJSON(`https://api.weather.gov/points/${ll[0].toFixed(4)},${ll[1].toFixed(4)}`, {cache:"prefer"});
  const url = pt && pt.properties && pt.properties.forecastHourly; if(!url) return null;
  const j = await getJSON(url, {cache:"network"}).catch(()=>getJSON(url, {cache:"only"}));
  const win = ((j && j.properties && j.properties.periods) || []).filter(p=>{ const s = Date.parse(p.startTime); return s > ts - 3.6e6 && s < ts + 3*3.6e6; });
  if(!win.length) return null;
  const words = win.map(p=>p.shortForecast || "").join(" ").toLowerCase();
  return {temp: Math.round(win[0].temperature), wind: Math.max(...win.map(p=>mphOf(p.windSpeed))), rain: Math.max(...win.map(p=>(p.probabilityOfPrecipitation || {}).value || 0)),
    snow: /snow|flurr|sleet|wintry/.test(words), sky: win[0].shortForecast || "", src:"NWS"};
}
async function meteoAt(ll, ts){
  const day = new Date(ts).toISOString().slice(0,10), next = new Date(ts + 864e5).toISOString().slice(0,10);
  const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${ll[0]}&longitude=${ll[1]}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,snowfall&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC&start_date=${day}&end_date=${next}`, {cache:"network"});
  const h = j && j.hourly, i = new Date(ts).getUTCHours(); if(!h || !h.temperature_2m || h.temperature_2m[i] == null) return null;
  const at = (a, k) => (a || []).slice(i, i + k).filter(v=>v != null);
  return {temp: Math.round(h.temperature_2m[i]), wind: Math.round(Math.max(...at(h.wind_speed_10m, 3), 0)), rain: Math.max(...at(h.precipitation_probability, 3), 0),
    snow: at(h.snowfall, 3).some(v=>v > 0), sky:"", src:"Open-Meteo"};
}
function loadWeekWx(){
  const k = S.kick[S.week]; if(!k || !k.ok) return null;
  if(WX.p) return WX.p;
  if(WX.wk === S.week && Date.now() - WX.at < 30*60e3) return null;   // refresh every 30 minutes while the app is open
  WX.wk = S.week; WX.at = Date.now();
  const now = Date.now(), todo = k.games.filter(g=>!g.indoor && g.ts > now - 3*3.6e6 && g.ts - now < 15*864e5);   // Open-Meteo reaches about 16 days, NWS hourly about 7
  WX.p = pool(todo, 4, async g=>{
    const ll = (g.intl && (CITY[g.city] || CITY[g.vcity])) || STADIUM[g.home]; if(!ll) return;
    let v = g.intl || g.ts - Date.now() > 6.5*864e5 ? null : await nwsAt(ll, g.ts).catch(()=>null);
    if(!v) v = await meteoAt(ll, g.ts).catch(()=>null);
    if(v) WX.g[g.short] = {v, at: Date.now()};
  }).then(()=>{ WX.p = null; wxApply(); });
  return WX.p;
}
function wxApply(){
  (S.raw || []).forEach(x=>{ if(x) x.cache = null; });
  if(S.results.length) runAnalysis();
  render();
}
function gameWx(team){
  const g = team && gameOf(team); if(!g) return null;
  if(g.indoor) return {g, indoor:true};
  const e = WX.g[g.short]; return {g, w: e && e.v};
}
// Weather multipliers on projected points. Wind is the big one (passing and kicking), heavy rain/snow next, extreme cold last.
// Rough sizes from public NFL weather splits; tune here.
const WX_WIND = {QB:[.97,.92,.86,.80], WR:[.98,.94,.89,.84], TE:[.98,.95,.91,.86], K:[.95,.88,.80,.72], RB:[1,1.01,1.02,1.03], DEF:[1,1.03,1.06,1.08]};
const WX_WET = {QB:.96, WR:.96, TE:.97, K:.93, RB:1.02, DEF:1.03}, WX_SNOW = {QB:.97, WR:.97, TE:.98, K:.92}, WX_COLD = {QB:.97, WR:.97, TE:.98, K:.94};
function wxFactor(pos, w){
  if(!w) return {m:1, why:[]};
  let m = 1; const why = [], W = w.wind, b = W >= 25 ? 3 : W >= 20 ? 2 : W >= 15 ? 1 : W >= 12 ? 0 : -1;
  if(b >= 0 && WX_WIND[pos] && WX_WIND[pos][b] !== 1){ m *= WX_WIND[pos][b]; why.push(`${W} mph wind`); }
  if(w.rain >= 60 && WX_WET[pos]){ m *= WX_WET[pos]; if(w.snow && WX_SNOW[pos]) m *= WX_SNOW[pos]; why.push(`${w.rain}% chance of ${w.snow ? "snow" : "rain"}`); }
  if(w.temp <= 20 && WX_COLD[pos]){ m *= WX_COLD[pos]; why.push(`${w.temp}°F`); }
  return {m: +Math.max(.65, Math.min(1.12, m)).toFixed(3), why};
}
function wxMult(pos, team){
  const x = gameWx(team); return x && x.w ? wxFactor(pos, x.w).m : 1;
}
const wxPct = m => m === 1 ? "None" : `${m > 1 ? "+" : "−"}${Math.round(Math.abs(m - 1)*100)}%`;

/* ---------- Weather Watch (Game day): every game this week by weather impact, and your starters it moves ---------- */
const WX_POS = ["QB","WR","TE","RB","K","DEF"];
function wxRoof(g){ return g.indoor ? (RETRACT.has(g.home) ? "Retractable roof" : "Dome") : "Open air"; }
// severity of a game's forecast: how much it cuts the most-hit position (kickers aside)
function wxSeverity(w){ if(!w) return 0; return 1 - Math.min(...["QB","WR","TE"].map(p=>wxFactor(p, w).m)); }
function wxLevel(w){ const s = wxSeverity(w); return s >= .1 ? "high" : s >= .04 ? "mid" : s > 0 ? "low" : "none"; }
// one-line flag for any card that shows a game (home spotlight, lineups): null when the weather doesn't matter
function wxGameFlag(team){
  const x = gameWx(team); if(!x || x.indoor || !x.w || wxLevel(x.w) === "none") return null;
  const w = x.w, bits = [];
  if(w.wind >= 15) bits.push(`${w.wind} mph wind`);
  if(w.rain >= 60) bits.push(w.snow ? "snow" : "rain");
  if(w.temp <= 20) bits.push(`${w.temp}°F`);
  return {text: bits.join(" · ") || `${w.wind} mph wind`, level: wxLevel(w)};
}
// every starter whose projection the weather moves, grouped by player across leagues
function wxStarters(){
  const by = {};
  for(const r of S.results || []){
    if(!r.current || r.sev === "off") continue;
    for(const pid of r.current){
      if(!pid || pid === "0") continue;
      const f = r._c && r._c[pid] || pinfo(pid, r.league); if(!f || f.reason || f.locked) continue;
      const m = wxMult(f.pos, f.team); if(m === 1) continue;
      const e = by[pid] ||= {pid, f, m, why: wxFactor(f.pos, gameWx(f.team).w).why, leagues: [], delta: 0};
      e.leagues.push(r.league.name); e.delta += f.eff - f.eff / m;
    }
  }
  return Object.values(by).sort((a, b) => a.m - b.m);
}
function wxGameCard(g, mine, i){
  const x = gameWx(g.teams[0]) || {g}, w = x.w, lvl = g.indoor ? "none" : wxLevel(w);
  const fx = w ? WX_POS.map(p=>[p, wxFactor(p, w).m]).filter(([, m]) => m !== 1) : [];
  const fc = !w ? (g.indoor ? "No weather inside" : g.ts - Date.now() > 15*864e5 ? "Forecast opens closer to kickoff" : WX.p ? "Loading forecast…" : "No forecast yet")
    : `${w.temp}°F · wind ${w.wind} mph · ${w.rain}% ${w.snow ? "snow" : "rain"}${w.sky ? " · " + esc(w.sky) : ""}`;
  return `<article class="glass wxcard ${lvl}" style="--i:${i}">
    <div class="wxtop"><b class="wxgame">${esc(g.short || g.teams.join(" @ "))}</b><span class="wxkick">${esc(kickLabel(g))}</span></div>
    <div class="wxroof"><span class="pill wxp-${g.indoor ? "in" : "out"}">${wxRoof(g)}</span>${g.intl ? `<span class="intl">${esc(g.city || "Intl")}</span>` : ""}${lvl !== "none" ? `<span class="pill wxlv ${lvl}">${{high:"Big impact", mid:"Some impact", low:"Slight impact"}[lvl]}</span>` : ""}</div>
    <div class="wxfc">${fc}</div>
    ${fx.length ? `<div class="wxfx">${fx.map(([p, m]) => `<span class="${m < 1 ? "dn" : "up"}">${p} ${wxPct(m)}</span>`).join("")}</div>` : ""}
    ${mine.length ? `<div class="wxmine">Your starters: ${mine.slice(0, 4).map(id => esc(pname(id))).join(", ")}${mine.length > 4 ? ` +${mine.length - 4}` : ""}</div>` : ""}
  </article>`;
}
function viewWeather(){
  let h = `<section class="pagehead">${backBtn("home","Home")}<h1 class="h1">Weather Watch</h1><div class="sub">Kickoff forecasts for every outdoor game, and how much they move your starters' projections.</div></section>`;
  const k = S.kick[S.week];
  if(!k || k.loading) return h + `<div class="statusline"><span class="livedot" style="background:var(--violet)"></span>Loading this week's games…</div><div class="skel" aria-hidden="true"><i style="height:90px"></i><i style="height:240px"></i></div>`;
  if(!k.ok) return h + `<div class="glass ccempty">Couldn't load this week's kickoff times, so there's no weather to match yet.</div>`;
  loadWeekWx();
  const hit = wxStarters(), mineBy = {};
  for(const r of S.results || []) for(const pid of r.current || []){ const f = pid && pid !== "0" && (r._c && r._c[pid] || pinfo(pid, r.league)); if(f && f.team) (mineBy[f.team] ||= new Set()).add(pid); }
  const games = k.games.filter(g => g.ts > Date.now() - 4*3.6e6), outdoor = games.filter(g => !g.indoor);
  const rough = outdoor.filter(g => { const x = gameWx(g.teams[0]); return x && x.w && wxLevel(x.w) !== "none"; });
  const lost = hit.reduce((s, e) => s + Math.min(0, e.delta), 0);
  h += `<section class="glass lvsum"><span class="lvsoon">Week ${S.week} forecast</span><div class="lvstats">
    <div><b class="num">${rough.length}<small>/${outdoor.length}</small></b><span>outdoor games with weather</span></div>
    <div><b class="num">${hit.length}</b><span>of your starters affected</span></div>
    <div><b class="num">${lost ? lost.toFixed(1) : "0"}</b><span>projected pts from weather</span></div></div>
    <small class="lvat">${WX.p ? "Updating forecasts…" : WX.at ? `Updated ${new Date(WX.at).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})} · refreshes every 30 minutes` : ""}</small></section>`;
  const wxRow = e => `<button class="wxrow" data-opentool="start"><span class="t"><b>${esc(pname(e.pid))}</b><small>${esc(pmeta(e.pid))} · ${esc(e.why.join(", "))} · ${e.leagues.length} league${e.leagues.length > 1 ? "s" : ""}</small></span><span class="wxadj ${e.m < 1 ? "dn" : "up"}">${wxPct(e.m)}</span></button>`;
  // biggest moves first: everyone cut by weather, then the few it helps; the long tail folds away
  const top = hit.slice().sort((a, b) => Math.abs(b.m - 1) - Math.abs(a.m - 1)).slice(0, 6), rest = hit.filter(e => !top.includes(e));
  if(hit.length) h += `<section class="glass wxlist"><h2 class="h2">Your starters in the weather</h2>${top.map(wxRow).join("")}${rest.length ? `<details class="wxmore"><summary>Show all ${hit.length}</summary>${rest.map(wxRow).join("")}</details>` : ""}</section>`;
  else if(!WX.p) h += `<div class="glass ccempty">None of your starters play in weather that moves their projection this week.</div>`;
  const order = games.slice().sort((a, b) => { const sa = a.indoor ? -1 : wxSeverity((gameWx(a.teams[0]) || {}).w), sb = b.indoor ? -1 : wxSeverity((gameWx(b.teams[0]) || {}).w); return sb - sa || a.ts - b.ts; });
  h += `<h2 class="h2 wxh">Every game this week</h2><div class="lvgrid">${order.map((g, i) => wxGameCard(g, [...new Set(g.teams.flatMap(t => [...(mineBy[t] || [])]))], i)).join("")}</div>`;
  h += `<details class="glass wxhow"><summary>How the adjustment works</summary><p>For each outdoor game we read the hourly forecast for kickoff and the two hours after, then multiply each player's projection by position. Domes and closed roofs get no change.</p>
    <table class="mini"><thead><tr><th>Condition</th><th>QB</th><th>WR</th><th>TE</th><th>K</th><th>RB</th><th>DEF</th></tr></thead><tbody>
    ${[["Wind 12+ mph",0],["Wind 15+ mph",1],["Wind 20+ mph",2],["Wind 25+ mph",3]].map(([l, b]) => `<tr><td>${l}</td>${["QB","WR","TE","K","RB","DEF"].map(p => `<td class="num">${wxPct(WX_WIND[p][b])}</td>`).join("")}</tr>`).join("")}
    <tr><td>Rain or snow 60%+</td>${["QB","WR","TE","K","RB","DEF"].map(p => `<td class="num">${wxPct(WX_WET[p])}</td>`).join("")}</tr>
    <tr><td>Snow (extra)</td>${["QB","WR","TE","K","RB","DEF"].map(p => `<td class="num">${wxPct(WX_SNOW[p] || 1)}</td>`).join("")}</tr>
    <tr><td>20°F or colder</td>${["QB","WR","TE","K","RB","DEF"].map(p => `<td class="num">${wxPct(WX_COLD[p] || 1)}</td>`).join("")}</tr></tbody></table></details>`;
  h += `<p class="src">Forecasts: National Weather Service hourly forecast for each stadium (Open-Meteo for international games and games more than a week out). Roofs: ESPN. For meteorologist notes and live roof calls, see <a href="${MSW}" target="_blank" rel="noopener">mysportsweather.com</a>.</p>`;
  return h;
}

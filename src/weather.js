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

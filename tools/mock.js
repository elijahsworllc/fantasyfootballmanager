// Deterministic fake Sleeper + FantasyCalc data for exercising the app offline.
let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const TEAMS = ["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LV","LAC","LAR","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SF","SEA","TB","TEN","WAS"];
const FIRST = ["Puka","Garrett","Bijan","Jaylen","Rashee","Kyren","Drake","Ladd","Bo","Derrick","Mike","Kenneth","Tyjae","Rome","Jayden","Xavier","Bucky","Dalton","George","Jonathan","Josh","Lamar","Jalen","Joe","CJ","Caleb","Malik","Tee","Zay","Amon","Nico","Brock","Sam","Trey","Breece","Saquon","Jahmyr","Travis","Davante","Cooper"];
const LAST = ["Nacua","Wilson","Robinson","Waddle","Rice","Williams","London","McConkey","Nix","Henry","Evans","Walker","Spears","Odunze","Reed","Legette","Irving","Kincaid","Kittle","Taylor","Allen","Jackson","Hurts","Burrow","Stroud","Williams2","Nabers","Higgins","Flowers","St. Brown","Collins","Bowers","LaPorta","McBride","Hall","Barkley","Gibbs","Kelce","Adams","Kupp"];
const POS = []; for(let i=0;i<24;i++) POS.push("QB"); for(let i=0;i<60;i++) POS.push("RB"); for(let i=0;i<80;i++) POS.push("WR"); for(let i=0;i<28;i++) POS.push("TE"); for(let i=0;i<12;i++) POS.push("K");
const players = POS.map((pos, i) => {
  const id = String(1000 + i), team = TEAMS[i % 32];
  const r = rnd(); const inj = r < 0.05 ? "Out" : r < 0.08 ? "IR" : r < 0.14 ? "Questionable" : r < 0.16 ? "Doubtful" : null;
  const base = {QB:18, RB:11, WR:11, TE:7, K:8}[pos] * (0.4 + rnd()*1.1);
  return {id, pos, team: i === 7 ? null : team, inj, first: FIRST[i % FIRST.length], last: LAST[(i*7) % LAST.length] + (i >= 40 ? " " + String.fromCharCode(65 + (i % 26)) : ""), age: 21 + Math.floor(rnd()*13), pts: base};
});
const DEFS = TEAMS.map(t => ({id:t, pos:"DEF", team:t, inj:null, first:t, last:"Defense", age:null, pts: 6 + rnd()*4}));
const ALL = players.concat(DEFS);
// week 6 is always the coming Thu/Sun/Mon, so lock times stay in the future whenever the tests run
const WK6 = (()=>{ const d = new Date(); d.setUTCHours(12,0,0,0); d.setUTCDate(d.getUTCDate() + 1); while(d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() + 1);
  const f = x => x.toISOString().slice(0,10), sun = new Date(d.getTime() + 3*864e5), mon = new Date(d.getTime() + 4*864e5); return {thu:f(d), sun:f(sun), mon:f(mon)}; })();
const BYE = new Set(["MIA","KC"]); // week 6 byes
function projections(week){
  return ALL.map(p => {
    const pts = p.pts * (0.8 + rnd()*0.4);
    const stats = {pts_ppr: pts};
    if(p.pos === "QB"){ stats.pass_yd = pts*12; stats.pass_td = pts/10; }
    else if(p.pos === "RB"){ stats.rush_yd = pts*5; stats.rush_att = pts; stats.rec = pts/6; stats.rec_tgt = pts/5; }
    else if(p.pos === "WR" || p.pos === "TE"){ stats.rec = pts/3.2; stats.rec_yd = pts*5; stats.rec_tgt = pts/2.4; }
    else if(p.pos === "K"){ stats.xpm = 3; stats.fgm_30_39 = 1.4; }
    else { stats.def_td = 0.3; stats.sack = 2.5; stats.int = 1; }
    return {player_id: p.id, player: {first_name: p.first, last_name: p.last, position: p.pos, team: p.team, injury_status: p.inj, fantasy_positions: [p.pos]}, stats};
  });
}
function schedule(){
  const g = [];
  for(let w = 1; w <= 18; w++){
    const ts = TEAMS.filter(t => !(w === 6 && BYE.has(t)));
    for(let i = 0; i + 1 < ts.length; i += 2){
      const day = w === 6 ? (i === 0 ? WK6.thu : i < 24 ? WK6.sun : WK6.mon) : `2026-${String(9 + Math.floor((w+5)/5)).padStart(2,"0")}-${String(((w*7)%28)+1).padStart(2,"0")}`;
      g.push({week:w, home:ts[i], away:ts[(i + w) % ts.length === i ? i+1 : i+1], date:day, status: w < 6 ? "complete" : "pre_game"});
    }
  }
  return g;
}
const SC = {rec:1, rec_yd:0.1, rush_yd:0.1, pass_yd:0.04, pass_td:4, rec_td:6, rush_td:6, xpm:1, fgm_30_39:3, sack:1, int:2, def_td:6, bonus_rec_te:0.5};
const ROSTER_POS = ["QB","RB","RB","WR","WR","TE","FLEX","SUPER_FLEX","K","DEF","BN","BN","BN","BN","BN","BN","BN","BN"];
const NAMES = ["Gridiron Dynasty SF","Devy Dreamers","The Taxi Squad League","Dynasty Degenerates 12T","Superflex Sickos","Best Ball Mania VII"];
const leagues = NAMES.map((name, i) => ({league_id: String(900000 + i), name, season:"2026", status:"in_season", total_rosters:12,
  roster_positions: ROSTER_POS, scoring_settings: SC,
  settings: {type: 2, max_subs: i % 2 ? 0 : 2, waiver_type: 2, waiver_budget: 100, waiver_bid_min: 0, playoff_teams: 6, playoff_week_start: 15, start_week: 1, draft_rounds: 4, best_ball: i === 5 ? 1 : 0}}));
const ME = "1064668485038567424";
function rostersFor(lg, li){
  const pool = players.slice().sort(() => rnd() - 0.5), defs = DEFS.slice().sort(() => rnd() - 0.5);
  const out = [];
  for(let k = 0; k < 12; k++){
    const mine = pool.slice(k*16, k*16 + 15).map(p=>p.id).concat([defs[k].id]);
    // starters: take one per slot by position order
    const left = mine.slice(); const take = pos => { const j = left.findIndex(id => { const p = ALL.find(x=>x.id===id); return pos.includes(p.pos); }); return j < 0 ? "0" : left.splice(j,1)[0]; };
    const starters = ROSTER_POS.filter(s=>s!=="BN").map(s => take({QB:["QB"],RB:["RB"],WR:["WR"],TE:["TE"],FLEX:["RB","WR","TE"],SUPER_FLEX:["QB","RB","WR","TE"],K:["K"],DEF:["DEF"]}[s]));
    const wins = Math.floor(rnd()*6);
    out.push({roster_id: k+1, owner_id: k === 0 ? ME : "u" + li + "_" + k, players: mine, starters, reserve: [], taxi: [],
      settings: {wins, losses: 5 - wins, ties: 0, fpts: 500 + Math.floor(rnd()*300), fpts_decimal: 0, waiver_budget_used: Math.floor(rnd()*60)}});
  }
  return out;
}
const ROSTERS = {}; leagues.forEach((lg, i) => ROSTERS[lg.league_id] = rostersFor(lg, i));
function matchups(lid, week){
  return ROSTERS[lid].map((r, i) => ({roster_id: r.roster_id, matchup_id: Math.floor(i/2) + 1, starters: r.starters, players: r.players, players_points: {}, points: 0}));
}
function users(lid, li){ return ROSTERS[lid].map(r => ({user_id: r.owner_id, display_name: r.owner_id === ME ? "jahswor" : "Mgr " + r.roster_id, metadata: {team_name: r.owner_id === ME ? "My Team" : ["Win Now Willie","Rebuild Rangers","Tank Commander","Gridiron Gang","QB Hoarder","Taxi Kings","The Bench Mob","Sunday Funday","Waiver Wolves","Flex Appeal","Hail Marys"][r.roster_id-2]}})); }
function transactions(lid, week){
  if(week > 5) return [];
  const R = ROSTERS[lid]; const out = [];
  for(let k = 0; k < 3; k++){ const a = R[(week*3 + k) % 12], b = R[(week*5 + k + 1) % 12]; if(a === b) continue;
    out.push({transaction_id: lid + "-" + week + "-" + k, type:"trade", status:"complete", created: Date.now() - (6-week)*7*864e5, status_updated: Date.now() - (6-week)*7*864e5, leg: week,
      adds: {[a.players[5]]: b.roster_id, [b.players[6]]: a.roster_id}, drops: {}, roster_ids: [a.roster_id, b.roster_id], draft_picks: [], settings: null}); }
  out.push({transaction_id: lid + "-w-" + week, type:"waiver", status:"complete", created: Date.now(), status_updated: Date.now(), leg: week, adds: {[players[150+week].id]: R[2].roster_id}, drops: {}, roster_ids:[R[2].roster_id], draft_picks: [], settings: {waiver_bid: 7 + week}});
  return out;
}
function fcValues(){
  const arr = players.map(p => ({player: {name: p.first + " " + p.last, position: p.pos, sleeperId: p.id, maybeAge: p.age + rnd()}, value: Math.round(p.pts * 380 * (1.4 - (p.age - 21)/25)), redraftValue: Math.round(p.pts * 300), trend30Day: Math.round((rnd()-0.5)*600)}));
  for(const y of [2027, 2028, 2029]) for(const [r, v] of [["1st",5200],["2nd",2100],["3rd",900],["4th",400]]){
    arr.push({player:{name:`${y} ${r}`, position:"PICK"}, value: v}); for(const t of ["Early","Mid","Late"]) arr.push({player:{name:`${y} ${r} (${t})`, position:"PICK"}, value: Math.round(v*(t==="Early"?1.25:t==="Mid"?1:0.8))}); }
  return arr;
}
function route(url){
  const u = new URL(url), p = u.pathname;
  if(u.hostname === "api.fantasycalc.com") return fcValues();
  if(u.hostname === "api.open-meteo.com"){ const n = 24; return {hourly:{time:Array.from({length:n},(_, i)=>i), temperature_2m:Array.from({length:n},()=>48), precipitation_probability:Array.from({length:n},()=>60), wind_speed_10m:Array.from({length:n},()=>17)}}; }
  if(u.hostname === "site.api.espn.com"){
    const wk = +u.searchParams.get("week"), games = schedule().filter(g=>g.week===wk);
    const toESPN = t => t === "WAS" ? "WSH" : t;
    return {events: games.map((g, i)=>{ const d = new Date(g.date + "T12:00:00Z"), dow = d.getUTCDay();
      let iso = dow === 4 ? new Date(Date.parse(g.date+"T00:15:00Z") + 864e5).toISOString() : dow === 1 ? new Date(Date.parse(g.date+"T00:15:00Z") + 864e5).toISOString() : i === 1 ? g.date + "T13:30:00Z" : i % 3 ? g.date + "T17:00:00Z" : g.date + "T20:25:00Z";
      const intl = i === 1;
      return {date: iso.replace(":00.000Z","Z"), name: g.away + " at " + g.home, shortName: g.away + (intl ? " VS " : " @ ") + g.home,
        competitions: [{neutralSite: intl, venue: {indoor: ["ATL","DET","LV","MIN","NO","IND","ARI","DAL","HOU","LAR","LAC"].includes(g.home), fullName: intl ? "Tottenham Hotspur Stadium" : "Stadium", address: intl ? {city: "London", country: "England"} : {city: "X", state: "Y", country: "USA"}},
          competitors: [{homeAway: "home", team: {abbreviation: toESPN(g.home)}}, {homeAway: "away", team: {abbreviation: toESPN(g.away)}}]}]}; })};
  }
  if(u.hostname !== "api.sleeper.app") return null;
  let m;
  if((m = p.match(/^\/v1\/user\/([^/]+)$/))) return {user_id: ME, username: "jahswor", display_name: "jahswor"};
  if(p === "/v1/state/nfl") return {season: "2026", week: 6, season_type: "regular"};
  if(p.startsWith("/schedule/nfl/")) return schedule();
  if((m = p.match(/^\/projections\/nfl\/\d+\/(\d+)/))) return projections(+m[1]);
  if(p.match(/^\/v1\/user\/[^/]+\/leagues\/nfl\/\d+$/)) return leagues;
  if((m = p.match(/^\/v1\/league\/(\d+)\/rosters$/))) return ROSTERS[m[1]];
  if((m = p.match(/^\/v1\/league\/(\d+)\/matchups\/(\d+)$/))) return matchups(m[1], +m[2]);
  if((m = p.match(/^\/v1\/league\/(\d+)\/users$/))) return users(m[1]);
  if((m = p.match(/^\/v1\/league\/(\d+)\/traded_picks$/))) return [];
  if((m = p.match(/^\/v1\/league\/(\d+)\/transactions\/(\d+)$/))) return transactions(m[1], +m[2]);
  if(p.startsWith("/v1/players/nfl/trending")) return [];
  if((m = p.match(/^\/stats\/nfl\/player\/(\w+)$/))){ const pl = ALL.find(x=>x.id === m[1]); if(!pl) return {}; const sch = schedule(); const o = {};
    for(let w = 1; w <= 18; w++){ if(w >= 6){ o[w] = null; continue; } const g = sch.find(z=>z.week===w && (z.home===pl.team || z.away===pl.team)); if(!g){ o[w] = null; continue; }
      const pts = Math.max(0, pl.pts*(0.4 + rnd()*1.2)); o[w] = {week:w, team:pl.team, opponent: g.home===pl.team ? g.away : g.home, is_away_team: g.away===pl.team, date:g.date, stats:{gp:1, pts_ppr:+pts.toFixed(1), rec:Math.round(pts/3), rec_tgt:Math.round(pts/2.4), rec_yd:Math.round(pts*5), rush_att:pl.pos==="RB"?Math.round(pts):0, rush_yd:pl.pos==="RB"?Math.round(pts*4):0, pass_yd:pl.pos==="QB"?Math.round(pts*12):0, pass_td:pl.pos==="QB"?2:0, off_snp:40+Math.round(rnd()*25), tm_off_snp:68}}; }
    return o; }
  if((m = p.match(/^\/stats\/nfl\/\d+\/(\d+)$/))){ const w = +m[1], sch = schedule().filter(z=>z.week===w);
    return players.filter(pl=>pl.team).map(pl=>{ const g = sch.find(z=>z.home===pl.team || z.away===pl.team); if(!g) return null; return {player_id:pl.id, team:pl.team, opponent: g.home===pl.team ? g.away : g.home, player:{position:pl.pos}, stats:{pts_ppr:+(pl.pts*(0.5+rnd())).toFixed(1)}}; }).filter(Boolean); }
  return null;
}
module.exports = {route};

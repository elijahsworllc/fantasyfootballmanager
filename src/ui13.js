/* =====================================================================
   Trade Optimizer v3 (Nov 28, 2026)
   A trading desk for every league, priced on the in-house market and tuned with Elijah over four rounds of
   rated prototypes (see /mnt/project-files/trade-optimizer-v3 for the offline engine it was ported from).

   Price. Every asset starts from the FFU Index (fitted only on real trades in the FFU database, recent
   trades weighted most). Where a player has few trades it leans toward market consensus (FantasyCalc,
   mapped onto the Index's scale with a log-log fit). Packages add with the same power mean the Index was
   fitted with (P = 1.45), so three mid pieces never add up to a star.
   Today's price then moves with: the 30-day consensus trend (the Index lags falling players), recent
   production (last three games against the season), the rest-of-season outlook (projected rank this year
   against dynasty rank, which carries real-team role, depth chart and schedule) and injuries (the market
   docks half; contenders, who need him now, dock the rest).
   Later price (after the season) uses the un-boosted price, the trend and an age curve: productive vets
   lose value every offseason, young studs hold theirs.

   Situation. A season sim on each league's real remaining schedule gives every team its playoff and title
   odds and how much a point a week moves them, which sets each team's direction.

   Offers. Your side is judged on your goal (title odds when contending, later value when rebuilding); the
   partner judges at today's market and their own direction. Offers lean your way, because sending trades
   is a volume game: the partner gets 88% to 105% of market, and below fair only when fit makes up for it.
   Each league's board spreads play types, partners, sizes and players. You can still tag pieces Trade or
   Core and add targets. Marking an offer Sent logs it on the Offers page, where you record the answer.
   ===================================================================== */
VIEWS.add("optimizer");
const OPT = {lid:null, res:{}, busy:null, idx:null, idxP:null, nfl:null, nflP:null, tagLg:null, q:"", side:"buys", sideMore:false,
  pulse:null, pulseP:null, prod:null, prodP:null, maps:{}, mkt:null};
const OPT_P = 1.45;
const optX = v => Math.pow(Math.max(v, 0), OPT_P);
const optPm = list => Math.pow(list.reduce((s, a)=>s + optX(a.now), 0), 1/OPT_P);
const optPmF = list => Math.pow(list.reduce((s, a)=>s + optX(a.fwd), 0), 1/OPT_P);
const oclamp = (x, a, b) => Math.max(a, Math.min(b, x));
const onum = n => Math.round(n).toLocaleString();
const OPT_KINDS = {"Consolidate":"Two or three pieces for one better one", "Split":"One piece for two that help", "Rent a vet":"Buy a declining vet's points for the title run",
  "Sell the vet":"Sell an aging asset before the price drops", "Sell high":"Sell into a hot streak", "Buy low":"Buy a dip in a player who's still producing",
  "Pick play":"Picks are the main currency", "Position swap":"Surplus for need, both ways", "Retool":"Same value, better fit for both"};
const OPT_WORTH = {Contender:{ti:.55, po:.05}, Middle:{ti:.3, po:.12}, Rebuild:{ti:.04, po:.02}};
const OPT_DIRTXT = {Contender:"Contending", Middle:"In the middle", Rebuild:"Rebuilding"};
// Redraft leagues are their own mode: FantasyCalc redraft prices, this season only
const optRedraft = L => ((L.lg.settings || {}).type || 0) === 0;
const optMode = () => store.get("optMode", "dyn");
const optView = () => store.get("optView", "best");
function optIdle(p){ const a = p.act || {}, pr = p.prof || {}, last = Math.max(a.last || 0, pr.last || 0);
  if(!(a.moves || 0) && !(pr.n || 0)) return "No trades or roster moves this season";
  if(last && Date.now() - last > 45*864e5) return `Last trade or roster move ${ago(last)}`;
  return null; }

/* ---------- your choices per league: Trade / Core tags and targets (synced with your account like other settings) ---------- */
function optCfg(lid){ const c = store.get("opt:" + lid, null) || {}; return {trade:c.trade || [], core:c.core || [], want:c.want || []}; }
function optSave(lid, c){ store.set("opt:" + lid, c); delete OPT.res[lid]; }
function optDirSet(lid){ return store.get("dir:" + lid, null); }

/* ---------- data ---------- */
// FFU Index: values fitted only on real trades (backend/ffu-index.mjs)
function loadIndex(){ return OPT.idxP ||= fetch(FFU_API + "/api/app/index").then(r=>r.ok ? r.json() : null).catch(()=>null).then(x=>{ OPT.idx = x; return x; }); }
// the trade market right now: last 24 hours of trades and 7-day trade counts, from the FFU database
function optLoadPulse(){ return OPT.pulseP ||= fetch(FFU_API + "/api/app/pulse").then(r=>r.ok ? r.json() : null).catch(()=>null).then(x=>{ OPT.pulse = x; return x; }); }
// weekly fantasy points this season (PPR), for recent production
function optLoadProd(){
  return OPT.prodP ||= (typeof weekStats === "function" ? weekStats() : Promise.resolve([])).then(weeks=>{
    const by = {}; (weeks || []).forEach(rows=>{ if(!Array.isArray(rows)) return;
      for(const r of rows){ const s = r.stats || {}; if(!(s.gp > 0)) continue; (by[r.player_id] ||= []).push(s.pts_ppr || 0); } });
    return OPT.prod = by;
  }).catch(()=>OPT.prod = {});
}
// NFL context: records (ESPN) and the schedule (Sleeper), for playoff-week matchups
function loadNfl(){
  return OPT.nflP ||= (async()=>{
    const out = {rec:{}, sched:{}};
    try{ const j = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${S.season}&seasontype=2&week=${S.week}`, {cache:"network"});
      for(const ev of j.events || []) for(const c of ((ev.competitions || [])[0] || {}).competitors || []){ const a = c.team && c.team.abbreviation, ab = (typeof ESPN_FIX !== "undefined" && ESPN_FIX[a]) || a;
        const r = (c.records || []).find(x=>x.type === "total") || (c.records || [])[0]; if(ab && r && r.summary) out.rec[ab] = r.summary; } }catch(e){}
    try{ const all = await getJSON(`${API}/schedule/nfl/regular/${S.season}`);
      for(const g of all || []) for(const t of [g.home, g.away]) (out.sched[t] ||= {})[g.week] = t === g.home ? g.away : g.home; }catch(e){}
    try{ if(typeof loadDef === "function") await loadDef(); }catch(e){}
    OPT.nfl = out; return out;
  })();
}

/* ---------- pricing ---------- */
const optShape = L => L.fc && L.fc.meta && L.fc.meta.q === 2 ? "sf" : "oneqb";
// consensus -> Index scale, a weighted log-log fit over players both price (one per league shape and value table)
function optMap(L){
  const key = fcKey(L.lg); if(OPT.maps[key] !== undefined) return OPT.maps[key];
  const ix = OPT.idx && OPT.idx[optShape(L)]; if(!ix || optRedraft(L)) return OPT.maps[key] = null;
  const xs = []; let W = 0, mx = 0, my = 0;
  for(const id in ix){ const f = L.fc.players[id], e = ix[id]; if(!f || f.src === "dp" || f.v < 300 || !(e[0] > 0)) continue; const w = Math.min(1, e[1]/50); xs.push([Math.log(f.v), Math.log(e[0]), w]); W += w; }
  if(xs.length < 40) return OPT.maps[key] = null;
  for(const [x, y, w] of xs){ mx += w*x/W; my += w*y/W; }
  let a = 0, b = 0; for(const [x, y, w] of xs){ a += w*(x - mx)*(y - my); b += w*(x - mx)**2; }
  return OPT.maps[key] = {b:a/b, c:my - (a/b)*mx, ix};
}
// age curve: productive vets lose value every offseason, young studs hold it
function optDecay(pos, a){ if(!a) return 0;
  if(pos === "RB") return a >= 29 ? .38 : a >= 28 ? .28 : a >= 27 ? .16 : a >= 26 ? .06 : 0;
  if(pos === "WR") return a >= 31 ? .34 : a >= 30 ? .24 : a >= 29 ? .13 : a >= 28 ? .05 : 0;
  if(pos === "TE") return a >= 32 ? .3 : a >= 31 ? .17 : a >= 30 ? .08 : 0;
  if(pos === "QB") return a >= 36 ? .3 : a >= 35 ? .2 : a >= 34 ? .12 : a >= 33 ? .05 : 0; return 0; }
function optHold(pos, a){ if(!a) return 0;
  if(pos === "RB") return a < 23 ? .1 : a < 24 ? .07 : a < 25 ? .03 : 0;
  if(pos === "WR" || pos === "TE") return a < 23 ? .12 : a < 24 ? .09 : a < 25 ? .05 : a < 26 ? .02 : 0;
  if(pos === "QB") return a < 25 ? .1 : a < 27 ? .05 : 0; return 0; }
const OPT_INJ_NOW = {IR:.8, PUP:.8, Out:.9, Doubtful:.93, Sus:.92, Questionable:.98};   // short-term dock on trade value
const OPT_INJ_FWD = {IR:.94, PUP:.94, Out:.98};                                          // little of it lasts into the offseason
const OPT_HURT = new Set(["IR", "PUP", "Out", "Doubtful", "Sus"]);
const optInj = id => { const p = ((S.proj[id] || (S.proj2 || {})[id]) || {}).player || {}; const s = p.injury_status; return s && s !== "Healthy" ? s : null; };
// rest-of-season outlook: position percentile of projected points here vs dynasty price (both inside this league's table)
function optOutlook(L){
  if(L._oo) return L._oo;
  const by = {};
  for(const id in L.fc.players){ const f = L.fc.players[id]; if(!["QB","RB","WR","TE"].includes(f.pos) || f.v < 800 || f.src === "dp") continue; (by[f.pos] ||= []).push({id, v:f.v, r:ppw(id, L.lg, L.cache)}); }
  const out = {};
  for(const pos in by){ const xs = by[pos], n = xs.length; if(n < 10) continue;
    [...xs].sort((a,b)=>b.v - a.v).forEach((x, i)=>x.dyn = 1 - i/(n - 1)); [...xs].sort((a,b)=>b.r - a.r).forEach((x, i)=>x.ros = 1 - i/(n - 1));
    for(const x of xs) out[x.id] = x.ros - x.dyn; }
  return L._oo = out;
}
function optPrice(L, a){
  if(a._p && a._p.L === L) return a._p;
  const red = optRedraft(L), m = optMap(L), f = L.fc.players[a.id] || {}, out = {L, id:a.id, k:a.k, name:a.name, pos:a.pos, age:a.age || null, team:a.team || null, flags:[]};
  if(a.pos === "PICK"){
    const e = m && m.ix[a.key];
    let v = e ? e[0] : m ? Math.exp(m.c + m.b*Math.log(Math.max(a.v, 50))) : a.v;
    if(e && a.tier) v *= a.tier === "Early" ? 1.3 : a.tier === "Mid" ? 1.04 : .9;   // the Index prices a generic pick; next year's slot is known
    Object.assign(out, {now:v, fwd:v*(a.soon && a.round <= 2 ? 1.06 : 1), base:v, n:e ? e[1] : 0, idx:e ? e[0] : null, tr:0, dec:0, hold:0, prod:0, ctx:0, injD:1, ppg:0, l3:0, lg1:0, gp:0, ros:0, inj:null});
    return a._p = out;
  }
  const iv = m && m.ix[a.id], fv = f.v || a.v || 0, mapped = m && fv ? Math.exp(m.c + m.b*Math.log(fv)) : null, B = m ? m.b : 1;
  let base, c = 0;
  if(iv && mapped){ c = Math.min(.85, iv[1]/(iv[1] + 40)); base = Math.exp(c*Math.log(iv[0]) + (1 - c)*Math.log(mapped)); }
  else if(iv){ c = 1; base = iv[0]; } else base = mapped || fv || 300;
  const trend = f.trend != null ? f.trend : (a.trend || 0);
  const tr = fv - trend > 50 ? oclamp(trend/(fv - trend), -.6, 1.5) : 0;
  let now = base*Math.exp(B*c*.5*Math.log(1 + tr));   // the index lags: add half the consensus trend on its share
  const tep = (L.lg.scoring_settings || {}).bonus_rec_te || 0; if(a.pos === "TE" && tep) now *= 1 + .06*tep;
  const age = a.age || f.age || null, dec = red ? 0 : optDecay(a.pos, age), hold = red ? 0 : optHold(a.pos, age), inj = optInj(a.id);
  const fwd = red ? null : now*Math.exp(B*((tr < 0 ? .6 : .15)*Math.log(1 + tr) + Math.log(1 - dec) + Math.log(1 + hold*(now >= 3000 ? 1 : .5))))*(OPT_INJ_FWD[inj] || 1);
  // this season: recent production, outlook, injuries
  const g = (OPT.prod || {})[a.id] || [], gp = g.length, ppg = gp ? g.reduce((s, x)=>s + x, 0)/gp : 0, l3a = g.slice(-3), l3 = l3a.length ? l3a.reduce((s, x)=>s + x, 0)/l3a.length : 0, lg1 = gp ? g[gp - 1] : 0;
  let prod = 0; if(gp >= 4 && ppg > 3) prod = oclamp(.22*Math.log((.6*l3 + .4*ppg)/ppg), -.08, .12);
  if(gp >= 4 && lg1 >= 25) prod = Math.min(.15, prod + .04);
  const oo = optOutlook(L)[a.id], ctx = oo != null && !OPT_HURT.has(inj) ? oclamp(.3*oo, -.12, .12) : 0, injD = OPT_INJ_NOW[inj] || 1;
  const pre = now;
  now = now*Math.exp(prod + .5*ctx)*(1 - (1 - injD)*.5);
  const ros = ppw(a.id, L.lg, L.cache);
  Object.assign(out, {now, fwd: red ? now : fwd, base:pre, n:iv ? iv[1] : 0, idx:iv ? iv[0] : null, fc:fv, tr, dec, hold, prod, ctx, injD, inj, age,
    ppg:+ppg.toFixed(1), l3:+l3.toFixed(1), lg1:+lg1.toFixed(1), gp, ros:+ros.toFixed(1)});
  // market signals (exclusive)
  if(ros > 0 && gp >= 4 && l3 >= Math.max(14, ppg*1.3) && (dec > 0 || ros < l3*(hold ? .65 : .8))) out.flags.push("sellHigh");
  if(ros > 0 && lg1 >= 25 && ros < lg1*(hold ? .5 : .65) && gp >= 4) out.flags.push("sellHigh");
  const hot = out.flags.includes("sellHigh");
  if(!red && !hot && tr <= -.12 && dec === 0 && (ros >= 11 || ppg >= 12)) out.flags.push("buyLow");
  if(!red && !hot && iv && mapped && iv[0] < mapped*.85 && iv[1] >= 30 && dec === 0) out.flags.push("buyLow");
  if(!red && (dec >= .16 || tr <= -.2)){ out.flags = out.flags.filter(x=>x !== "buyLow"); out.flags.push("fading"); }
  out.flags = [...new Set(out.flags)];
  return a._p = out;
}
// every tradable asset of a team, priced
function optAssets(L, t){
  if(t._oa3 && t._oa3.L === L) return t._oa3.list;
  const soon = +L.lg.season + 1, list = [];
  for(const p of t.bp.pl) if(["QB","RB","WR","TE"].includes(p.pos)) list.push(optPrice(L, {k:p.id, id:p.id, name:p.name, pos:p.pos, v:p.v, age:p.age, trend:p.trend, team:p.team || ((S.proj[p.id] || {}).player || {}).team}));
  for(const p of t.bp.picks) if(p.round <= 3 && p.val > 0)
    list.push(optPrice(L, {k:`pk${p.season}-${p.round}-${p.orig}`, id:"PICK:" + p.season + "-" + p.round + "-" + p.orig, key:`${p.season}-${p.round}`, name:pickLabel(p) + (p.mine ? "" : " (via trade)"),
      pos:"PICK", v:p.val, tier:p.tier || null, round:p.round, soon:+p.season === soon}));
  t._oa3 = {L, list}; return list;
}

/* ---------- team situation: direction, how much a point a week moves the odds, core value ---------- */
function optTeams(L){
  if(L._ot) return L._ot;
  const base = simulate(L, null, 500, 21), red = optRedraft(L), T = new Map();
  for(const t of L.teams){
    const up = simulate(L, {[t.i]:6}, 500, 21)[t.i], dn = simulate(L, {[t.i]:-6}, 500, 21)[t.i], o = t.odds;
    let dir = o.title >= .12 || o.po >= .7 ? "Contender" : o.po < .15 && !red ? "Rebuild" : "Middle";
    if(t === L.me){ const set = optDirSet(L.lg.league_id); if(set === "contend") dir = "Contender"; else if(set === "rebuild" && !red) dir = "Rebuild"; }
    const all = optAssets(L, t), core = [...all].sort((a, b)=>b.fwd - a.fwd).slice(0, 22).reduce((s, a)=>s + optX(a.fwd), 0) || 1;
    T.set(t, {t, dir, po:o.po, ti:o.title, dTi:(up.title - dn.title)/12, dPo:(up.po - dn.po)/12, all, core});
  }
  return L._ot = {T, base};
}

/* ---------- rules: can this trade be made in Sleeper? ---------- */
function leagueOpen(L){
  const set = L.lg.settings || {};
  if(set.disable_trades) return {ok:false, why:"Trades are turned off in this league."};
  const dl = set.trade_deadline;
  if(dl && dl < 99 && S.week > dl) return {ok:false, why:`The trade deadline was week ${dl}.`};
  if(L.lg.status !== "in_season") return {ok:false, why:"The season isn't underway."};
  return {ok:true, deadline: dl && dl < 99 ? dl : null};
}
function rosterRoom(L, t, out, inn){
  const r = t.bp.roster, res = r.reserve || [], taxi = r.taxi || [], active = (r.players || []).filter(p=>!res.includes(p) && !taxi.includes(p)).length;
  const max = (L.lg.roster_positions || []).length, after = active - out.filter(a=>a.pos !== "PICK" && !res.includes(a.id) && !taxi.includes(a.id)).length + inn.filter(a=>a.pos !== "PICK").length;
  return {after, max, over: Math.max(0, after - max)};
}
function optDropFor(L, t, out){
  const taken = new Set(out.map(a=>a.id));
  return optAssets(L, t).filter(a=>a.pos !== "PICK" && !taken.has(a.id) && !t.starters.has(a.id)).sort((a, b)=>a.now - b.now)[0] || null;
}
function optProfiles(lid){ const m = {}; if(typeof MG !== "undefined" && MG.data) for(const r of MG.data) if(r.lid === lid) m[r.rid] = r; return m; }

/* ---------- the search ---------- */
async function optimizeLeague(L, onStep){
  const lid = L.lg.league_id, cfg = optCfg(lid), open = leagueOpen(L), red = optRedraft(L);
  const res = {lid, at:Date.now(), open, offers:[], tested:0, kept:0, cfgKey:JSON.stringify(cfg) + optDirSet(lid)};
  if(!open.ok) return res;
  const {T} = optTeams(L), M = T.get(L.me); res.dir = M.dir;
  const act = teamActivity(lid), prof = optProfiles(lid);
  const coreTag = new Set(cfg.core), tradeTag = new Set(cfg.trade), want = new Set(cfg.want);
  const usable = x => x.all.filter(a=>a.now >= 1200 && !(a.pos !== "PICK" && a.inj === "IR" && !(a.ros > 0)));
  // rebuilding: your four best young players are your core and never go out
  const youngCore = M.dir === "Rebuild" ? new Set(M.all.filter(a=>a.pos !== "PICK" && a.age && a.age <= 25).sort((a, b)=>b.fwd - a.fwd).slice(0, 4).map(a=>a.k)) : new Set();
  let myA = usable(M).filter(a=>!coreTag.has(a.k) && !youngCore.has(a.k));
  if(tradeTag.size) myA = M.all.filter(a=>tradeTag.has(a.k));
  myA = myA.sort((a, b)=>b.now - a.now).slice(0, 18);
  if(!myA.length) return res;
  const perceive = (x, a) => x === M ? a.fwd
    : x.dir === "Contender" ? a.now*Math.exp(.5*(a.ctx || 0))*(1 - (1 - (a.injD || 1))*.6)
    : x.dir === "Middle" ? a.now*Math.exp(.2*(a.ctx || 0))
    : (1 + (a.hold || 0))*a.now*(1 - Math.min(.8, 2*(a.dec || 0)))*(a.tr < -.15 ? 1 + a.tr/2 : 1)*((a.age || 0) >= (a.pos === "QB" ? 32 : 29) ? .75 : 1);
  const goalU = (x, d) => { const w = OPT_WORTH[x.dir]; return (red ? 0 : d.fut) + w.ti*x.core*d.ti*(red ? 2 : 1) + w.po*x.core*d.po*(red ? 2 : 1); };
  const evalSide = (x, give, get, drop) => {
    const outIds = new Set(give.concat(drop ? [drop] : []).filter(a=>a.pos !== "PICK").map(a=>a.id));
    const ids = x.t.ids.filter(id=>!outIds.has(id)).concat(get.filter(a=>a.pos !== "PICK").map(a=>a.id));
    const lu = lineupPts(L.lg, ids, L.cache), dS = lu.pts - x.t.proj;
    const ti = oclamp(x.dTi*dS, -x.ti, 1 - x.ti), po = oclamp(x.dPo*dS, -x.po, 1 - x.po);
    const fut = get.reduce((s, a)=>s + optX(perceive(x, a)), 0) - give.reduce((s, a)=>s + optX(perceive(x, a)), 0);
    // every incoming piece has a role: starts, is a pick, or is a young asset worth half the headline piece
    const top = Math.max(...get.map(a=>a.now));
    const filler = get.filter(a=>!(a.pos === "PICK" || lu.starters.has(a.id) || ((a.age || 99) <= 25 && a.now >= top*.5) || (x.dir === "Rebuild" && a.now >= top*.7 && !a.dec))).length;
    return {dS, ti, po, fut, filler};
  };
  const gives = []; for(let i = 0; i < myA.length; i++){ gives.push([myA[i]]); for(let j = i + 1; j < myA.length; j++){ if(myA[j].now < myA[i].now*.3) continue; gives.push([myA[i], myA[j]]);
    for(let k = j + 1; k < myA.length; k++) if(myA[k].now >= myA[i].now*.3) gives.push([myA[i], myA[j], myA[k]]); } }
  const gL = gives.filter(g=>!g.every(a=>a.pos === "PICK")).map(g=>({g, L:optPm(g)})).sort((a, b)=>a.L - b.L);   // picks fill out what you send, never the whole thing
  const cand = [], others = L.teams.filter(t=>t !== L.me);
  for(let pi = 0; pi < others.length; pi++){
    const t = others[pi], P = T.get(t), pr = prof[t.rid] || null, a0 = act[t.rid] || {trades:0, moves:0, last:0};
    if(onStep) await onStep(t, pi, others.length);
    let thA = usable(P).sort((a, b)=>b.now - a.now).slice(0, 18);
    const forced = P.all.filter(a=>want.has(a.k)); if(want.size && !forced.length) continue;
    const gets = []; for(let i = 0; i < thA.length; i++){ gets.push([thA[i]]); for(let j = i + 1; j < thA.length; j++) if(thA[j].now >= thA[i].now*.3) gets.push([thA[i], thA[j]]); }
    for(const f of forced) if(!thA.includes(f)) gets.push([f]);
    const n = pr && pr.n != null ? pr.n : a0.trades, last = Math.max(a0.last || 0, pr && pr.last || 0);
    const actZ = (n >= 40 ? .35 : n >= 12 ? .15 : n === 0 ? -.4 : 0) + (last && Date.now() - last > 60*864e5 ? -.5 : 0) + (a0.moves || n ? 0 : -.6) + (pr && pr.pm != null ? oclamp(2*pr.pm, -.3, .3) : 0);
    for(const get of gets){
      if(forced.length && !forced.every(f=>get.includes(f))) continue;
      const Lget = optPm(get);
      // offers lean your way: the partner receives 88%-105% of market, never a lopsided amount
      let lo = 0, hi = gL.length; while(lo < hi){ const mid = (lo + hi) >> 1; if(gL[mid].L < Lget*.88) lo = mid + 1; else hi = mid; }
      for(let q = lo; q < gL.length && gL[q].L <= Lget*1.05; q++){
        const give = gL[q].g; if(give.length + get.length > 4) continue;   // 3-for-2s of depth never get accepted
        res.tested++;
        const r = gL[q].L/Lget;
        const roomMe = rosterRoom(L, L.me, give, get); if(roomMe.over > 1) continue;
        const drop = roomMe.over ? optDropFor(L, L.me, give) : null; if(roomMe.over && !drop) continue;
        if(rosterRoom(L, t, get, give).over > 1) continue;
        const mine = evalSide(M, give, get, drop), theirs = evalSide(P, get, give, null);
        const uMe = goalU(M, mine)/M.core, uTh = goalU(P, theirs)/P.core;
        if(uMe < .012) continue;                                  // must move your goal by a real amount
        if(uTh < -.004 || (uTh < .002 && r < .97)) continue;      // below fair on price, the partner must still gain by fit
        if(mine.filler || theirs.filler) continue;                // no throw-ins either way
        if(!red && P.dir === "Rebuild" && theirs.fut <= 0) continue;   // a rebuilder only says yes if his long-term value goes up
        let z = -.35 + 7*Math.log(r) + 14*uTh + actZ - .2*(give.length + get.length - 2);
        if(pr && pr.buys && give.some(a=>(a.pos === "PICK" ? "Picks" : a.pos) === pr.buys)) z += .3;
        const acc = 1/(1 + Math.exp(-z)); if(acc < .15) continue;
        cand.push({t, P, M, give, get, drop, r, mine, theirs, uMe, uTh, acc, prof:pr, act:a0, score:uMe*(.35 + acc)});
      }
    }
  }
  res.kept = cand.length;
  // ---- classify and shade the score
  const head = side => side.reduce((m, a)=>a.now > m.now ? a : m, side[0]);
  const share = (side, f) => side.filter(f).reduce((s, a)=>s + optX(a.now), 0)/side.reduce((s, a)=>s + optX(a.now), 0);
  const ageOf = side => { const w = side.map(a=>[a.pos === "PICK" ? 21.5 : (a.age || 26), optX(a.now)]), W = w.reduce((s, x)=>s + x[1], 0); return w.reduce((s, x)=>s + x[0]*x[1], 0)/W; };
  const fading = a => a.flags.includes("fading");
  for(const c of cand){
    const k = [];
    if(head(c.give).flags.includes("sellHigh")) k.push("Sell high");
    if(head(c.get).flags.includes("buyLow") && !c.give.some(a=>a.flags.includes("buyLow"))) k.push("Buy low");
    if(M.dir !== "Rebuild" && c.get.some(fading) && c.mine.ti > .01) k.push("Rent a vet");
    if(c.give.some(fading) && c.P.dir !== "Rebuild" && c.mine.fut > 0) k.push("Sell the vet");
    if(share(c.give, a=>a.pos === "PICK") >= .5 || share(c.get, a=>a.pos === "PICK") >= .5) k.push("Pick play");
    if(c.give.length >= 2 && c.get.length === 1) k.push("Consolidate");
    if(c.give.length === 1 && c.get.length >= 2) k.push("Split");
    if(c.give.length === 1 && c.get.length === 1 && c.give[0].pos !== c.get[0].pos && c.give[0].pos !== "PICK" && c.get[0].pos !== "PICK") k.push("Position swap");
    c.kinds = k; c.kind = k[0] || "Retool";
    if(M.dir === "Rebuild" && c.get.some(fading)) c.score *= .2;                       // don't buy fading assets unless you contend
    if(c.get.some(a=>a.pos !== "PICK" && a.ros < 6 && (a.age || 0) > 26)) c.score *= .3;  // no dead roster spots
    if(c.get.some(a=>a.flags.includes("sellHigh"))) c.score *= .6;                     // don't buy at the top
    const gap = ageOf(c.get) - ageOf(c.give);                                           // don't pay with youth for age unless it buys a title shot
    if(!red && gap >= 2.5){ const stud = c.give.some(a=>a.pos !== "PICK" && a.age && a.age <= 24 && a.fwd >= 4000); c.score *= M.dir === "Contender" ? (stud ? .45 : .8) : (stud ? .15 : .4); }
  }
  cand.sort((a, b)=>b.score - a.score);
  // ---- board: variety by kind, partner, players, size
  const board = [], usedTheirs = new Set(), myUse = {}, kindN = {}, ptN = {}, sizeN = {};
  const pass = (c, strict) => {
    if(c.get.some(a=>usedTheirs.has(a.k)) || c.give.some(a=>(myUse[a.k] || 0) >= 2)) return false;
    if((ptN[c.t.rid] || 0) >= (strict ? 1 : 2) || (kindN[c.kind] || 0) >= (strict ? 1 : 3)) return false;
    const sz = c.give.length + "x" + c.get.length; if((sizeN[sz] || 0) >= (strict ? 2 : 4)) return false;
    return true; };
  for(const strict of [true, false]) for(const c of cand){ if(board.length >= 12) break; if(board.includes(c) || !pass(c, strict)) continue;
    board.push(c); c.get.forEach(a=>usedTheirs.add(a.k)); c.give.forEach(a=>myUse[a.k] = (myUse[a.k] || 0) + 1);
    kindN[c.kind] = (kindN[c.kind] || 0) + 1; ptN[c.t.rid] = (ptN[c.t.rid] || 0) + 1; const sz = c.give.length + "x" + c.get.length; sizeN[sz] = (sizeN[sz] || 0) + 1; }
  // finalists get the full season sim with both rosters changed
  for(const o of board){ try{ o.ev = evalTrade(L, L.me, o.t, o.drop ? o.give.concat([o.drop]) : o.give, o.get); }catch(e){ o.ev = null; } }
  res.offers = board;
  return res;
}

/* ---------- running it: one league, or every league in one pass ---------- */
function optAllLeagues(){ return S.dir && S.dir.leagues ? Object.values(S.dir.leagues).filter(L=>L.me) : []; }
function optLeagues(){ const red = optMode() === "red"; return optAllLeagues().filter(L=>optRedraft(L) === red); }
async function optRun(lids){
  if(OPT.busy) return;
  OPT.busy = {i:0, n:lids.length, phase:"Reading the market: FFU Index, recent trades, this season's production"}; render();
  await Promise.all([loadIndex(), loadNfl(), optLoadProd(), optLoadPulse(), (typeof MG !== "undefined" && !MG.data && !MG.busy && typeof buildManagers === "function") ? buildManagers().catch(()=>{}) : null]);
  OPT.mkt = null;
  for(let i = 0; i < lids.length; i++){
    const L = S.dir.leagues[lids[i]]; if(!L) continue;
    delete L._ot; delete L._oo; for(const t of L.teams) delete t._oa3;
    OPT.busy = {i, n:lids.length, phase:`${L.lg.name}: pricing every roster and simulating the season`}; renderOptStatus();
    await sleep(0);
    try{ OPT.res[L.lg.league_id] = await optimizeLeague(L, async (t, k, n)=>{ OPT.busy.phase = `${L.lg.name}: testing trades with ${t.bp.name} (${k + 1} of ${n})`; renderOptStatus(); await sleep(0); }); }
    catch(e){ OPT.res[L.lg.league_id] = {lid:L.lg.league_id, error:e.message || String(e), offers:[]}; }
  }
  OPT.busy = null; render();
}
function renderOptStatus(){ const el = document.getElementById("optStatus"); if(el && OPT.busy){ el.hidden = false; el.innerHTML = optStatusHTML(); } }
function optStatusHTML(){ const b = OPT.busy; return `<span class="livedot" style="background:var(--violet)"></span><span>${esc(b.phase)}${b.n > 1 ? ` · league ${b.i + 1} of ${b.n}` : ""}</span>`; }
// the strongest offer from each league, with play types spread out
function optBestAcross(){
  const Ls = optLeagues(), per = [];
  for(const L of Ls){ const r = OPT.res[L.lg.league_id]; if(r && r.offers && r.offers.length) per.push({L, offers:r.offers}); }
  const out = [], kindN = {};
  for(const round of [0, 1, 2]){
    for(const x of per.sort((a, b)=>b.offers[0].score - a.offers[0].score)){
      if(out.some(o=>o.L === x.L) || out.length >= 16) continue;
      const pick = x.offers.find(o=>(kindN[o.kind] || 0) <= round);
      if(pick){ out.push({L:x.L, o:pick}); kindN[pick.kind] = (kindN[pick.kind] || 0) + 1; }
    }
  }
  return out.sort((a, b)=>b.o.score - a.o.score);
}

/* ---------- the market panel: trending buys and sells, trades made today ---------- */
function optMarket(){
  if(OPT.mkt) return OPT.mkt;
  const Ls = optAllLeagues().filter(L=>!optRedraft(L)); if(!Ls.length || !OPT.idx) return null;
  const L = Ls.find(x=>optShape(x) === "sf") || Ls[0], vol = (OPT.pulse && OPT.pulse.vol && OPT.pulse.vol[optShape(L)]) || {};
  const owned = {}, others = {};
  for(const X of optAllLeagues()) for(const t of X.teams) for(const id of t.ids) (t === X.me ? owned : others)[id] = ((t === X.me ? owned : others)[id] || 0) + 1;
  const pool = [];
  for(const id in L.fc.players){ const f = L.fc.players[id]; if(!["QB","RB","WR","TE"].includes(f.pos) || f.v < 2500 || f.src === "dp") continue;
    pool.push(optPrice(L, {k:id, id, name:f.name, pos:f.pos, v:f.v, age:f.age, trend:f.trend, team:f.team})); }
  const card = (a, why) => ({a, why, vol:vol[a.id] || 0, mine:owned[a.id] || 0, theirs:others[a.id] || 0});
  const injBuy = a => a.injD < 1 && a.hold > 0 && a.fwd > a.now*1.08, riser = a => a.tr >= .08 && !a.dec && (a.prod > 0 || a.ctx > 0);
  const buys = pool.filter(a=>(a.flags.includes("buyLow") || riser(a) || injBuy(a)) && !a.flags.includes("fading") && !a.flags.includes("sellHigh"))
    .map(a=>card(a, a.flags.includes("buyLow") ? (a.inj && a.injD < 1 ? `${a.inj === "IR" ? "On IR" : a.inj}, price down ${Math.round(-Math.min(0, a.tr)*100)}% in 30 days; ${a.ppg} a game when playing`
        : a.tr < 0 ? `Price down ${Math.round(-a.tr*100)}% in 30 days while he averages ${a.ppg} and projects ${a.ros} a week` : `Real trades price him below consensus`)
      : injBuy(a) ? `${a.inj === "IR" ? "On IR" : a.inj}: an injury discount on a young player who holds his value (${onum(a.now)} now, ${onum(a.fwd)} later)`
      : `Price up ${Math.round(a.tr*100)}% in 30 days with ${a.l3} a game over his last three`))
    .sort((x, y)=>(y.vol + 20*Math.abs(y.a.tr) + 30*(y.a.fwd/y.a.now - 1)) - (x.vol + 20*Math.abs(x.a.tr) + 30*(x.a.fwd/x.a.now - 1))).slice(0, 12);
  const sells = pool.filter(a=>a.flags.includes("sellHigh") || (a.flags.includes("fading") && a.now >= 3000))
    .map(a=>card(a, a.flags.includes("sellHigh") ? `${a.l3} a game over his last three against ${a.ppg} for the season; projects ${a.ros} from here`
      : `${a.age ? Math.floor(a.age) + " years old" : "Aging"}${a.tr < -.04 ? `, price down ${Math.round(-a.tr*100)}% in 30 days` : ""}; worth ${onum(a.now)} now, about ${onum(a.fwd)} after the season`))
    .sort((x, y)=>((y.a.now - y.a.fwd)/y.a.now + y.vol/20) - ((x.a.now - x.a.fwd)/x.a.now + x.vol/20)).slice(0, 12);
  // trades made today, priced at FFU prices in a league of the same shape
  const ctxFor = sh => Ls.find(x=>optShape(x) === sh) || null, val = (sh, x) => {
    const C = ctxFor(sh), ix = (OPT.idx[sh] || {});
    if(x.startsWith("K")){ const e = ix[x.slice(1)]; return e ? e[0] : 800; }
    if(C){ const f = C.fc.players[x]; if(f) return optPrice(C, {k:x, id:x, name:f.name, pos:f.pos, v:f.v, age:f.age, trend:f.trend}).now; }
    const e = ix[x]; return e ? e[0] : 0; };
  const nm = x => x.startsWith("K") ? (()=>{ const [y, r] = x.slice(1).split("-"); return `${y} ${["","1st","2nd","3rd","4th","5th"][+r] || r + "th"}`; })() : pname(x);
  const today = ((OPT.pulse && OPT.pulse.today) || []).map(t=>{ const side = list => list.map(x=>({n:nm(x), v:val(t.sh, x)}));
    const A = side(t.A), B = side(t.B), va = Math.pow(A.reduce((s, x)=>s + optX(x.v), 0), 1/OPT_P), vb = Math.pow(B.reduce((s, x)=>s + optX(x.v), 0), 1/OPT_P);
    return {...t, A, B, va, vb}; });
  return OPT.mkt = {buys, sells, today, n:(OPT.pulse && OPT.pulse.n24) || today.length, built:OPT.pulse && OPT.pulse.built};
}
function optSideHTML(where){
  const M = optMarket();
  if(!M) return `<aside class="glass optside ${where}" aria-label="Market"><b class="h2">Market</b><div class="sub">Trending players and today's trades load once the optimizer has read the market. Run it on a league to fill this in.</div></aside>`;
  const tab = OPT.side, wide = where === "wide";
  const list = tab === "today" ? M.today : M[tab], short = !OPT.sideMore && !wide && list.length > 3, xs = short ? list.slice(0, 3) : list;
  const head = {buys:"Prices that should rise, or are on sale", sells:"Prices at or near their peak", today:`${M.n} real trades in the last 24 hours, valued at FFU prices`}[tab];
  const mover = (x, buy) => { const a = x.a, tw = Math.abs(a.tr) >= .04 ? `${a.tr > 0 ? "▲" : "▼"} ${Math.round(Math.abs(a.tr)*100)}% 30d` : "";
    const own = buy ? (x.theirs ? `On ${x.theirs} rosters in your leagues` : "") : (x.mine ? `You own him in ${x.mine} league${x.mine > 1 ? "s" : ""}` : "");
    return `<li><div class="r1"><b>${esc(a.name)}</b><i>${onum(a.now)}</i></div><small>${esc([`${a.pos}${a.team ? " · " + a.team : ""}${a.age ? " · " + Math.floor(a.age) : ""}`, tw, x.vol ? `${x.vol} trades this week` : ""].filter(Boolean).join(" · "))}</small><p>${esc(x.why)}.</p>${own ? `<span class="own">${esc(own)}</span>` : ""}</li>`; };
  const trade = t => { const hi = Math.max(t.va, t.vb), lo = Math.max(1, Math.min(t.va, t.vb)), edge = (hi/lo - 1)*100, win = edge >= 6 ? (t.va > t.vb ? "A" : "B") : "";
    const side = (xs, v, w) => `<div class="${w ? "win" : ""}"><b>Gets ${onum(v)}</b>${esc(xs.map(x=>x.n).join(", "))}</div>`;
    return `<li><div class="tmeta"><span>${t.sh === "sf" ? "Superflex" : "1QB"}${t.teams ? ` · ${t.teams} teams` : ""}${t.tep ? " · TEP" : ""}</span><span>${ago(t.ts) === "today" ? `${Math.max(1, Math.round((Date.now() - t.ts)/36e5))}h ago` : ago(t.ts)}</span></div>
      <div class="tt">${side(t.A, t.va, win === "A")}${side(t.B, t.vb, win === "B")}</div><small>${win ? `${win === "A" ? "Left" : "Right"} side got ${edge.toFixed(0)}% more value` : "Fair by FFU value"}</small></li>`; };
  const body = tab === "today" ? (OPT.pulse ? xs.map(trade).join("") : "") : xs.map(x=>mover(x, tab === "buys")).join("");
  const empty = tab === "today" && !OPT.pulse ? "Today's trades couldn't load. Try again in a minute." : "Nothing here right now.";
  const top = `<div class="opthd"><b class="h2">Market</b>${M.built ? `<small class="sub">FFU database · updated ${esc(ago(M.built))}</small>` : ""}</div>`;
  if(!wide && !OPT.sideOpen) return `<aside class="glass optside ${where}" aria-label="Market"><button class="optsidebar" data-optsideopen="1"><b>Market</b><span>${M.buys.length} buys · ${M.sells.length} sells · ${M.n} trades today</span><i aria-hidden="true">›</i></button></aside>`;
  return `<aside class="glass optside ${where}" aria-label="Market">${top}
    <div class="seg sm" style="--n:3;--i:${["buys","sells","today"].indexOf(tab)}" role="tablist" aria-label="Market"><i></i>${[["buys","Buys"],["sells","Sells"],["today","Today"]].map(([k, l])=>`<button role="tab" data-optside="${k}" aria-selected="${tab === k}">${l}</button>`).join("")}</div>
    <div class="sub">${esc(head)}</div><ul class="optpl">${body || `<li><p>${esc(empty)}</p></li>`}</ul>${short ? `<button class="ghost optmore" data-optmore="1">Show all ${list.length}</button>` : ""}</aside>`;
}

/* ---------- words: every sentence comes from the offer's own numbers ---------- */
const optName = a => (a.name || "").replace(" (via trade)", "");
const optList = l => l.map(optName).join(" + ");
function scheduleLine(L, a){
  const nfl = OPT.nfl, team = (S.proj[a.id] && S.proj[a.id].player || {}).team; if(!nfl || !team || !nfl.sched[team]) return null;
  const ps = (L.lg.settings || {}).playoff_week_start || 15, wks = [ps, ps + 1, ps + 2].filter(w=>w <= 18);
  const opps = wks.map(w=>nfl.sched[team][w] || null), def = typeof CTX !== "undefined" && CTX.def && CTX.def.rank;
  const ranks = def ? opps.map(o=>o && def[o] && def[o][a.pos]).filter(Boolean) : [];
  const avg = ranks.length ? ranks.reduce((s, r)=>s + r, 0)/ranks.length : null;
  const tag = avg == null ? "" : avg <= 11 ? " (soft matchups)" : avg >= 22 ? " (tough matchups)" : "";
  return `playoff weeks ${wks[0]}–${wks[wks.length - 1]} vs ${opps.map(o=>o || "bye").join(", ")}${tag}`;
}
function optWhyYou(L, o){
  const out = [], ev = o.ev, red = optRedraft(L), contend = o.M.dir !== "Rebuild";
  if(ev && contend) out.push(`Your lineup ${sgn(ev.dMe)} pts a week: title odds ${pct(ev.me.t0)} → ${pct(ev.me.t1)}, playoff odds ${pct(ev.me.po0)} → ${pct(ev.me.po1)}.`);
  if(!red){ const fg = optPmF(o.give), ft = optPmF(o.get); out.push(`Later value ${ft >= fg ? "rises" : "falls"} ${Math.abs((ft/fg - 1)*100).toFixed(0)}%: you give ${onum(fg)} of after-season value and get ${onum(ft)}.`); }
  for(const a of o.give){
    if(a.flags.includes("fading")) out.push(`${optName(a)} is ${a.age ? Math.floor(a.age) : "aging"}${a.tr < -.04 ? ` and his price is down ${Math.round(-a.tr*100)}% in 30 days` : ""}. You sell at ${onum(a.now)}; he projects to ${onum(a.fwd)} by the offseason.`);
    else if(a.flags.includes("sellHigh")) out.push(`${optName(a)} scored ${a.lg1} last game and ${a.l3} a game over his last three, against ${a.ppg} for the season and ${a.ros} projected from here.`);
    else if(a.prod >= .04) out.push(`${optName(a)} is scoring ${a.l3} a game over his last three (${a.ppg} for the season), which lifts his price to ${onum(a.now)}.`);
  }
  for(const a of o.get){
    if(a.flags.includes("buyLow")) out.push(`${optName(a)}'s price is ${a.tr < 0 ? `down ${Math.round(-a.tr*100)}% in 30 days` : "below what consensus pays"} while he averages ${a.ppg} and projects ${a.ros} a week.`);
    if(a.inj && OPT_HURT.has(a.inj) && a.fwd > a.now*1.08) out.push(`${optName(a)} is ${a.inj === "IR" ? "on IR" : a.inj.toLowerCase()}, so his price is docked to ${onum(a.now)} now; he's worth about ${onum(a.fwd)} once he's back.`);
    if(a.ctx >= .05 && contend) out.push(`${optName(a)} projects better the rest of this season than his dynasty price says.`);
    if(a.flags.includes("fading") && contend) out.push(`${optName(a)} is a rental: today's ${onum(a.now)} becomes about ${onum(a.fwd)} after the season, so this is for the title run.`);
    if(a.pos !== "PICK" && contend && ev && ev.dMe > .5){ const s = scheduleLine(L, a); if(s) out.push(`${optName(a)}: ${s}.`); }
  }
  if(o.drop) out.push(`Your roster is full, so ${optName(o.drop)} (lowest-value bench player) is dropped.`);
  return out.slice(0, 5);
}
function optWhyThem(L, o){
  const t = o.t, b = t.bp, P = o.P, out = [], ev = o.ev;
  out.push(`${b.name} is ${b.rec} and ${OPT_DIRTXT[P.dir].toLowerCase()}: ${pct(P.po)} playoff odds, ${pct(P.ti)} title odds.`);
  if(P.dir !== "Rebuild" && ev && ev.dTh > .5) out.push(`Their lineup ${sgn(ev.dTh)} pts a week: playoff odds ${pct(ev.th.po0)} → ${pct(ev.th.po1)}.`);
  if(P.dir === "Rebuild"){ const young = o.give.filter(a=>a.pos === "PICK" || (a.age && a.age <= 25)), old = o.get.filter(a=>a.age && a.age >= 27);
    out.push(`They get younger${young.length ? ` with ${optList(young)}` : ""}${old.length ? ` for ${optList(old)}, who won't matter to a rebuild by 2028` : ""}.`); }
  out.push(`At today's prices they get ${onum(optPm(o.give))} for ${onum(optPm(o.get))} (${Math.round(o.r*100)}%)${o.r >= .99 ? ", fair or better for them" : o.r >= .94 ? ", close enough to fair that fit carries it" : ", a lean your way that fit has to make up"}.`);
  const p = o.prof;
  if(p && p.buys && o.give.some(a=>(a.pos === "PICK" ? "Picks" : a.pos) === p.buys)) out.push(`Matches what they buy: ${p.buys}${p.buyShare ? ` (${p.buyShare}% of what they've traded for)` : ""}.`);
  if(p && p.pm != null && Math.abs(p.pm) >= .05) out.push(p.pm > 0 ? `Pays about ${Math.round(p.pm*100)}% over value in their trades.` : `Usually wins their trades by about ${Math.round(-p.pm*100)}%.`);
  const n = p && p.n != null ? p.n : (o.act ? o.act.trades : 0);
  out.push(n ? `${n} trade${n === 1 ? "" : "s"} this season${p && p.src === "db" && p.lgs > 1 ? ` across ${p.lgs} leagues` : ""}${p && p.last ? `, last ${ago(p.last)}` : o.act && o.act.last ? `, last ${ago(o.act.last)}` : ""}.` : "No trades this season: a long shot.");
  return out.slice(0, 5);
}
function optPitch(L, o){
  const b = o.t.bp, buyer = o.P.dir !== "Rebuild";
  const s = [`Hey ${b.name}, ${buyer ? `you're ${b.rec} and in the race.` : "looks like you're building toward next year."}`, `Would you do ${optList(o.give)} for ${optList(o.get)}?`];
  if(o.ev && buyer && o.ev.th.po1 - o.ev.th.po0 >= .02) s.push(`By my numbers it adds about ${o.ev.dTh.toFixed(1)} points a week and takes your playoff odds from ${pct(o.ev.th.po0)} to ${pct(o.ev.th.po1)}.`);
  const yg = o.give.filter(a=>a.pos === "PICK" || (a.age && a.age <= 25)); if(!buyer && yg.length) s.push(`${optList(yg)} fit${yg.length === 1 ? "s" : ""} where your roster is headed.`);
  s.push("Open to a counter.");
  return s.join(" ");
}

/* ---------- offer tracking: Sent / Accepted / Declined, kept on the Offers page ---------- */
const optOfferKey = (L, o) => L.lg.league_id + "|" + o.give.map(optName).join("+") + ">" + o.get.map(optName).join("+");
function optTrackHTML(L, o, offer){
  const x = OFFERS.all().find(z=>z.key === optOfferKey(L, o)), st = x && x.status;
  if(!st) return `<button class="ghost" data-optsent="${offer}">Mark sent</button>`;
  const lab = {sent:"Sent", accepted:"Accepted", declined:"Declined", countered:"Countered"}[st] || st;
  return `<span class="opttrack ${esc(st)}"><b>${esc(lab)}</b>${st === "sent" ? ` ${esc(ago(x.ts))}` : ""}</span>${["accepted","declined","countered"].map(s=>`<button class="ghost sm${st === s ? " on" : ""}" data-ofs="${esc(x.key)}|${s}" aria-pressed="${st === s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join("")}`;
}

/* ---------- screen ---------- */
function optAssetRow(a){
  if(a.pos === "PICK") return `<div class="oasset"><span class="t">${esc(optName(a))}<small>Pick${a.idx ? ` · FFU Index ${onum(a.idx)}` : ""}${a.name.includes("via trade") ? " · via trade" : ""}</small></span><i>${onum(a.now)}<small>later ${onum(a.fwd)}</small></i></div>`;
  const bits = [`${a.pos}${a.team ? " · " + a.team : ""}${a.age ? " · " + Math.floor(a.age) : ""}`];
  if(a.gp) bits.push(`${a.ppg} ppg`); if(a.ros) bits.push(`proj ${a.ros}/wk`); if(a.inj) bits.push(a.inj);
  const chips = [];
  if(Math.abs(a.tr) >= .05) chips.push(`<span class="ochip ${a.tr > 0 ? "hot" : "cold"}" title="30-day change in market price">${a.tr > 0 ? "▲" : "▼"} ${Math.round(Math.abs(a.tr)*100)}% 30d</span>`);
  if(a.prod >= .04) chips.push(`<span class="ochip up" title="Recent production lifts his price">Hot</span>`); else if(a.prod <= -.04) chips.push(`<span class="ochip cold" title="Recent production lowers his price">Cold</span>`);
  if(a.n >= 5) chips.push(`<span class="ochip" title="Real trades behind his FFU Index price">${a.n} trades</span>`);
  const later = a.fwd != null && a.fwd !== a.now ? `<small>later ${onum(a.fwd)}</small>` : "";
  return `<div class="oasset"><span class="t">${esc(optName(a))}<small>${esc(bits.join(" · "))}</small></span><i>${onum(a.now)}${later}</i><span class="sig">${chips.join("")}</span></div>`;
}
function optOfferHTML(L, o, i, showLeague){
  const b = o.t.bp, red = optRedraft(L), ev = o.ev, accC = o.acc >= .55 ? "hi" : o.acc >= .35 ? "md" : "lo";
  const sv = optPm(o.give), gv = optPm(o.get), tot = sv + gv || 1;
  const chips = [];
  if(o.r < .98) chips.push(`<span class="ochip ed">Leans your way ${Math.round((1 - o.r)*100)}%</span>`);
  for(const a of o.give){ if(a.flags.includes("fading")) chips.push(`<span class="ochip dn">Selling ${esc(optName(a).split(" ").pop())} before it drops</span>`); if(a.flags.includes("sellHigh")) chips.push(`<span class="ochip hot">Sell high: ${esc(optName(a).split(" ").pop())}</span>`); }
  for(const a of o.get){ if(a.flags.includes("buyLow")) chips.push(`<span class="ochip up">Buy low: ${esc(optName(a).split(" ").pop())}</span>`); if(a.flags.includes("fading")) chips.push(`<span class="ochip dn">${esc(optName(a).split(" ").pop())} is a rental</span>`); }
  const meStat = ev && o.M.dir !== "Rebuild" ? `<b>Title ${pct(ev.me.t0)} → ${pct(ev.me.t1)}</b><small>Lineup ${sgn(ev.dMe)}/wk · playoffs ${pct(ev.me.po0)} → ${pct(ev.me.po1)}</small>`
    : `<b>Later value ${sgn((optPmF(o.get)/optPmF(o.give) - 1)*100, 0)}%</b><small>${ev ? `Lineup ${sgn(ev.dMe)}/wk this season` : ""}</small>`;
  const thStat = o.P.dir === "Rebuild" ? `<b>Younger: ${o.give.filter(a=>a.pos === "PICK" || (a.age && a.age <= 25)).length} of ${o.give.length} pieces</b><small>Market ${Math.round(o.r*100)}% of what they give</small>`
    : `<b>Playoffs ${ev ? `${pct(ev.th.po0)} → ${pct(ev.th.po1)}` : pct(o.P.po)}</b><small>${ev ? `Lineup ${sgn(ev.dTh)}/wk · ` : ""}market ${Math.round(o.r*100)}%</small>`;
  const pitch = optPitch(L, o), uid = a => a.pos === "PICK" ? "PK:" + a.k.slice(2) : a.id;
  const build = esc(JSON.stringify({lid:L.lg.league_id, rid:o.t.rid, give:o.give.map(a=>({uid:uid(a), id:a.id})), get:o.get.map(a=>({uid:uid(a), id:a.id}))}));
  const offer = esc(JSON.stringify({lid:L.lg.league_id, league:L.lg.name, partner:b.name, give:o.give.map(optName), get:o.get.map(optName), mode:o.M.dir === "Rebuild" ? "sell" : "buy"}));
  const idle = optIdle(o);
  return `<article class="glass optp rise" style="animation-delay:${Math.min(i, 6)*.05}s">
    <div class="opthd"><div class="optk"><span class="kind">${esc(o.kind)}</span><span class="sub">${esc(OPT_KINDS[o.kind] || "")}</span></div><span class="acc ${accC}" title="Chance they accept">${pct(o.acc)} accept</span></div>
    <div class="optwho"><b>To ${esc(b.name)}</b>${idle ? `<span class="oidle" title="Inactive: ${esc(idle)}" aria-label="Inactive: ${esc(idle)}">zZ</span>` : ""}<span class="dirchip ${o.P.dir}">${esc(OPT_DIRTXT[o.P.dir])}</span>
      <small>${showLeague ? `<button class="linkbtn" data-optlg="${L.lg.league_id}">${esc(L.lg.name)}</button> · ` : ""}${esc(b.rec)} · ${o.give.length} for ${o.get.length}</small></div>
    <div class="otrade"><div class="oside"><span class="lab">You send <i>${onum(sv)}</i></span>${o.give.map(optAssetRow).join("")}${o.drop ? `<div class="sub">+ drop ${esc(optName(o.drop))}</div>` : ""}</div>
      <div class="oside"><span class="lab">You get <i>${onum(gv)}</i></span>${o.get.map(optAssetRow).join("")}</div></div>
    <div class="tbar"><div class="tb"><i style="width:${sv/tot*100}%"></i><b style="width:${gv/tot*100}%"></b></div></div>
    ${chips.length ? `<div class="optchips">${chips.join("")}</div>` : ""}
    <div class="optimp"><div><span class="lab">For you</span>${meStat}</div><div><span class="lab">For them</span>${thStat}</div></div>
    <details class="optdet"><summary>Why this works</summary><div class="owhy"><div><span class="lab">For you</span><ul>${optWhyYou(L, o).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>
      <div><span class="lab">For ${esc(b.name)}</span><ul>${optWhyThem(L, o).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div></div></details>
    <div class="optact"><button class="ghost tint" data-edbuild="${build}">Open in trade builder</button><button class="ghost" data-copy="${esc(pitch)}" data-offer="${offer}">Copy message</button><span class="opttr">${optTrackHTML(L, o, offer)}</span></div>
  </article>`;
}
function optSituationHTML(L, r){
  const me = L.me, b = me.bp, {T} = optTeams(L), M = T.get(me), set = optDirSet(L.lg.league_id), red = optRedraft(L);
  const weak = ["QB","RB","WR","TE"].slice().sort((x, y)=>b.posRank[y] - b.posRank[x]), open = leagueOpen(L);
  return `<section class="glass optcard"><div class="opthd"><div><b class="h2">${esc(L.lg.name)}</b><div class="sub">${esc(b.name)} · ${esc(b.rec)}${red ? " · redraft" : ""}${open.deadline ? ` · trade deadline week ${open.deadline}` : ""}</div></div>
      ${red ? "" : chipSelect("Optimize for", "optdir", [["", `Auto: ${OPT_DIRTXT[M.dir]}`], ["contend","Contend"], ["rebuild","Rebuild"]], set || "")}</div>
    <div class="optstats"><div><small>Playoff odds</small><b>${pct(M.po)}</b></div><div><small>Title odds</small><b>${pct(M.ti)}</b></div><div><small>Direction</small><b>${esc(OPT_DIRTXT[M.dir])}</b></div><div><small>Weakest spot</small><b>${weak[0]} · ${ord(b.posRank[weak[0]])}</b></div></div>
    <div class="sub">${M.dir === "Contender" ? "Offers are judged on your title odds first; they may spend later value." : M.dir === "Rebuild" ? "Offers are judged on later value; your four best young players are never offered." : "Offers balance this season's odds and later value."}</div></section>`;
}
function optTagsHTML(L, cfg){
  const me = L.me, lid = L.lg.league_id, mine = optAssets(L, me).filter(a=>a.now >= 300).slice().sort((a, b)=>b.now - a.now);
  const st = a => cfg.core.includes(a.k) ? "core" : cfg.trade.includes(a.k) ? "trade" : "";
  const nT = cfg.trade.length, nC = cfg.core.length, open = OPT.tagLg === lid;
  const row = a => `<div class="optrow"><span class="t"><b>${esc(optName(a))}</b><small>${a.pos === "PICK" ? "Pick" : `${a.pos}${a.age ? " · " + Math.floor(a.age) : ""}${me.starters.has(a.id) ? " · starter" : ""}`} · ${onum(a.now)}</small></span>
    <span class="seg3" role="group" aria-label="${esc(optName(a))}">${[["trade","Trade"],["","—"],["core","Core"]].map(([k, l])=>`<button data-opttag="${esc(a.k)}|${k}" aria-pressed="${st(a) === k}" class="${k}">${l}</button>`).join("")}</span></div>`;
  const others = L.teams.filter(t=>t !== me).flatMap(t=>optAssets(L, t).filter(a=>a.now >= 800).map(a=>({a, t}))).sort((x, y)=>y.a.now - x.a.now);
  const q = OPT.q.trim().toLowerCase(), hits = q.length >= 2 ? others.filter(x=>optName(x.a).toLowerCase().includes(q) && !cfg.want.includes(x.a.k)).slice(0, 6) : [];
  const wantChips = cfg.want.map(k=>{ const x = others.find(o=>o.a.k === k); return x ? `<span class="ochip want">${esc(optName(x.a))} <small>${esc(x.t.bp.name)}</small><button data-optwantx="${esc(k)}" aria-label="Remove ${esc(optName(x.a))}">✕</button></span>` : ""; }).join("");
  return `<section class="glass optcard"><div class="opthd"><div><b class="h2">Your choices</b><div class="sub">${nT || nC || cfg.want.length ? `${nT} to trade · ${nC} core${cfg.want.length ? ` · ${cfg.want.length} target${cfg.want.length > 1 ? "s" : ""}` : ""}` : "Untagged: anything can be offered except your core young players when rebuilding."}</div></div>
      <button class="ghost" data-opttags="${lid}">${open ? "Done" : "Tag players"}</button></div>
    ${open ? `<div class="optrows">${mine.map(row).join("")}</div><div class="sub">Trade = the only pieces it offers. Core = never offered.</div>` : ""}
    <div class="optwant"><label class="lab" for="optq">Players you want</label><div class="picks">${wantChips}<input class="search" id="optq" type="search" placeholder="Search other rosters" value="${esc(OPT.q)}" autocomplete="off"></div>
      ${hits.length ? `<div class="optrows">${hits.map(x=>`<button class="optrow pick" data-optwant="${esc(x.a.k)}"><span class="t"><b>${esc(optName(x.a))}</b><small>${x.a.pos === "PICK" ? "Pick" : x.a.pos} · ${esc(x.t.bp.name)} · ${onum(x.a.now)}</small></span><span class="sub">Add</span></button>`).join("")}</div>` : ""}</div></section>`;
}
function viewOptimizer(){
  let h = `<section class="pagehead">${backBtn("trades","Trades")}<h1 class="h1">Trade optimizer</h1><div class="sub">Offers priced on the FFU trade database and the market right now, matched to every league-mate's direction. They lean a little your way, because trading is a numbers game.</div></section>`;
  if(!S.dir){ if(!S.dirLoading && !S.dirError) setTimeout(loadDirection, 0);
    return h + (S.dirError ? `<div class="err">${esc(S.dirError)}</div>` : `<div class="statusline"><span class="livedot" style="background:var(--violet)"></span>${esc(S.dirPhase || "Simulating every season")} · ${Math.round((S.dirProgress || 0)*100)}%</div><div class="skel" aria-hidden="true"><i style="height:120px"></i><i style="height:220px"></i></div>`); }
  const all = optAllLeagues(), nRed = all.filter(optRedraft).length, nDyn = all.length - nRed;
  if(optMode() === "red" && !nRed) store.set("optMode", "dyn");
  const Ls = optLeagues().sort((a, b)=>a.lg.name.localeCompare(b.lg.name)), openLs = Ls.filter(x=>leagueOpen(x).ok);
  if(!Ls.length) return h + `<div class="empty">${all.length ? `No ${optMode() === "red" ? "redraft" : "dynasty or keeper"} leagues in season.` : "No in-season leagues with enough roster data yet."}</div>`;
  if(!OPT.lid || !Ls.some(x=>x.lg.league_id === OPT.lid)) OPT.lid = (openLs[0] || Ls[0]).lg.league_id;
  const ran = openLs.filter(x=>OPT.res[x.lg.league_id]).length, view = ran >= 2 ? optView() : "league";
  const sent = OFFERS.all(), acc = sent.filter(o=>o.status === "accepted").length, waiting = sent.filter(o=>o.status === "sent").length;
  let m = "";
  if(nRed){ const red = optMode() === "red";
    m += `<div class="seg sm optmode" style="--n:2;--i:${red ? 1 : 0}" role="tablist" aria-label="League type"><i></i><button role="tab" data-optmode="dyn" aria-selected="${!red}">Dynasty &amp; keeper<span class="ct">${nDyn}</span></button><button role="tab" data-optmode="red" aria-selected="${red}">Redraft<span class="ct">${nRed}</span></button></div>`; }
  m += `<div class="optbar"><button class="primary" data-optrun="all" ${OPT.busy ? "disabled" : ""}>${ran ? "Re-run" : "Optimize"} all ${openLs.length} ${optMode() === "red" ? "redraft " : ""}leagues</button>
    ${sent.length ? `<button class="linkbtn" data-go="offers">${waiting} waiting · ${acc} accepted on your Offers page</button>` : ""}<span id="optStatus" class="statusline" ${OPT.busy ? "" : "hidden"}>${OPT.busy ? optStatusHTML() : ""}</span></div>`;
  m += optSideHTML("narrow");
  if(ran >= 2) m += `<div class="seg sm optview" style="--n:2;--i:${view === "best" ? 0 : 1}" role="tablist" aria-label="View"><i></i><button role="tab" data-optview="best" aria-selected="${view === "best"}">Best across my leagues</button><button role="tab" data-optview="league" aria-selected="${view === "league"}">One league</button></div>`;
  if(view === "best"){
    const xs = optBestAcross();
    m += `<div class="sub">The strongest offer from ${xs.length} league${xs.length === 1 ? "" : "s"}, with play types spread out. Open a league for its full board of up to 12.</div>`;
    m += xs.length ? xs.map((x, i)=>optOfferHTML(x.L, x.o, i, true)).join("") : `<div class="empty">No offers yet. Run the optimizer to fill this in.</div>`;
  } else {
    const L = S.dir.leagues[OPT.lid], lid = OPT.lid, r = OPT.res[lid], cfg = optCfg(lid), open = leagueOpen(L);
    m += `<section class="optlgs" aria-label="Your leagues">${Ls.map(x=>{ const o = leagueOpen(x), rr = OPT.res[x.lg.league_id], n = rr && rr.offers ? rr.offers.length : null;
      return `<button class="optlg glass${x.lg.league_id === lid ? " on" : ""}${o.ok ? "" : " off"}" data-optlg="${x.lg.league_id}"><b>${esc(x.lg.name)}</b><small>${esc(x.me.bp.rec)} · ${o.ok ? esc(DIR[x.me.dir].short) : "Locked"}</small><span class="optn">${!o.ok ? "—" : n == null ? "Not run" : `${n} offer${n === 1 ? "" : "s"}`}</span></button>`; }).join("")}</section>`;
    if(!open.ok) m += `<div class="empty">${esc(open.why)}</div>`;
    else {
      m += r && !r.error ? optSituationHTML(L, r) : "";
      m += optTagsHTML(L, cfg);
      if(!r) m += `<button class="askbtn" data-optrun="one" ${OPT.busy ? "disabled" : ""}>${OPT.busy ? "Working…" : `Find offers in ${esc(L.lg.name)}`}</button>`;
      else if(r.error) m += `<div class="err">${esc(r.error)}</div>`;
      else {
        const stale = r.cfgKey !== JSON.stringify(cfg) + optDirSet(lid);
        m += `<div class="optsum"><span>Tested <b>${r.tested.toLocaleString()}</b> packages with ${L.N - 1} league-mates · <b>${r.offers.length}</b> offer${r.offers.length === 1 ? "" : "s"} that help both sides</span>${stale ? `<button class="ghost tint" data-optrun="one">Re-run with your changes</button>` : `<button class="linkbtn" data-optrun="one">Re-run</button>`}</div>`;
        m += r.offers.length ? r.offers.map((o, i)=>optOfferHTML(L, o, i, false)).join("") : `<div class="empty">No offer moved your goal enough while also helping the other side. That's a real answer: hold here, or tag more players as Trade.</div>`;
      }
    }
  }
  m += `<details class="glass ccnote optdet"><summary><b>How offers are priced and picked</b></summary><span>Every player and pick starts from the FFU Index, fitted only on real trades in the FFU database with recent trades weighted most, leaning toward market consensus where a player has few trades. Packages add the way the Index was fitted, so three mid pieces don't add up to a star. Today's price moves with the 30-day trend, recent production, the rest-of-season outlook (his projected rank this year, which carries his real team's role and schedule) and injuries. Later value applies an age curve: productive vets lose value every offseason, young studs hold theirs. A season sim on each league's real schedule sets every team's direction. You're judged on your goal; the partner on today's market and theirs. Offers lean your way, up to about 12% over fair, and each board spreads play types, partners, sizes and players.</span></details>`;
  return h + `<div class="optshell"><div class="optmain">${m}</div>${optSideHTML("wide")}</div>`;
}

/* ---------- events ---------- */
document.addEventListener("click", e=>{
  const el = e.target.closest("[data-optmode],[data-optlg],[data-optrun],[data-opttag],[data-opttags],[data-optwant],[data-optwantx],[data-optdir],[data-optview],[data-optside],[data-optmore],[data-optsent],[data-optsideopen]"); if(!el) return;
  const d = el.dataset;
  if(d.optmode){ store.set("optMode", d.optmode); OPT.q = ""; render(); return; }
  if(d.optview){ store.set("optView", d.optview); render(); return; }
  if(d.optside){ OPT.side = d.optside; OPT.sideMore = false; render(); return; }
  if(d.optmore){ OPT.sideMore = true; render(); return; }
  if(d.optsideopen){ OPT.sideOpen = true; render(); return; }
  if(d.optsent){ try{ addOffer(JSON.parse(d.optsent)); showToast("Marked sent · tracked on your Offers page"); }catch(_){} render(); return; }
  if(d.optlg){ OPT.lid = d.optlg; OPT.q = ""; store.set("optView", "league"); render(); window.scrollTo({top:0, behavior:"smooth"}); return; }
  if(d.optrun){ const lids = d.optrun === "all" ? optLeagues().filter(L=>leagueOpen(L).ok).map(L=>L.lg.league_id) : [OPT.lid]; if(d.optrun === "all") store.set("optView", "best"); optRun(lids); return; }
  if(d.opttags){ OPT.tagLg = OPT.tagLg === d.opttags ? null : d.opttags; render(); return; }
  if(d.opttag != null){ const i = d.opttag.lastIndexOf("|"), k = d.opttag.slice(0, i), v = d.opttag.slice(i + 1), c = optCfg(OPT.lid);
    c.trade = c.trade.filter(x=>x !== k); c.core = c.core.filter(x=>x !== k); if(v) c[v].push(k); optSave(OPT.lid, c); render(); return; }
  if(d.optwant){ const c = optCfg(OPT.lid); if(!c.want.includes(d.optwant)) c.want.push(d.optwant); OPT.q = ""; optSave(OPT.lid, c); render(); return; }
  if(d.optwantx){ const c = optCfg(OPT.lid); c.want = c.want.filter(x=>x !== d.optwantx); optSave(OPT.lid, c); render(); return; }
  if(d.optdir != null){ store.set("dir:" + OPT.lid, d.optdir || null); delete OPT.res[OPT.lid]; const L = S.dir && S.dir.leagues[OPT.lid]; if(L) delete L._ot; render(); return; }
});
document.addEventListener("input", e=>{ if(e.target.id === "optq"){ OPT.q = e.target.value; render(); } });

/* ---------- entry points: menu, rail, home tools ---------- */
{ const g = CC_TOOLS.find(x=>x[0] === "Trades"); if(g && !g[1].some(x=>x[0] === "optimizer")) g[1].unshift(["optimizer","Trade Optimizer","trades","#4BE3A0",{go:"optimizer"}, 1]); }
if(!TOOL_ORDER.includes("optimizer")) TOOL_ORDER.splice(TOOL_ORDER.indexOf("trades") + 1, 0, "optimizer");
{ const _ts = toolStatus; toolStatus = function(id){ return id === "optimizer" ? {t:"Best offers in every league"} : _ts(id); }; }
// fresh data from Sleeper invalidates the results
{ const _ra = typeof runAnalysis === "function" ? runAnalysis : null; if(_ra){ runAnalysis = function(){ OPT.res = {}; OPT.mkt = null; OPT.maps = {}; OPT.prodP = null; return _ra.apply(this, arguments); }; } }

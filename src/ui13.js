/* =====================================================================
   Trade Optimizer (Nov 27, 2026)
   A trading desk for every league. Each asset has one market price (FFU value: market price × in-house
   factor fitted on the FFU trade database) and a different worth to each team:
     team value = w × win-now gain + (1 − w) × future gain, with w from that team's direction.
   The optimizer searches every league-mate's roster for packages where you gain by your goal, they gain
   by theirs, and the prices balance inside the range that manager actually trades at. Market signals
   (FFU Index vs price, 30-day momentum) reward buying underpriced assets and selling overpriced ones.
   You tag your players Trade (the only pieces it offers) or Core (never offered), and add targets.
   ===================================================================== */
VIEWS.add("optimizer");
const OPT = {lid:null, res:{}, busy:null, idx:null, idxP:null, nfl:null, nflP:null, sched:null, schedP:null, tagLg:null, all:false, open:{}, q:""};
const OPT_W = {stay:.75, allin:.9, contend:.85, push:.8, retool:.35, sell:.25, rebuild:.15, teardown:.05};
const OPT_KIND = {best:"Best for you", easy:"Easiest yes", market:"Market play"};
const oclamp = (x, a, b) => Math.max(a, Math.min(b, x));
// Redraft leagues are their own mode: FantasyCalc redraft prices (the league's own value table), win-now only
const optRedraft = L => ((L.lg.settings || {}).type || 0) === 0;
const optMode = () => store.get("optMode", "dyn");
// Inactive: no trades or roster moves this season, or nothing in 45 days. Still considered, just flagged.
function optIdle(p){ const a = p.act || {}, pr = p.prof || {}, last = Math.max(a.last || 0, pr.last || 0);
  if(!(a.moves || 0) && !(pr.n || 0)) return "No trades or roster moves this season";
  if(last && Date.now() - last > 45*864e5) return `Last trade or roster move ${ago(last)}`;
  return null; }

/* ---------- per-league choices: your tags and targets (synced with your account like other settings) ---------- */
function optCfg(lid){ const c = store.get("opt:" + lid, null) || {}; return {trade:c.trade || [], core:c.core || [], want:c.want || []}; }
function optSave(lid, c){ store.set("opt:" + lid, c); delete OPT.res[lid]; }
function optDirSet(lid){ return store.get("dir:" + lid, null); }

/* ---------- data the desk reads ---------- */
// FFU Index: values fitted only on real trades (backend/ffu-index.mjs), served by /api/app/index
function loadIndex(){ return OPT.idxP ||= fetch(FFU_API + "/api/app/index").then(r=>r.ok ? r.json() : null).catch(()=>null).then(x=>{ OPT.idx = x; return x; }); }
// NFL context: this week's records (ESPN) and the full schedule (Sleeper) for playoff-week matchups
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

/* ---------- pricing and signals ---------- */
const y2v = a => a.pos === "PICK" ? a.v : a.v*ageMult(a.pos, a.age)*ageMult(a.pos, a.age ? a.age + 1 : null);
const pkSR = a => { const m = /^(\d{4}) (\d)/.exec(a.name || ""); return m ? `${m[1]}-${m[2]}` : null; };
function idxScale(L){
  if(L._idx !== undefined) return L._idx;
  const ix = OPT.idx; if(!ix || optRedraft(L)) return L._idx = null;   // the index is fitted on dynasty trades
  const shape = L.fc && L.fc.meta && L.fc.meta.q === 2 ? "sf" : "oneqb", map = ix[shape]; if(!map) return L._idx = null;
  const r = [];
  for(const t of L.teams) for(const a of optAssets(L, t)) if(a.pos !== "PICK" && a.v >= 800){ const e = map[a.id]; if(e && e[1] >= 5 && e[0] > 0) r.push(a.v / e[0]); }
  if(r.length < 25) return L._idx = null;
  r.sort((x,y)=>x-y);
  return L._idx = {map, k:r[r.length >> 1], shape};
}
// mispricing: what real trades say an asset is worth vs its price (+ = underpriced); momentum: 30-day value change
function signalOf(L, a){
  if(a._sig && a._sig.L === L) return a._sig;
  const s = {L, mis:null, n:null, mom:0};
  const sc = idxScale(L);
  if(sc && a.v >= 400){ const key = a.pos === "PICK" ? pkSR(a) : a.id, e = key && sc.map[key];
    if(e && e[1] >= (a.pos === "PICK" ? 20 : 5)){ s.mis = oclamp(e[0]*sc.k/a.v - 1, -.35, .35); s.n = e[1]; } }
  if(a.pos !== "PICK" && a.v > 0) s.mom = oclamp((a.trend || 0)/a.v, -.3, .3);
  const ih = a.pos === "PICK" ? null : ffuFactor("player", a.id); s.trades = ih && ih.n != null ? ih.n : null;
  return a._sig = s;
}
function pkgSignal(L, give, get){
  const P = pmOf(give) + pmOf(get) || 1, part = (list, f) => list.reduce((s,a)=>s + a.v*f(signalOf(L, a)), 0);
  const mis = (part(get, s=>s.mis || 0) - part(give, s=>s.mis || 0))/P, mom = (part(give, s=>s.mom) - part(get, s=>s.mom))/P;
  return mis + .3*mom;
}

/* ---------- team value ---------- */
function optAssets(L, t){ const A = assetsOf(L, t); return t._oa ||= A.players.concat(A.picks); }
function optWeight(L, t){
  if(optRedraft(L)) return .97;   // no next season to build for
  if(t === L.me){ const set = optDirSet(L.lg.league_id); if(set === "contend") return .85; if(set === "rebuild") return .15; }
  return OPT_W[t.dir] ?? .5;
}
function optLev(t){ const p = t.odds.po; return 4*p*(1-p) + .55*p + .1; }   // how much a weekly point matters: most on the bubble, still a lot for favorites (title odds)
// cheap team value of losing `out` and gaining `inn`, in units of about one starter-level upgrade
function teamU(L, t, out, inn, w){
  const outIds = new Set(out.filter(a=>a.pos !== "PICK").map(a=>a.id));
  const ids = t.ids.filter(id=>!outIds.has(id)).concat(inn.filter(a=>a.pos !== "PICK").map(a=>a.id));
  const dPts = lineupPts(L.lg, ids, L.cache).pts - t.proj;
  const now = dPts/6*optLev(t);
  const dY2 = inn.reduce((s,a)=>s + y2v(a), 0) - out.reduce((s,a)=>s + y2v(a), 0);
  const fut = dY2/Math.max(t.bp.y2/12, 500);
  return {u: w*now + (1-w)*fut, now, fut, dPts, dY2};
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
  const r = t.bp.roster, active = (r.players || []).filter(p=>!(r.reserve || []).includes(p) && !(r.taxi || []).includes(p)).length;
  const max = (L.lg.roster_positions || []).length, after = active - out.filter(a=>a.pos !== "PICK" && !(r.reserve || []).includes(a.id) && !(r.taxi || []).includes(a.id)).length + inn.filter(a=>a.pos !== "PICK").length;
  return {after, max, over: Math.max(0, after - max)};
}
function dropFor(L, t, out){
  const taken = new Set(out.map(a=>a.id));
  return optAssets(L, t).filter(a=>a.pos !== "PICK" && !taken.has(a.id) && !t.starters.has(a.id)).sort((a,b)=>a.v - b.v)[0] || null;
}

/* ---------- accept odds: price against their own habits, fit with their direction, how often they trade ---------- */
function optProfiles(lid){
  const m = {}; if(typeof MG !== "undefined" && MG.data) for(const r of MG.data) if(r.lid === lid) m[r.rid] = r;
  return m;
}
function acceptOdds(t, give, get, uT, prof, act){
  const ratio = pmOf(give)/Math.max(pmOf(get), 1);   // what they receive / what they send
  let z = -.35 + 3.5*oclamp(ratio - 1 + (prof && prof.pm != null ? .5*prof.pm : 0), -.4, .4) + 1.1*oclamp(uT, -1, 1.2);
  if(prof && prof.buys){ const cat = a => a.pos === "PICK" ? "Picks" : a.pos; if(give.some(a=>cat(a) === prof.buys)) z += .35; }
  const a = act[t.rid] || {trades:0, moves:0, last:0}, n = prof && prof.n != null ? prof.n : a.trades, last = Math.max(a.last || 0, prof && prof.last || 0);
  z += Math.min(.6, .2*n) + (last && Date.now() - last < 14*864e5 ? .2 : 0) - (a.moves || n ? 0 : 1.2);
  return oclamp(1/(1 + Math.exp(-z)), .03, .92);
}

/* ---------- the search ---------- */
function combos(list, k, must){
  const out = [], rec = (s, cur) => { if(cur.length && must.every(m=>cur.includes(m))) out.push(cur); if(cur.length === k) return; for(let i = s; i < list.length; i++) rec(i + 1, cur.concat([list[i]])); };
  rec(0, []); return out;
}
async function optimizeLeague(L, onStep){
  const lid = L.lg.league_id, cfg = optCfg(lid), me = L.me, wMe = optWeight(L, me), open = leagueOpen(L);
  const res = {lid, at:Date.now(), wMe, open, partners:[], tested:0, kept:0, cfgKey:JSON.stringify(cfg) + optDirSet(lid)};
  if(!open.ok) return res;
  const act = teamActivity(lid), prof = optProfiles(lid);
  const mine = optAssets(L, me).filter(a=>a.v >= 100), core = new Set(cfg.core), tradeSet = new Set(cfg.trade);
  const top2 = new Set(mine.filter(a=>a.pos !== "PICK").slice().sort((a,b)=>b.v - a.v).slice(0, 2).map(a=>a.k));
  // your pool: only what you tagged Trade, or (untagged) the pieces worth least to you for their price; Core and your two best are never offered
  let pool = tradeSet.size ? mine.filter(a=>tradeSet.has(a.k)) : mine.filter(a=>!core.has(a.k) && !top2.has(a.k));
  pool = pool.filter(a=>!core.has(a.k)).map(a=>({a, c:-teamU(L, me, [a], [], wMe).u/Math.max(a.v/1000, .2)})).sort((x,y)=>x.c - y.c).slice(0, tradeSet.size ? 9 : 7).map(x=>x.a);
  if(!pool.length) return res;
  const want = new Set(cfg.want), others = L.teams.filter(t=>t !== me);
  for(let pi = 0; pi < others.length; pi++){
    const t = others[pi], wT = optWeight(L, t), pr = prof[t.rid] || null;
    if(onStep) await onStep(t, pi, others.length);
    const theirs = optAssets(L, t).filter(a=>a.v >= 150), forced = theirs.filter(a=>want.has(a.k));
    if(want.size && !forced.length) continue;
    const ranked = theirs.filter(a=>!want.has(a.k)).map(a=>{ const g = teamU(L, me, [], [a], wMe).u, l = teamU(L, t, [a], [], wT).u; return {a, s:(g + .6*l)/Math.max(a.v/1000, .2), g}; })
      .filter(x=>x.g > 0).sort((x,y)=>y.s - x.s).slice(0, 6).map(x=>x.a);
    const getPool = forced.concat(ranked).slice(0, 7);
    if(!getPool.length) continue;
    const gives = combos(pool, 3, []), gets = combos(getPool, 2, forced);
    const band = [-.15, .06 + Math.max(0, pr && pr.pm != null ? Math.min(.1, pr.pm) : 0)];
    const cand = [];
    for(const get of gets){ const gv = pmOf(get);
      for(const give of gives){ res.tested++;
        const sv = pmOf(give), gap = (gv - sv)/Math.max(gv, sv, 1);
        if(gap < band[0] || gap > band[1]) continue;
        if(give.length >= 2 && Math.min(...give.map(a=>a.v)) < gv*.08) continue;   // no filler
        const roomMe = rosterRoom(L, me, give, get); if(roomMe.over > 1) continue;
        const drop = roomMe.over ? dropFor(L, me, give) : null; if(roomMe.over && !drop) continue;
        const roomT = rosterRoom(L, t, get, give); if(roomT.over > 1) continue;
        const uMe = teamU(L, me, drop ? give.concat([drop]) : give, get, wMe), uT = teamU(L, t, get, give, wT);
        if(uMe.u < .08 || uT.u < -.05) continue;
        const acc = acceptOdds(t, give, get, uT.u, pr, act) * (roomT.over ? .85 : 1), sig = pkgSignal(L, give, get);
        cand.push({t, give, get, drop, gap, uMe, uT, acc, sig, roomT, score: uMe.u*(.3 + acc) + 2*sig*acc});
      } }
    if(!cand.length) continue;
    cand.sort((a,b)=>b.score - a.score);
    const opts = [], used = new Set(), keyOf = c => c.give.map(a=>a.k).sort().join(",") + ">" + c.get.map(a=>a.k).sort().join(",");
    const take = (kind, c) => { if(!c || used.has(keyOf(c))) return; used.add(keyOf(c)); opts.push({...c, kind}); };
    const best = cand.filter(c=>c.acc >= .2).sort((a,b)=>b.uMe.u*(.5 + b.acc) - a.uMe.u*(.5 + a.acc))[0] || cand[0];
    take("best", best);
    take("easy", cand.filter(c=>c.uMe.u >= .5*best.uMe.u && !used.has(keyOf(c))).sort((a,b)=>b.acc - a.acc)[0]);
    take("market", cand.filter(c=>c.sig > .03 && c.acc >= .2 && !used.has(keyOf(c))).sort((a,b)=>b.sig - a.sig)[0]);
    res.kept += cand.length;
    // finalists get the full season simulation for both teams
    for(const o of opts){ try{ o.ev = evalTrade(L, me, t, o.drop ? o.give.concat([o.drop]) : o.give, o.get); }catch(e){ o.ev = null; } }
    res.partners.push({t, opts, wT, prof:pr, act:act[t.rid] || null, top:Math.max(...opts.map(o=>o.score))});
  }
  res.partners.sort((a,b)=>b.top - a.top);
  return res;
}

/* ---------- running it: one league, or every league in one pass ---------- */
function optAllLeagues(){ return S.dir && S.dir.leagues ? Object.values(S.dir.leagues).filter(L=>L.me) : []; }
function optLeagues(){ const red = optMode() === "red"; return optAllLeagues().filter(L=>optRedraft(L) === red); }
async function optRun(lids){
  if(OPT.busy) return;
  OPT.busy = {i:0, n:lids.length, phase:"Reading market data"}; render();
  await Promise.all([loadIndex(), loadNfl(), (typeof MG !== "undefined" && !MG.data && !MG.busy && typeof buildManagers === "function") ? buildManagers().catch(()=>{}) : null]);
  for(let i = 0; i < lids.length; i++){
    const L = S.dir.leagues[lids[i]]; if(!L) continue;
    OPT.busy = {i, n:lids.length, phase:`${L.lg.name}: pricing every roster`}; renderOptStatus();
    await sleep(0);
    try{ OPT.res[L.lg.league_id] = await optimizeLeague(L, async (t, k, n)=>{ OPT.busy.phase = `${L.lg.name}: testing trades with ${t.bp.name} (${k + 1} of ${n})`; renderOptStatus(); await sleep(0); }); }
    catch(e){ OPT.res[L.lg.league_id] = {lid:L.lg.league_id, error:e.message || String(e), partners:[]}; }
  }
  OPT.busy = null; render();
}
function renderOptStatus(){ const el = document.getElementById("optStatus"); if(el && OPT.busy) el.innerHTML = optStatusHTML(); }
function optStatusHTML(){ const b = OPT.busy; return `<span class="livedot" style="background:var(--violet)"></span><span>${esc(b.phase)}${b.n > 1 ? ` · league ${b.i + 1} of ${b.n}` : ""}</span>`; }

/* ---------- words ---------- */
const optName = a => (a.name || "").replace(" (via trade)", "");
const optList = l => l.map(optName).join(" + ");
function scheduleLine(L, a){
  const nfl = OPT.nfl, team = (S.proj[a.id] && S.proj[a.id].player || {}).team; if(!nfl || !team || !nfl.sched[team]) return null;
  const ps = (L.lg.settings || {}).playoff_week_start || 15, wks = [ps, ps + 1, ps + 2].filter(w=>w <= 18);
  const opps = wks.map(w=>nfl.sched[team][w] || null), def = typeof CTX !== "undefined" && CTX.def && CTX.def.rank;
  const ranks = def ? opps.map(o=>o && def[o] && def[o][a.pos]).filter(Boolean) : [];
  const avg = ranks.length ? ranks.reduce((s,r)=>s + r, 0)/ranks.length : null;
  const tag = avg == null ? "" : avg <= 11 ? " (soft: these defenses allow the most points to his position)" : avg >= 22 ? " (tough matchups)" : "";
  return `Playoff weeks ${wks[0]}–${wks[wks.length-1]}: ${opps.map(o=>o || "bye").join(", ")}${tag}`;
}
function nflLine(a){
  const nfl = OPT.nfl, team = (S.proj[a.id] && S.proj[a.id].player || {}).team, rec = nfl && team && nfl.rec[team]; if(!rec) return null;
  const [w, l] = rec.split("-").map(Number), risk = w - l >= 7 && S.week >= 12;
  return `${team} ${rec}${risk ? ": could clinch early and rest starters in week 17" : w - l <= -5 ? ": out of the race, so watch for young players getting more snaps" : ""}`;
}
function whyThem(L, o){
  const t = o.t, b = t.bp, out = [], buyer = BUYERS.has(t.dir);
  out.push(`${b.name} is ${b.rec}, ${DIR[t.dir].label.toLowerCase()} (${pct(t.odds.po)} playoff odds)${!optRedraft(L) && BUYERS.has(L.me.dir) !== buyer ? ", the opposite way from you" : ""}.`);
  if(o.ev && (buyer || optRedraft(L))) out.push(`Their lineup ${sgn(o.ev.dTh)} pts/wk and playoff odds ${pct(o.ev.th.po0)} → ${pct(o.ev.th.po1)}.`);
  else if(o.ev) out.push(`Their future value rank ${ord(o.ev.th.f0)} → ${ord(o.ev.th.f1)}: they get ${optList(o.give.filter(a=>a.young)) || "younger pieces"}.`);
  const weak = ["QB","RB","WR","TE"].slice().sort((x,y)=>b.posRank[y] - b.posRank[x])[0];
  if(o.give.some(a=>a.pos === weak)) out.push(`Fills their weakest spot: ${weak}, ${ord(b.posRank[weak])} of ${L.N}.`);
  const p = o.prof;
  if(p && p.buys && o.give.some(a=>(a.pos === "PICK" ? "Picks" : a.pos) === p.buys)) out.push(`Matches what they buy: ${p.buys}${p.buyShare ? ` (${p.buyShare}% of what they've traded for)` : ""}.`);
  if(p && p.pm != null && Math.abs(p.pm) >= .05) out.push(p.pm > 0 ? `Pays about ${Math.round(p.pm*100)}% over value in their trades.` : `Usually wins their trades by about ${Math.round(-p.pm*100)}%, so the offer leans their way.`);
  const n = p && p.n != null ? p.n : (o.act ? o.act.trades : 0);
  out.push(n ? `${n} trade${n === 1 ? "" : "s"} this season${p && p.src === "db" && p.lgs > 1 ? ` across ${p.lgs} leagues` : ""}${p && p.last ? `, last ${ago(p.last)}` : o.act && o.act.last ? `, last ${ago(o.act.last)}` : ""}.` : "No trades this season: a long shot.");
  return out;
}
function whyYou(L, o){
  const out = [], ev = o.ev, me = L.me;
  if(ev){ out.push(o.uMe.now >= o.uMe.fut || optWeight(L, me) >= .5
      ? `Lineup ${sgn(ev.dMe)} pts/wk · playoff odds ${pct(ev.me.po0)} → ${pct(ev.me.po1)} · title ${pct(ev.me.t0)} → ${pct(ev.me.t1)}.`
      : `Future value ${sgn((ev.me.y1 - ev.me.y0)/Math.max(ev.me.y0, 1)*100, 0)}% · future rank ${ord(ev.me.f0)} → ${ord(ev.me.f1)} · playoff odds ${pct(ev.me.po0)} → ${pct(ev.me.po1)}.`); }
  for(const a of o.get) if(a.pos !== "PICK" && (ev ? ev.dMe > .5 : true)){ const s = scheduleLine(L, a); if(s) out.push(`${optName(a)}: ${s}.`); }
  for(const a of o.get.concat(o.give)) if(a.pos !== "PICK"){ const n = nflLine(a); if(n) out.push(`${optName(a)}: ${n}.`); }
  for(const a of o.get){ const st = (S.proj[a.id] && S.proj[a.id].player || {}).injury_status; if(st && st !== "Healthy") out.push(`${optName(a)} is listed ${st}.`); }
  if(o.drop) out.push(`Your roster is full, so ${optName(o.drop)} (lowest-value bench player) is dropped.`);
  return out;
}
function marketBits(L, a){
  const s = signalOf(L, a), b = [];
  if(s.mis != null && Math.abs(s.mis) >= .08) b.push(`<span class="ochip ${s.mis > 0 ? "up" : "dn"}" title="FFU Index (fitted only on ${s.n} real trades) vs his price">${s.mis > 0 ? "Underpriced" : "Overpriced"} ${Math.round(Math.abs(s.mis)*100)}%</span>`);
  if(Math.abs(s.mom) >= .05) b.push(`<span class="ochip ${s.mom > 0 ? "hot" : "cold"}" title="30-day change in market value">${s.mom > 0 ? "▲" : "▼"} ${Math.round(Math.abs(s.mom)*100)}% 30d</span>`);
  if(a.adjRel && Math.abs(a.adjRel - 1) >= .06) b.push(`<span class="ochip ed">${a.adjRel > 1 ? "+" : ""}${Math.round((a.adjRel - 1)*100)}% here</span>`);
  return b.join("");
}
function optPitch(L, o){
  const b = o.t.bp, red = optRedraft(L), buyer = BUYERS.has(o.t.dir) || red;
  const s = [`Hey ${b.name}, ${buyer ? `you're ${b.rec}${red && !BUYERS.has(o.t.dir) ? " and this could get you back in it." : " and in the race."}` : "looks like you're building toward next year."}`, `Would you do ${optList(o.give)} for ${optList(o.get)}?`];
  if(o.ev && buyer && o.ev.th.po1 - o.ev.th.po0 >= .02) s.push(`By my numbers it adds about ${fmt(o.ev.dTh)} points a week and takes your playoff odds from ${pct(o.ev.th.po0)} to ${pct(o.ev.th.po1)}.`);
  const yg = o.give.filter(a=>a.young); if(!buyer && yg.length) s.push(`${optList(yg)} fit${yg.length === 1 ? "s" : ""} where your roster is headed.`);
  if(o.gap < -.02) s.push(`On current market values you come out ahead.`);
  s.push("Open to a counter.");
  return s.join(" ");
}

/* ---------- screen ---------- */
function viewOptimizer(){
  let h = `<section class="pagehead">${backBtn("trades","Trades")}<h1 class="h1">Trade optimizer</h1><div class="sub">The best value-backed offers in each league, built from market prices, the FFU trade database and every league-mate's direction and habits.</div></section>`;
  if(!S.dir){ if(!S.dirLoading && !S.dirError) setTimeout(loadDirection, 0);
    return h + (S.dirError ? `<div class="err">${esc(S.dirError)}</div>` : `<div class="statusline"><span class="livedot" style="background:var(--violet)"></span>${esc(S.dirPhase || "Simulating every season")} · ${Math.round((S.dirProgress || 0)*100)}%</div><div class="skel" aria-hidden="true"><i style="height:120px"></i><i style="height:220px"></i></div>`); }
  const all = optAllLeagues(), nRed = all.filter(optRedraft).length, nDyn = all.length - nRed;
  if(optMode() === "red" && !nRed) store.set("optMode", "dyn");
  if(nRed){ const red = optMode() === "red";
    h += `<div class="seg sm optmode" style="--n:2;--i:${red ? 1 : 0}" role="tablist" aria-label="League type"><i></i><button role="tab" data-optmode="dyn" aria-selected="${!red}">Dynasty &amp; keeper<span class="ct">${nDyn}</span></button><button role="tab" data-optmode="red" aria-selected="${red}">Redraft<span class="ct">${nRed}</span></button></div>`; }
  const Ls = optLeagues().sort((a,b)=>a.lg.name.localeCompare(b.lg.name));
  if(!Ls.length) return h + `<div class="empty">${all.length ? `No ${optMode() === "red" ? "redraft" : "dynasty or keeper"} leagues in season.` : "No in-season leagues with enough roster data yet."}</div>`;
  if(!OPT.lid || !Ls.some(x=>x.lg.league_id === OPT.lid)) OPT.lid = (Ls.find(L=>leagueOpen(L).ok) || Ls[0]).lg.league_id;
  const L = S.dir.leagues[OPT.lid], lid = OPT.lid, r = OPT.res[lid], cfg = optCfg(lid);
  // every league at a glance
  h += `<section class="optlgs" aria-label="Your leagues">${Ls.map(x=>{ const o = leagueOpen(x), rr = OPT.res[x.lg.league_id], n = rr && rr.partners ? rr.partners.reduce((s,p)=>s + p.opts.length, 0) : null;
    return `<button class="optlg glass${x.lg.league_id === lid ? " on" : ""}${o.ok ? "" : " off"}" data-optlg="${x.lg.league_id}"><b>${esc(x.lg.name)}</b><small>${esc(x.me.bp.rec)} · ${o.ok ? esc(DIR[x.me.dir].short) : "Locked"}</small><span class="optn">${!o.ok ? "—" : n == null ? "Not run" : `${n} offer${n === 1 ? "" : "s"}`}</span></button>`; }).join("")}</section>
    <div class="optbar"><button class="primary" data-optrun="all" ${OPT.busy ? "disabled" : ""}>Optimize all ${Ls.filter(x=>leagueOpen(x).ok).length} ${optMode() === "red" ? "redraft " : ""}leagues</button><span id="optStatus" class="statusline" ${OPT.busy ? "" : "hidden"}>${OPT.busy ? optStatusHTML() : ""}</span></div>`;
  const open = leagueOpen(L), me = L.me, b = me.bp, set = optDirSet(lid), w = optWeight(L, me);
  const weak = ["QB","RB","WR","TE"].slice().sort((x,y)=>b.posRank[y] - b.posRank[x]), strong = weak.slice().reverse();
  h += `<section class="glass optcard"><div class="opthd"><div><b class="h2">${esc(L.lg.name)}</b><div class="sub">${esc(b.name)} · ${esc(b.rec)} · ${pct(me.odds.po)} playoff odds${optRedraft(L) ? " · redraft" : ` · future value ${ord(b.futRank)} of ${L.N}`}</div></div>
      ${optRedraft(L) ? "" : chipSelect("Optimize for", "optdir", [["", `Auto: ${DIR[me.dir].label}`], ["contend","Contend"], ["rebuild","Rebuild"]], set || "")}</div>
    <div class="optgoal"><span style="--w:${Math.round(w*100)}%"><i></i></span><small>${optRedraft(L) ? "Redraft: every offer is priced on rest-of-season value and judged on this season only" : `${Math.round(w*100)}% win now · ${Math.round((1-w)*100)}% future`}</small></div>
    <div class="sub">Needs: <b>${weak[0]}</b> (${ord(b.posRank[weak[0]])}) and ${weak[1]} (${ord(b.posRank[weak[1]])}) · Deepest: ${strong[0]} (${ord(b.posRank[strong[0]])})${open.deadline ? ` · Trade deadline week ${open.deadline}` : ""}</div></section>`;
  if(!open.ok) return h + `<div class="empty">${esc(open.why)}</div>`;
  h += tagsHTML(L, cfg);
  if(!r){ h += `<button class="askbtn" data-optrun="one" ${OPT.busy ? "disabled" : ""}>${OPT.busy ? "Working…" : `Find the best offers in ${esc(L.lg.name)}`}</button>`; return h; }
  if(r.error) return h + `<div class="err">${esc(r.error)}</div>`;
  const stale = r.cfgKey !== JSON.stringify(cfg) + optDirSet(lid);
  const nOffers = r.partners.reduce((s,p)=>s + p.opts.length, 0);
  h += `<div class="optsum"><span>Tested <b>${r.tested.toLocaleString()}</b> packages with ${L.N - 1} league-mates · <b>${nOffers}</b> offer${nOffers === 1 ? "" : "s"} help both sides and pass the league rules</span>${stale ? `<button class="ghost tint" data-optrun="one">Re-run with your changes</button>` : `<button class="linkbtn" data-optrun="one">Re-run</button>`}</div>`;
  if(!r.partners.length) h += `<div class="empty">No package helps both sides at a fair price with these choices. Tag more players as Trade, or remove a target.</div>`;
  r.partners.forEach((p, i)=>{ h += partnerHTML(L, p, i); });
  h += `<div class="glass ccnote"><b>How offers are found</b><span>Each asset has one market price (FFU value: the market price corrected by real trades in the FFU database, with the stud premium for packages) and a different worth to each team: win-now gain from the season sim in this league's scoring, and future gain from age-adjusted value two seasons out, weighted by each team's direction. The optimizer keeps packages where both teams gain by their own goal and the prices balance within the range that manager trades at, then ranks them by your gain × their accept odds, with a bonus for buying what the FFU Index says is underpriced.</span></div>`;
  return h;
}
function tagsHTML(L, cfg){
  const me = L.me, lid = L.lg.league_id, mine = optAssets(L, me).filter(a=>a.v >= 100).slice().sort((a,b)=>b.v - a.v);
  const st = a => cfg.core.includes(a.k) ? "core" : cfg.trade.includes(a.k) ? "trade" : "";
  const nT = cfg.trade.length, nC = cfg.core.length, open = OPT.tagLg === lid;
  const row = a => `<div class="optrow"><span class="t"><b>${esc(optName(a))}</b><small>${a.pos === "PICK" ? "Pick" : `${a.pos}${a.age ? " · " + Math.floor(a.age) : ""}${me.starters.has(a.id) ? " · starter" : ""}`} · ${Math.round(a.v).toLocaleString()}</small></span>
    <span class="seg3" role="group" aria-label="${esc(optName(a))}">${[["trade","Trade"],["","—"],["core","Core"]].map(([k,l])=>`<button data-opttag="${esc(a.k)}|${k}" aria-pressed="${st(a) === k}" class="${k}">${l}</button>`).join("")}</span></div>`;
  const others = L.teams.filter(t=>t !== me).flatMap(t=>optAssets(L, t).filter(a=>a.v >= 300).map(a=>({a, t}))).sort((x,y)=>y.a.v - x.a.v);
  const q = OPT.q.trim().toLowerCase(), hits = q.length >= 2 ? others.filter(x=>optName(x.a).toLowerCase().includes(q) && !cfg.want.includes(x.a.k)).slice(0, 6) : [];
  const wantChips = cfg.want.map(k=>{ const x = others.find(o=>o.a.k === k); return x ? `<span class="ochip want">${esc(optName(x.a))} <small>${esc(x.t.bp.name)}</small><button data-optwantx="${esc(k)}" aria-label="Remove ${esc(optName(x.a))}">✕</button></span>` : ""; }).join("");
  return `<section class="glass optcard"><div class="opthd"><div><b class="h2">Your choices</b><div class="sub">${nT || nC ? `${nT} to trade · ${nC} core${cfg.want.length ? ` · ${cfg.want.length} target${cfg.want.length > 1 ? "s" : ""}` : ""}` : "Untagged: the optimizer offers the pieces worth least to you for their price, and never your two best players."}</div></div>
      <button class="ghost" data-opttags="${lid}">${open ? "Done" : "Tag players"}</button></div>
    ${open ? `<div class="optrows">${mine.map(row).join("")}</div><div class="sub">Trade = the only pieces it offers. Core = never offered. Untagged pieces aren't offered once you tag any as Trade.</div>` : ""}
    <div class="optwant"><label class="lab" for="optq">Players you want</label><div class="picks">${wantChips}<input class="search" id="optq" type="search" placeholder="Search other rosters" value="${esc(OPT.q)}" autocomplete="off"></div>
      ${hits.length ? `<div class="optrows">${hits.map(x=>`<button class="optrow pick" data-optwant="${esc(x.a.k)}"><span class="t"><b>${esc(optName(x.a))}</b><small>${x.a.pos === "PICK" ? "Pick" : x.a.pos} · ${esc(x.t.bp.name)} · ${Math.round(x.a.v).toLocaleString()}</small></span><span class="sub">Add</span></button>`).join("")}</div>` : ""}</div></section>`;
}
function partnerHTML(L, p, i){
  const t = p.t, b = t.bp, key = L.lg.league_id + ":" + t.rid, k = OPT.open[key] || p.opts[0].kind, o = p.opts.find(x=>x.kind === k) || p.opts[0];
  const tot = Math.max(pmOf(o.give) + pmOf(o.get), 1), sv = pmOf(o.give), gv = pmOf(o.get);
  const verdict = Math.abs(o.gap) < .05 ? "Even on price" : o.gap > 0 ? `You win on price by ${Math.round(o.gap*100)}%` : `They win on price by ${Math.round(-o.gap*100)}%`;
  const row = (a, side) => { const s = signalOf(L, a); return `<div class="oasset"><span class="t">${esc(optName(a))}<small>${a.pos === "PICK" ? "pick" : `${a.pos}${a.age ? " · " + Math.floor(a.age) : ""}`}${s.trades ? ` · price backed by ${s.trades} trades` : ""}</small></span><span class="sig">${marketBits(L, a)}</span><i>${Math.round(a.v).toLocaleString()}</i></div>`; };
  const idle = optIdle(p), ev = o.ev, accC = o.acc >= .55 ? "hi" : o.acc >= .35 ? "md" : "lo";
  const pitch = optPitch(L, o), uid = a => a.pos === "PICK" ? "PK:" + a.k.slice(2) : a.id;
  const build = esc(JSON.stringify({lid:L.lg.league_id, rid:t.rid, give:o.give.map(a=>({uid:uid(a), id:a.id})), get:o.get.map(a=>({uid:uid(a), id:a.id}))}));
  const offer = esc(JSON.stringify({lid:L.lg.league_id, league:L.lg.name, partner:b.name, give:o.give.map(optName), get:o.get.map(optName), mode: optWeight(L, L.me) >= .5 ? "buy" : "sell"}));
  return `<article class="glass optp rise" style="animation-delay:${Math.min(i, 6)*.05}s">
    <div class="opthd"><div><b class="h2">${esc(b.name)}${idle ? `<span class="oidle" title="Inactive: ${esc(idle)}" aria-label="Inactive: ${esc(idle)}">zZ</span>` : ""}</b><div class="sub">${esc(b.rec)} · ${esc(DIR[t.dir].short)} · ${pct(t.odds.po)} playoff odds</div></div><span class="acc ${accC}" title="Chance they accept">${pct(o.acc)} accept</span></div>
    ${p.opts.length > 1 ? `<div class="optkinds" role="tablist">${p.opts.map(x=>`<button role="tab" data-optkind="${key}|${x.kind}" aria-selected="${x.kind === o.kind}">${OPT_KIND[x.kind]}</button>`).join("")}</div>` : `<div class="optkinds one"><span>${OPT_KIND[o.kind]}</span></div>`}
    <div class="otrade"><div class="oside"><span class="lab">You send</span>${o.give.map(a=>row(a, "give")).join("")}${o.drop ? `<div class="sub">+ drop ${esc(optName(o.drop))}</div>` : ""}</div>
      <div class="oside"><span class="lab">You get</span>${o.get.map(a=>row(a, "get")).join("")}</div></div>
    <div class="tbar"><div class="tb"><i style="width:${sv/tot*100}%"></i><b style="width:${gv/tot*100}%"></b></div><div class="tv"><span>${Math.round(sv).toLocaleString()}</span><strong class="${Math.abs(o.gap) < .05 ? "even" : o.gap > 0 ? "good" : "bad"}">${verdict}</strong><span>${Math.round(gv).toLocaleString()}</span></div>
      <div class="tctx">Closer to even than ${Math.round(fairerThan(Math.abs(o.gap))*100)}% of real trades${Math.abs(o.sig) >= .03 ? ` · market signal ${o.sig > 0 ? "in your favor" : "against you"} (${o.sig > 0 ? "+" : ""}${Math.round(o.sig*100)}%)` : ""}</div></div>
    <div class="owhy"><div><span class="lab">For you</span><ul>${whyYou(L, o).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>
      <div><span class="lab">For ${esc(b.name)}</span><ul>${whyThem(L, o).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div></div>
    <div class="cfoot" style="padding:0"><button class="primary" data-edbuild="${build}">Open in trade builder</button><button class="ghost" data-copy="${esc(pitch)}" data-offer="${offer}">Copy message</button></div>
  </article>`;
}

/* ---------- events ---------- */
document.addEventListener("click", e=>{
  const el = e.target.closest("[data-optmode],[data-optlg],[data-optrun],[data-opttag],[data-opttags],[data-optwant],[data-optwantx],[data-optkind],[data-optdir]"); if(!el) return;
  const d = el.dataset;
  if(d.optmode){ store.set("optMode", d.optmode); OPT.q = ""; render(); return; }
  if(d.optlg){ OPT.lid = d.optlg; OPT.q = ""; render(); return; }
  if(d.optrun){ const lids = d.optrun === "all" ? optLeagues().filter(L=>leagueOpen(L).ok).map(L=>L.lg.league_id) : [OPT.lid]; optRun(lids); return; }
  if(d.opttags){ OPT.tagLg = OPT.tagLg === d.opttags ? null : d.opttags; render(); return; }
  if(d.opttag != null){ const i = d.opttag.lastIndexOf("|"), k = d.opttag.slice(0, i), v = d.opttag.slice(i + 1), c = optCfg(OPT.lid);
    c.trade = c.trade.filter(x=>x !== k); c.core = c.core.filter(x=>x !== k); if(v) c[v].push(k); optSave(OPT.lid, c); render(); return; }
  if(d.optwant){ const c = optCfg(OPT.lid); if(!c.want.includes(d.optwant)) c.want.push(d.optwant); OPT.q = ""; optSave(OPT.lid, c); render(); return; }
  if(d.optwantx){ const c = optCfg(OPT.lid); c.want = c.want.filter(x=>x !== d.optwantx); optSave(OPT.lid, c); render(); return; }
  if(d.optkind){ const i = d.optkind.lastIndexOf("|"); OPT.open[d.optkind.slice(0, i)] = d.optkind.slice(i + 1); render(); return; }
  if(d.optdir != null){ store.set("dir:" + OPT.lid, d.optdir || null); delete OPT.res[OPT.lid]; render(); return; }
});
document.addEventListener("input", e=>{ if(e.target.id === "optq"){ OPT.q = e.target.value; render(); } });

/* ---------- entry points: menu, rail, home tools ---------- */
{ const g = CC_TOOLS.find(x=>x[0] === "Trades"); if(g && !g[1].some(x=>x[0] === "optimizer")) g[1].unshift(["optimizer","Trade Optimizer","trades","#4BE3A0",{go:"optimizer"}, 1]); }
if(!TOOL_ORDER.includes("optimizer")) TOOL_ORDER.splice(TOOL_ORDER.indexOf("trades") + 1, 0, "optimizer");
{ const _ts = toolStatus; toolStatus = function(id){ return id === "optimizer" ? {t:"Best offers in every league"} : _ts(id); }; }
// fresh data from Sleeper invalidates the results
{ const _ra = typeof runAnalysis === "function" ? runAnalysis : null; if(_ra){ runAnalysis = function(){ OPT.res = {}; return _ra.apply(this, arguments); }; } }

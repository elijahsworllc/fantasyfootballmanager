
/* =====================================================================
   The crystal ball's three tools, each built for its own job:
   Start/Sit = this week, head to head · Trade = side 1 vs side 2, built from real rosters · Compare = long-term profiles
   ===================================================================== */

/* ---------- verifiable context: game logs, defense vs position, venue, kickoff weather ---------- */
const CTX = {logs:{}, def:null, defP:null, wx:{}};
const headshot = (pid, cls="head") => { const ini = isNaN(+pid) ? String(pid) : pname(pid).split(/\s+/).map(w=>w[0]).join("").slice(0,2);
  const src = isNaN(+pid) ? `https://sleepercdn.com/images/team_logos/nfl/${String(pid).toLowerCase()}.png` : `https://sleepercdn.com/content/nfl/players/thumb/${pid}.jpg`;
  return `<span class="hs ${cls}" data-i="${esc(ini)}" aria-hidden="true"><img src="${src}" alt="" loading="lazy" onerror="this.remove()"></span>`; };
function loadLog(pid){
  if(!pid || isNaN(+pid) || CTX.logs[pid]) return CTX.logs[pid] && CTX.logs[pid].p;
  const e = CTX.logs[pid] = {};
  e.p = getJSON(`/stats/nfl/player/${pid}?season_type=regular&season=${S.season}&grouping=week`, {cache:"network"}).catch(()=>getJSON(`/stats/nfl/player/${pid}?season_type=regular&season=${S.season}&grouping=week`, {cache:"only"}))
    .then(o=>{ e.weeks = Object.entries(o || {}).filter(([w,v])=>v && v.stats && (v.stats.gp || v.stats.pts_ppr != null) && +w < S.nflWeek + (S.week > S.nflWeek ? 1 : 0))
      .map(([w,v])=>({w:+w, opp:v.opponent, away:v.is_away_team, s:v.stats})).sort((a,b)=>a.w-b.w); })
    .catch(()=>{ e.err = true; });
  return e.p;
}
function logSummary(pid){
  const e = CTX.logs[pid]; if(!e || !e.weeks) return null;
  const g = e.weeks.filter(x=>x.s.gp || x.s.pts_ppr), pts = g.map(x=>x.s.pts_ppr || 0);
  if(!g.length) return {games:0, weeks:e.weeks};
  const avg = a => a.reduce((s,v)=>s+v,0)/a.length;
  return {games:g.length, avg:avg(pts), last3:avg(pts.slice(-3)), best:Math.max(...pts), weeks:e.weeks,
    tgt: avg(g.map(x=>x.s.rec_tgt||0)), car: avg(g.map(x=>x.s.rush_att||0)), snp: g.some(x=>x.s.off_snp && x.s.tm_off_snp) ? avg(g.filter(x=>x.s.tm_off_snp).map(x=>x.s.off_snp/x.s.tm_off_snp)) : null};
}
// PPR points each defense has allowed per game to each position, from Sleeper's weekly stats (completed weeks only)
function loadDef(){
  if(CTX.defP) return CTX.defP;
  const last = (S.nflWeek || 1) - 1;
  CTX.defP = (async()=>{
    if(last < 1){ CTX.def = {weeks:0}; return; }
    const pos = ["QB","RB","WR","TE"].map(p=>"position%5B%5D="+p).join("&");
    const weeks = await Promise.all(Array.from({length:last}, (_,i)=>getJSON(`/stats/nfl/${S.season}/${i+1}?season_type=regular&${pos}`, {cache:"prefer"}).catch(()=>null)));
    const allowed = {}, games = {};
    weeks.forEach((rows, wi)=>{ if(!Array.isArray(rows)) return;
      for(const r of rows){ const opp = r.opponent, p = (r.player && r.player.position) || (S.proj[r.player_id] && S.proj[r.player_id].player || {}).position, v = r.stats && r.stats.pts_ppr;
        if(!opp || !p || v == null) continue; ((allowed[opp] ||= {})[p] = ((allowed[opp]||{})[p] || 0) + v); (games[opp] ||= new Set()).add(wi); } });
    const per = {}, rank = {};
    for(const t in allowed){ per[t] = {}; for(const p in allowed[t]) per[t][p] = allowed[t][p] / games[t].size; }
    for(const p of ["QB","RB","WR","TE"]){ const order = Object.keys(per).filter(t=>per[t][p] != null).sort((a,b)=>per[b][p]-per[a][p]); order.forEach((t,i)=>{ (rank[t] ||= {})[p] = i+1; }); }
    CTX.def = {per, rank, weeks: weeks.filter(Array.isArray).length, teams: Object.keys(per).length};
  })().catch(()=>{ CTX.def = {weeks:0}; });
  return CTX.defP;
}
const STADIUM = {ARI:[33.5276,-112.2626],ATL:[33.7554,-84.4009],BAL:[39.2780,-76.6227],BUF:[42.7738,-78.7870],CAR:[35.2258,-80.8528],CHI:[41.8623,-87.6167],CIN:[39.0955,-84.5161],CLE:[41.5061,-81.6995],
  DAL:[32.7473,-97.0945],DEN:[39.7439,-105.0201],DET:[42.3400,-83.0456],GB:[44.5013,-88.0622],HOU:[29.6847,-95.4107],IND:[39.7601,-86.1639],JAX:[30.3239,-81.6373],KC:[39.0489,-94.4839],LV:[36.0909,-115.1833],
  LAC:[33.9535,-118.3392],LAR:[33.9535,-118.3392],MIA:[25.9580,-80.2389],MIN:[44.9737,-93.2581],NE:[42.0909,-71.2643],NO:[29.9511,-90.0812],NYG:[40.8135,-74.0745],NYJ:[40.8135,-74.0745],PHI:[39.9008,-75.1675],
  PIT:[40.4468,-80.0158],SF:[37.4030,-121.9700],SEA:[47.5952,-122.3316],TB:[27.9759,-82.5033],TEN:[36.1665,-86.7713],WAS:[38.9078,-76.8645]};
const CITY = {"London":[51.5560,-0.2796],"Tottenham":[51.6043,-0.0664],"Frankfurt":[50.0686,8.6455],"Munich":[48.2188,11.6247],"Berlin":[52.5147,13.2395],"Madrid":[40.4531,-3.6883],"Saint-Denis":[48.9245,2.3602],"Paris":[48.9245,2.3602],
  "Dublin":[53.3352,-6.2286],"Mexico City":[19.3029,-99.1505],"São Paulo":[-23.5453,-46.4742],"Sao Paulo":[-23.5453,-46.4742],"Melbourne":[-37.8200,144.9834],"Rio de Janeiro":[-22.9122,-43.2302]};
function gameOf(team){ const k = kickoff(team); return k && !k.approx ? k : null; }
function loadWx(team){
  const g = gameOf(team); if(!g || g.indoor) return null;
  const key = g.short; if(CTX.wx[key]) return CTX.wx[key].p;
  const ll = (g.intl && (CITY[g.city] || CITY[g.vcity])) || STADIUM[g.home]; if(!ll) return null;
  if(g.ts - Date.now() > 15*864e5 || g.ts < Date.now() - 6*3.6e6) return null;   // forecasts reach about 16 days out
  const e = CTX.wx[key] = {}, day = new Date(g.ts).toISOString().slice(0,10);
  e.p = getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${ll[0]}&longitude=${ll[1]}&hourly=temperature_2m,precipitation_probability,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC&start_date=${day}&end_date=${day}`, {cache:"network"})
    .then(j=>{ const h = j.hourly, i = new Date(g.ts).getUTCHours(); if(!h || h.time[i] == null) return;
      e.v = {temp: Math.round(h.temperature_2m[i]), rain: h.precipitation_probability[i], wind: Math.round(h.wind_speed_10m[i])}; })
    .catch(()=>{ e.err = true; });
  return e.p;
}
function venueText(team){
  const g = gameOf(team); if(!g) return null;
  if(g.indoor) return {text:"Indoors", bad:false};
  const w = CTX.wx[g.short] && CTX.wx[g.short].v;
  if(!w) return {text:"Outdoors", bad:false};
  const bad = w.wind >= 15 || w.rain >= 50;
  return {text:`Outdoors · ${w.temp}°F · wind ${w.wind} mph · ${w.rain}% rain`, bad, w};
}
function oppText(f){
  if(!f || !f.game) return f && f.reason ? f.reason : "—";
  const opp = f.game.opp || ""; return opp.startsWith("@") ? `at ${opp.slice(1)}` : `vs ${opp}`;
}
function defRank(f){
  if(!f || !f.game || !CTX.def || !CTX.def.rank) return null;
  const opp = (f.game.opp || "").replace("@",""), r = CTX.def.rank[opp], p = CTX.def.per[opp];
  if(!r || r[f.pos] == null) return null;
  return {rank: r[f.pos], per: p[f.pos], n: CTX.def.teams, opp};
}

/* ---------- shared bits ---------- */
const TOOL = {mode:"start", sub:"matchup"};
const TR = {lid:null, partner:null, give:[], get:[], side:"give", q:"", pos:"ALL", answer:null, busy:false};
function playerSearch(id, val, ph){ return `<input class="search" id="${id}" type="search" placeholder="${ph}" value="${esc(val)}" autocomplete="off">`; }
function optionRows(list, side){
  return list.map(o=>`<button class="prow-btn" data-add="${side}:${esc(o.id)}">${headshot(o.id, "mini")}<span class="t"><b>${esc(o.name)}</b><small>${esc(o.sub)}</small></span><span class="v">${esc(o.right || "")}</span></button>`).join("") || `<p class="note" style="margin:6px 2px">No matches.</p>`;
}
function startOptions(){
  const x = cbLg(), q = (CB.qa||"").trim().toLowerCase(), chosen = new Set(CB.a.map(o=>o.id));
  let ids = x ? (x.mine.players||[]).filter(p=>!(x.mine.taxi||[]).includes(p) && !(x.mine.reserve||[]).includes(p)) : [...new Set(cbLeagues().flatMap(y=>y.mine.players||[]))];
  if(q.length >= 2) ids = [...new Set(ids.concat(nameIndex().filter(p=>p.full.includes(q)).map(p=>p.id)))];
  return ids.filter(id=>!chosen.has(id)).map(id=>{ const f = weekInfo(id, x); return {id, name:pname(id), sub:pmeta(id) + (f.status ? " · " + f.status : f.reason ? " · " + f.reason : ""), right: fmt(f.eff), sort:f.eff}; })
    .filter(o=>!q || o.name.toLowerCase().includes(q) || o.sub.toLowerCase().includes(q)).sort((a,b)=>b.sort-a.sort).slice(0, q ? 12 : 8);
}

/* ---------- Start / Sit: head to head for this week ---------- */
function startSitHTML(){
  const x = cbLg(), lgs = cbLeagues(), [A, B] = CB.a;
  let h = `<div class="cbbox"><label for="cbLeague">Scoring</label><select id="cbLeague"><option value="all" ${CB.league==="all"?"selected":""}>All my leagues (PPR)</option>${lgs.map(y=>`<option value="${y.lg.league_id}" ${CB.league===y.lg.league_id?"selected":""}>${esc(y.lg.name)}</option>`).join("")}</select></div>`;
  // slots: two seats, side by side
  const seat = (o, i) => o ? `<button class="seat on" data-rm="a:${esc(o.id)}" aria-label="Remove ${esc(o.name)}">${headshot(o.id,"head")}<b>${esc(o.name)}</b><small>${esc(pmeta(o.id))}</small><span class="x">✕</span></button>`
    : `<button class="seat" data-focus="cbqa"><span class="plus">+</span><b>Player ${i+1}</b><small>Pick from your rosters</small></button>`;
  h += `<div class="seats">${seat(A,0)}<span class="vsb">VS</span>${seat(B,1)}</div>`;
  if(CB.a.length < 2) return h + `<div class="cbbox">${playerSearch("cbqa", CB.qa, "Search a player")}<div class="plist2">${optionRows(startOptions(), "a")}</div></div>`;
  // the comparison
  const fa = weekInfo(A.id, x), fb = weekInfo(B.id, x);
  const ra = rankStart([A.id, B.id], x), win = ra.w.id === A.id ? 0 : 1, gap = Math.abs(fa.eff - fb.eff);
  const la = logSummary(A.id), lb = logSummary(B.id), da = defRank(fa), db = defRank(fb), va = venueText(fa.team), vb = venueText(fb.team);
  const ka = kickoff(fa.team), kb = kickoff(fb.team);
  const row = (label, a, b, better, note) => `<div class="crow"><span class="l${better===0?" w":""}">${a}</span><span class="k">${label}</span><span class="r${better===1?" w":""}">${b}</span></div>`;
  const cmp = (a, b, hi=true, min=0) => a == null || b == null || Math.abs(a-b) <= min ? null : (a > b) === hi ? 0 : 1;
  let rows = row("Projected pts", fmt(fa.eff), fmt(fb.eff), cmp(fa.eff, fb.eff, true, .05))
    + row("Status", ...[fa, fb].map(f=>f.status ? `<span class="st${f.status==="Questionable"?" q":""}">${esc(f.status)}</span>` : f.reason ? `<span class="st">${esc(f.reason)}</span>` : "Healthy"), null)
    + row("My rank", rankBadge(A.id), rankBadge(B.id), null)
    + row("Opponent", esc(oppText(fa)), esc(oppText(fb)), null)
    + row(`Opp allows to pos`, da ? `${da.per.toFixed(1)} <small>${ord(da.rank)} most</small>` : "—", db ? `${db.per.toFixed(1)} <small>${ord(db.rank)} most</small>` : "—", da && db && fa.pos === fb.pos ? cmp(da.rank, db.rank, false, 5) : da && db ? cmp(da.rank/da.n, db.rank/db.n, false, .15) : null)
    + row("Kickoff", ka ? esc(kickLabel(ka)) + (ka.intl ? ` <span class="intl">${esc(ka.city||"")}</span>` : "") : "—", kb ? esc(kickLabel(kb)) + (kb.intl ? ` <span class="intl">${esc(kb.city||"")}</span>` : "") : "—", null)
    + row("Venue", va ? esc(va.text) : "—", vb ? esc(vb.text) : "—", va && vb && va.bad !== vb.bad ? (va.bad ? 1 : 0) : null)
    + row("Season PPR/g", la && la.games ? fmt(la.avg) : "—", lb && lb.games ? fmt(lb.avg) : "—", la && lb && la.games && lb.games ? cmp(la.avg, lb.avg, true, .5) : null)
    + row("Last 3 PPR/g", la && la.games ? fmt(la.last3) : "—", lb && lb.games ? fmt(lb.last3) : "—", la && lb && la.games && lb.games ? cmp(la.last3, lb.last3, true, .5) : null)
    + row("Usage/g", la && la.games ? `${la.tgt.toFixed(1)} tgt · ${la.car.toFixed(1)} car` : esc(usage(A.id) || "—"), lb && lb.games ? `${lb.tgt.toFixed(1)} tgt · ${lb.car.toFixed(1)} car` : esc(usage(B.id) || "—"), null)
    + (la && lb && la.snp != null && lb.snp != null ? row("Snap share", pct(la.snp), pct(lb.snp), cmp(la.snp, lb.snp, true, .03)) : "");
  // what actually separates them: only facts that clear a threshold
  const diffs = [], N = [A.name, B.name];
  if(gap >= .5) diffs.push(`${N[win]} is projected ${fmt(gap)} pts higher${x ? " in this league's scoring" : " (PPR)"}.`);
  if(da && db && Math.abs(da.rank - db.rank) >= 8) { const e = da.rank < db.rank ? 0 : 1, d = e ? db : da, o = e ? da : db; diffs.push(`${N[e]} has the softer matchup: ${d.opp} allows ${d.per.toFixed(1)} PPR/g to ${(e?fb:fa).pos}s (${ord(d.rank)} most) vs ${o.per.toFixed(1)} (${ord(o.rank)}).`); }
  [[fa,va,0],[fb,vb,1]].forEach(([f,v,i])=>{ if(v && v.bad && ["QB","WR","TE","K"].includes(f.pos)) diffs.push(`${N[i]} plays outdoors in ${v.w.wind >= 15 ? `${v.w.wind} mph wind` : ""}${v.w.wind >= 15 && v.w.rain >= 50 ? " and " : ""}${v.w.rain >= 50 ? `a ${v.w.rain}% chance of rain` : ""} at kickoff (Open-Meteo forecast).`); });
  [[fa,0],[fb,1]].forEach(([f,i])=>{ if(f.status && f.status !== "Healthy") diffs.push(`${N[i]} is listed ${f.status} on Sleeper.`); });
  if(la && lb && la.games >= 3 && lb.games >= 3){ [[la,0],[lb,1]].forEach(([l,i])=>{ if(l.last3 - l.avg >= 4) diffs.push(`${N[i]} is trending up: ${fmt(l.last3)} PPR/g over his last 3 vs ${fmt(l.avg)} on the season.`); if(l.avg - l.last3 >= 4) diffs.push(`${N[i]} is trending down: ${fmt(l.last3)} PPR/g over his last 3 vs ${fmt(l.avg)} on the season.`); }); }
  h += `<section class="h2h glass rise">
    <div class="h2hhead">${[A,B].map((o,i)=>`<div class="pc${win===i?" win":""}">${headshot(o.id,"big")}<b>${esc(o.name)}</b><small>${esc(pmeta(o.id))}</small></div>`).join(`<span class="vsb">VS</span>`)}</div>
    <div class="verdict"><span class="lab">The call</span><b>Start ${esc(N[win])}</b><span class="conf"><span class="meter"><i style="width:${Math.round(ra.p*100)}%"></i></span><span class="num">${Math.round(ra.p*100)}% model confidence</span></span></div>
    <div class="seg" role="tablist" style="--n:2;--i:${TOOL.sub==="logs"?1:0}"><button role="tab" data-sub="matchup" aria-selected="${TOOL.sub!=="logs"}">This week</button><button role="tab" data-sub="logs" aria-selected="${TOOL.sub==="logs"}">Game logs</button><i aria-hidden="true"></i></div>`;
  if(TOOL.sub === "logs"){
    const wa = (la && la.weeks) || [], wb = (lb && lb.weeks) || [], weeks = [...new Set(wa.map(z=>z.w).concat(wb.map(z=>z.w)))].sort((p,q)=>q-p);
    const cell = (l, w, f) => { const z = l.find(y=>y.w === w); if(!z) return `<td class="mut">—</td>`; if(!(z.s.gp || z.s.pts_ppr)) return `<td class="mut">DNP</td>`;
      const s = z.s, line = f.pos === "QB" ? `${Math.round(s.pass_yd||0)} py · ${s.pass_td||0} td` : f.pos === "RB" ? `${s.rush_att||0}-${Math.round(s.rush_yd||0)} · ${s.rec||0} rec` : `${s.rec||0}/${s.rec_tgt||0} · ${Math.round(s.rec_yd||0)} yd`;
      return `<td><b>${fmt(s.pts_ppr||0)}</b><small>${z.away?"@":"vs"} ${esc(z.opp||"")} · ${line}</small></td>`; };
    h += (!CTX.logs[A.id] || !CTX.logs[A.id].weeks || !CTX.logs[B.id] || !CTX.logs[B.id].weeks) && !(CTX.logs[A.id]||{}).err ? `<div class="statusline"><span class="livedot" style="background:var(--violet)"></span>Loading game logs…</div>`
      : weeks.length ? `<div class="lineup" style="margin:0"><table class="logs"><thead><tr><th>Wk</th><th>${esc(A.name.split(" ").slice(-1)[0])}</th><th>${esc(B.name.split(" ").slice(-1)[0])}</th></tr></thead><tbody>${weeks.map(w=>`<tr><td class="slot">${w}</td>${cell(wa,w,fa)}${cell(wb,w,fb)}</tr>`).join("")}</tbody></table></div>` : `<div class="empty">No games logged yet this season.</div>`;
    h += `<p class="src">PPR points and box scores from Sleeper's weekly stats.</p></section>`;
    return h;
  }
  h += `<div class="crows">${rows}</div>`;
  if(diffs.length) h += `<div class="diffs"><span class="lab">What separates them</span><ul>${diffs.slice(0,4).map(d=>`<li>${esc(d)}</li>`).join("")}</ul></div>`;
  if(!x){
    const shared = cbLeagues().filter(y=>[A.id,B.id].every(id=>(y.mine.players||[]).includes(id)));
    if(shared.length){ const per = shared.map(y=>{ const rr = rankStart([A.id,B.id], y); return {y, pick:rr.w.id, p:rr.p, gap:Math.abs(rr.w.f.eff - rr.s.f.eff)}; });
      h += `<div class="lineup" style="margin:0"><table class="mini"><thead><tr><th>Your league</th><th>Start</th><th>Margin</th></tr></thead><tbody>${per.map(z=>`<tr${z.pick!==ra.w.id?' class="me"':""}><td>${esc(z.y.lg.name)}</td><td>${esc(pname(z.pick).split(" ").slice(-1)[0])}</td><td class="num">+${fmt(z.gap)}</td></tr>`).join("")}</tbody></table></div>`;
      if(per.some(z=>z.pick !== ra.w.id)) h += `<p class="note" style="margin:0">Highlighted leagues flip the call because of their scoring settings.</p>`; }
  }
  h += `<p class="src">Projections: Sleeper (Rotowire)${x ? ", rescored with this league's settings" : ", PPR"}; Questionable counts at 85%, Doubtful at 20%. Matchups: PPR points allowed per game through week ${CTX.def && CTX.def.weeks || "—"}, Sleeper stats. Kickoff and roof: ESPN. Weather: Open-Meteo forecast for the stadium at kickoff. Model confidence assumes each projection can miss by about 45%.</p></section>`;
  return h;
}

/* ---------- Trade: side 1 vs side 2, built from the real rosters in one league ---------- */
async function trEnsure(){
  if(!TR.lid) return;
  while(S.bpLoading) await sleep(200);
  if(!S.bp) await loadBlueprints();
  const b = (S.bp||[]).find(z=>z.lg.league_id === TR.lid); if(!b) return;
  if(!TR.fc || TR.fcFor !== TR.lid){ TR.fc = await fcValues(fcKey(b.lg)); TR.fcFor = TR.lid; renderCB(); }
}
function trBp(){ return (S.bp||[]).find(z=>z.lg.league_id === TR.lid) || null; }
function trAssets(team){
  const fc = TR.fc; if(!team || !fc) return [];
  const pl = (team.roster.players || []).map(id=>{ const v = fc.players[id] || {}; return {id, name:pname(id), pos:(S.proj[id] && S.proj[id].player || {}).position || v.pos || "?", age:v.age, v:v.v || 0}; });
  const picks = team.picks.filter(p=>p.round <= 4).map(p=>{ const n = pickName(p, fc); return {id:"PICK:"+(n||pickLabel(p)), name:pickLabel(p) + (p.mine ? "" : " (via trade)"), pos:"PICK", v:p.val, pk:true}; });
  return pl.concat(picks).sort((a,b)=>b.v-a.v);
}
function tradeValue(list){ return pmOf(list.map(a=>({v:Math.max(a.v||0, 0)}))); }
function tradeHTML(){
  const lgs = cbLeagues();
  if(!TR.lid && lgs.length) TR.lid = (lgs.find(y=>y.lg.settings && y.lg.settings.type === 2) || lgs[0]).lg.league_id;
  const b = trBp();
  let h = `<div class="cbbox"><label for="trLeague">League</label><select id="trLeague">${lgs.map(y=>`<option value="${y.lg.league_id}" ${TR.lid===y.lg.league_id?"selected":""}>${esc(y.lg.name)}</option>`).join("")}</select></div>`;
  if(!b || !TR.fc){ if(TR.lid) setTimeout(trEnsure, 0); return h + `<div class="statusline"><span class="livedot" style="background:var(--violet)"></span>Loading rosters and values for this league…</div>`; }
  const me = b.me, partner = TR.partner != null ? b.teams.find(t=>t.rid === TR.partner) : null;
  h += `<div class="lab" style="margin-top:2px">Trading with</div><div class="chips partners">${b.teams.filter(t=>t.rid !== me.rid).map(t=>`<button class="chip${TR.partner===t.rid?" sel":""}" data-partner="${t.rid}" aria-pressed="${TR.partner===t.rid}">${esc(t.name)} <small>${t.rec} · ${ARCH[t.arch].short}</small></button>`).join("")}</div>`;
  if(!partner) return h + `<div class="empty">Pick who you're trading with. Their roster and picks load as side 2.</div>`;
  const sv = tradeValue(TR.give), gv = tradeValue(TR.get), tot = Math.max(sv + gv, 1), diff = (gv - sv)/Math.max(sv, gv, 1);
  const verdict = !TR.give.length || !TR.get.length ? "Add players to both sides" : Math.abs(diff) < .05 ? "Even trade" : diff > 0 ? `You win by ${Math.round(diff*100)}%` : `You overpay by ${Math.round(-diff*100)}%`;
  const side = (key, title, team) => { const list = TR[key];
    return `<button class="tside${TR.side===key?" act":""}" data-tside="${key}"><span class="lab">${title}</span><span class="tn">${esc(team.name)}</span>
      ${list.length ? list.map(a=>`<span class="tchip" data-trrm="${key}:${esc(a.id)}">${a.pk ? "" : headshot(a.id,"mini")}<span>${esc(a.name)}</span><i>${Math.round(a.v).toLocaleString()}</i></span>`).join("") : `<span class="hint">Tap to add from their roster</span>`}
      <span class="tsum">${Math.round(TR[key].reduce((s,a)=>s+a.v,0)).toLocaleString()}</span></button>`; };
  h += `<div class="tsides">${side("give","You send", me)}${side("get","You get", partner)}</div>
    <div class="tbar"><div class="tb"><i style="width:${sv/tot*100}%"></i><b style="width:${gv/tot*100}%"></b></div><div class="tv"><span>${Math.round(sv).toLocaleString()}</span><strong class="${!TR.give.length||!TR.get.length?"":Math.abs(diff)<.05?"even":diff>0?"good":"bad"}">${verdict}</strong><span>${Math.round(gv).toLocaleString()}</span></div></div>`;
  // roster picker for the active side
  const team = TR.side === "give" ? me : partner, chosen = new Set(TR[TR.side].map(a=>a.id)), q = TR.q.trim().toLowerCase();
  let assets = trAssets(team).filter(a=>!chosen.has(a.id));
  if(TR.pos !== "ALL") assets = assets.filter(a=>TR.pos === "PICK" ? a.pk : a.pos === TR.pos);
  if(q) assets = assets.filter(a=>a.name.toLowerCase().includes(q));
  h += `<section class="picker glass"><div class="sec"><b class="h2" style="font-size:16px">${TR.side === "give" ? "Your roster" : esc(partner.name) + "'s roster"}</b><span class="sub">tap to add</span></div>
    <div class="chips">${["ALL","QB","RB","WR","TE","PICK"].map(p=>`<button class="chip" data-trpos="${p}" aria-pressed="${TR.pos===p}">${p === "PICK" ? "Picks" : p === "ALL" ? "All" : p}</button>`).join("")}</div>
    ${playerSearch("trq", TR.q, "Search this roster")}
    <div class="plist2">${assets.slice(0, 40).map(a=>`<button class="prow-btn" data-tradd="${esc(a.id)}">${a.pk ? `<span class="mini pk">PK</span>` : headshot(a.id,"mini")}<span class="t"><b>${esc(a.name)}</b><small>${a.pk ? "Draft pick" : `${a.pos}${a.age ? " · " + Math.floor(a.age) : ""}`}</small></span><span class="v">${Math.round(a.v).toLocaleString()}</span></button>`).join("") || `<p class="note">Nothing left to add here.</p>`}</div></section>
    <button class="askbtn" id="trCheck" ${TR.give.length && TR.get.length && !TR.busy ? "" : "disabled"}>${TR.busy ? "Reading the league…" : "Run the full trade check"}</button>
    ${TR.answer ? answerHTML(TR.answer) : ""}
    <p class="src">Values: FantasyCalc dynasty values matched to this league's QB, size and PPR settings (built from real trades). The bar applies a stud premium so two halves don't equal a whole. The full check adds win-now and future rank changes and position grades for your roster.</p>`;
  return h;
}
async function trCheck(){
  if(TR.busy) return; TR.busy = true; TR.answer = null; ORB.mode = "think"; renderCB();
  const prev = {mode:CB.mode, league:CB.league, a:CB.a, b:CB.b};
  CB.mode = "trade"; CB.league = TR.lid; CB.a = TR.give.map(a=>({id:a.id, name:a.name.replace(" (via trade)","")})); CB.b = TR.get.map(a=>({id:a.id, name:a.name.replace(" (via trade)","")}));
  try{ TR.answer = await answerTrade(); }catch(e){ TR.answer = {q:"Trade check", v:"The ball is cloudy", conf:null, reasons:["Couldn't run the check: " + (e.message||e)], flip:null}; }
  Object.assign(CB, prev);
  if(!reduceMotion()){ await sleep(700); ORB.mode = "out"; await sleep(600); }
  TR.busy = false; renderCB(); setTimeout(()=>{ ORB.mode = "in"; }, 800);
  const a = document.querySelector(".answer"); if(a) a.scrollIntoView({behavior: reduceMotion() ? "auto" : "smooth", block:"start"});
}

/* ---------- Compare: two players over the long run ---------- */
function compareHTML(){
  const [A, B] = CB.a;
  const seat = (o, i) => o ? `<button class="seat on" data-rm="a:${esc(o.id)}">${headshot(o.id,"head")}<b>${esc(o.name)}</b><small>${esc(pmeta(o.id))}</small><span class="x">✕</span></button>`
    : `<button class="seat" data-focus="cbqa"><span class="plus">+</span><b>Player ${i+1}</b><small>Any NFL player</small></button>`;
  let h = `<div class="seats">${seat(A,0)}<span class="vsb">VS</span>${seat(B,1)}</div>`;
  if(CB.a.length < 2){
    const q = (CB.qa||"").trim().toLowerCase(), chosen = new Set(CB.a.map(o=>o.id));
    const list = (q.length >= 2 ? nameIndex().filter(p=>p.full.includes(q)) : nameIndex().filter(p=>p.mine).sort((a,b)=>b.pts-a.pts)).filter(p=>!chosen.has(p.id)).slice(0, 10)
      .map(p=>({id:p.id, name:pname(p.id), sub:pmeta(p.id) + (p.mine ? " · on your rosters" : ""), right:""}));
    return h + `<div class="cbbox">${playerSearch("cbqa", CB.qa, "Search any player")}<div class="plist2">${optionRows(list, "a")}</div></div>`;
  }
  const fc = S.fc["2|12|1"] && S.fc["2|12|1"].done;
  if(!fc){ fcValues("2|12|1").then(v=>{ S.fc["2|12|1"].done = v; renderCB(); }); return h + `<div class="statusline"><span class="livedot" style="background:var(--violet)"></span>Loading dynasty values…</div>`; }
  const P = [A, B].map(o=>{ const v = fc.players[o.id] || {}, l = logSummary(o.id), f = weekInfo(o.id, null), own = cbLeagues().filter(y=>(y.mine.players||[]).includes(o.id)).length; return {o, v, l, f, own}; });
  const row = (label, a, b, better) => `<div class="crow"><span class="l${better===0?" w":""}">${a}</span><span class="k">${label}</span><span class="r${better===1?" w":""}">${b}</span></div>`;
  const cmp = (a, b, hi=true) => a == null || b == null || a === b ? null : (a > b) === hi ? 0 : 1;
  const [a, b] = P, trend = z => z.v.trend ? ` <small class="${z.v.trend>0?"up":"dn"}">${z.v.trend>0?"+":""}${z.v.trend} 30d</small>` : "";
  let rows = row("Dynasty value", (a.v.v||0).toLocaleString() + trend(a), (b.v.v||0).toLocaleString() + trend(b), cmp(a.v.v||0, b.v.v||0))
    + row("Age", a.v.age ? a.v.age.toFixed(1) : "—", b.v.age ? b.v.age.toFixed(1) : "—", a.v.age && b.v.age ? cmp(a.v.age, b.v.age, false) : null)
    + row("Season PPR/g", a.l && a.l.games ? fmt(a.l.avg) : "—", b.l && b.l.games ? fmt(b.l.avg) : "—", a.l && b.l && a.l.games && b.l.games ? cmp(a.l.avg, b.l.avg) : null)
    + row("Last 3 PPR/g", a.l && a.l.games ? fmt(a.l.last3) : "—", b.l && b.l.games ? fmt(b.l.last3) : "—", a.l && b.l && a.l.games && b.l.games ? cmp(a.l.last3, b.l.last3) : null)
    + row("Best week", a.l && a.l.games ? fmt(a.l.best) : "—", b.l && b.l.games ? fmt(b.l.best) : "—", a.l && b.l && a.l.games && b.l.games ? cmp(a.l.best, b.l.best) : null)
    + row("Games played", a.l ? a.l.games : "—", b.l ? b.l.games : "—", null)
    + row("This week (PPR)", fmt(a.f.eff), fmt(b.f.eff), cmp(a.f.eff, b.f.eff))
    + row("On your teams", a.own, b.own, null)
    + row("My rank", rankBadge(A.id), rankBadge(B.id), null);
  // weekly points chart
  const W = 320, H = 120, pad = 14, weeks = [...new Set([].concat(...P.map(z=>(z.l && z.l.weeks || []).map(w=>w.w))))].sort((p,q)=>p-q);
  let chart = "";
  if(weeks.length >= 2){
    const max = Math.max(10, ...P.flatMap(z=>(z.l && z.l.weeks || []).map(w=>w.s.pts_ppr||0)));
    const X = w => pad + (weeks.indexOf(w))/(weeks.length-1)*(W-2*pad), Y = v => H - pad - v/max*(H-2*pad);
    const line = (z, col) => { const pts = (z.l && z.l.weeks || []).filter(w=>w.s.gp || w.s.pts_ppr); return `<polyline fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(w=>`${X(w.w).toFixed(1)},${Y(w.s.pts_ppr||0).toFixed(1)}`).join(" ")}"/>` + pts.map(w=>`<circle cx="${X(w.w).toFixed(1)}" cy="${Y(w.s.pts_ppr||0).toFixed(1)}" r="3" fill="${col}"><title>Week ${w.w}: ${fmt(w.s.pts_ppr||0)}</title></circle>`).join(""); };
    chart = `<figure class="wchart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly PPR points"><line x1="${pad}" x2="${W-pad}" y1="${H-pad}" y2="${H-pad}" stroke="rgba(170,190,255,.2)"/>${line(a,"#8FEAF5")}${line(b,"#C9B8FF")}${weeks.map(w=>`<text x="${X(w).toFixed(1)}" y="${H-1}" text-anchor="middle" font-size="9" fill="#6F7C8A">${w}</text>`).join("")}</svg>
      <figcaption><span><i style="background:#8FEAF5"></i>${esc(A.name)}</span><span><i style="background:#C9B8FF"></i>${esc(B.name)}</span><span class="sub">PPR points by week</span></figcaption></figure>`;
  } else if(!a.l || !b.l) chart = `<div class="statusline"><span class="livedot" style="background:var(--violet)"></span>Loading game logs…</div>`;
  const vw = (a.v.v||0) >= (b.v.v||0) ? 0 : 1, gap = Math.abs((a.v.v||0) - (b.v.v||0)) / Math.max(a.v.v||1, b.v.v||1), ww = a.f.eff >= b.f.eff ? 0 : 1;
  const N = [A.name, B.name];
  h += `<section class="h2h glass rise"><div class="h2hhead">${P.map((z,i)=>`<div class="pc${vw===i?" win":""}">${headshot(z.o.id,"big")}<b>${esc(z.o.name)}</b><small>${esc(pmeta(z.o.id))}</small></div>`).join(`<span class="vsb">VS</span>`)}</div>
    <div class="verdict"><span class="lab">Long term</span><b>${gap < .05 ? "Dead even" : esc(N[vw])}</b><span class="sub">${gap < .05 ? "Within 5% in dynasty value. Fit and age should decide." : `${Math.round(gap*100)}% more dynasty value.`} This week: ${esc(N[ww])} by ${fmt(Math.abs(a.f.eff - b.f.eff))} projected PPR.</span></div>
    ${chart}<div class="crows">${rows}</div>
    <p class="src">Dynasty values and 30-day trends: FantasyCalc (Superflex, 12 teams, PPR), built from real trades. Season stats: Sleeper. This week: Sleeper (Rotowire) PPR projection.</p></section>`;
  return h;
}

/* ---------- the hub ---------- */
const TOOLS = [["start","Start / Sit","This week, head to head"],["trade","Trade","Side 1 vs side 2"],["compare","Compare","Long-term profiles"]];
function renderCB(){
  const body = $("askBody"); if(!body) return;
  const ae = document.activeElement, fid = ae && ["cbqa","trq"].includes(ae.id) ? ae.id : null, caret = fid ? ae.selectionStart : null;
  const mode = TOOL.mode;
  let h = `<div class="tools" role="tablist">${TOOLS.map(([k,l,s])=>`<button role="tab" class="tool${mode===k?" on":""}" data-tool="${k}" aria-selected="${mode===k}"><b>${l}</b><small>${s}</small></button>`).join("")}</div>`;
  h += mode === "start" ? startSitHTML() : mode === "trade" ? tradeHTML() : compareHTML();
  body.innerHTML = h;
  if(fid && $(fid)){ const el = $(fid); el.focus({preventScroll:true}); try{ el.setSelectionRange(caret, caret); }catch(e){} }
  // pull in context for whoever is on screen
  if((mode === "start" || mode === "compare") && CB.a.length === 2){
    const ps = CB.a.map(o=>loadLog(o.id)), x = cbLg();
    const extra = mode === "start" ? [loadDef(), ...CB.a.map(o=>loadWx(weekInfo(o.id, x).team))] : [];
    const pending = ps.concat(extra).filter(p=>p && !p.done);
    if(pending.length && !TOOL.waiting){ TOOL.waiting = true; Promise.all(pending).then(()=>{ TOOL.waiting = false; renderCB(); }).catch(()=>{ TOOL.waiting = false; }); pending.forEach(p=>p.then(()=>{ p.done = true; }, ()=>{ p.done = true; })); }
  }
}
// picking the second player is the "ask": the ball thinks, dissolves, and the matchup appears
async function reveal(){
  if(reduceMotion()){ renderCB(); return; }
  S.thinking = true; ORB.mode = "think"; const l = $("orbline"); if(l) l.textContent = FOG_LINES[Math.floor(Math.random()*FOG_LINES.length)];
  const x = cbLg(), loads = CB.a.map(o=>loadLog(o.id)).concat(TOOL.mode === "start" ? [loadDef(), ...CB.a.map(o=>loadWx(weekInfo(o.id, x).team))] : []);
  await Promise.race([Promise.all(loads.filter(Boolean)).catch(()=>{}), sleep(2400)]);
  await sleep(500); ORB.mode = "out"; await sleep(600);
  S.thinking = false; renderCB(); const l2 = $("orbline"); if(l2) l2.textContent = "Tap a player to swap them out";
  const c = document.querySelector(".h2h"); if(c) c.scrollIntoView({behavior:"smooth", block:"start"});
  setTimeout(()=>{ if(!S.thinking) ORB.mode = "in"; }, 900);
}
function cbReady(){ return TOOL.mode === "trade" ? TR.give.length && TR.get.length : CB.a.length === 2; }
async function cbAsk(){ if(TOOL.mode === "trade") return trCheck(); if(CB.a.length === 2) return reveal(); }
function openTool(mode){ TOOL.mode = mode; CB.mode = mode; }
function cbPrefillTrade(d){
  TR.lid = d.lid; TR.give = []; TR.get = []; TR.answer = null; TR.partner = null; TOOL.mode = "trade";
  go("ask");
  trEnsure().then(()=>{
    const b = trBp(); if(!b){ renderCB(); return; }
    const findIn = (team, id) => trAssets(team).find(a=>a.id === id || (id.startsWith("PICK:") && a.id === id));
    const partner = b.teams.find(t=>t.rid !== b.me.rid && d.get.some(g=>findIn(t, g.id)));
    if(partner) TR.partner = partner.rid;
    TR.give = d.give.map(g=>findIn(b.me, g.id)).filter(Boolean);
    TR.get = partner ? d.get.map(g=>findIn(partner, g.id)).filter(Boolean) : [];
    TR.side = "get"; renderCB(); if(TR.give.length && TR.get.length) trCheck();
  });
}

/* ---------- events for the tools ---------- */
document.addEventListener("click", e=>{
  const el = e.target.closest("[data-tool],[data-sub],[data-partner],[data-tside],[data-trpos],[data-tradd],[data-trrm],[data-focus],#trCheck"); if(!el) return;
  const d = el.dataset;
  if(d.tool){ TOOL.mode = d.tool; CB.mode = d.tool === "trade" ? "trade" : d.tool; CB.a = []; CB.b = []; CB.qa = ""; TOOL.sub = "matchup"; renderCB(); return; }
  if(d.sub){ TOOL.sub = d.sub; renderCB(); return; }
  if(d.partner){ TR.partner = +d.partner; TR.get = []; TR.answer = null; TR.side = "get"; TR.pos = "ALL"; TR.q = ""; renderCB(); return; }
  if(d.trrm){ e.stopPropagation(); const i = d.trrm.indexOf(":"), k = d.trrm.slice(0,i), id = d.trrm.slice(i+1); TR[k] = TR[k].filter(a=>a.id !== id); TR.answer = null; renderCB(); return; }
  if(d.tside){ TR.side = d.tside; TR.pos = "ALL"; TR.q = ""; renderCB(); return; }
  if(d.trpos){ TR.pos = d.trpos; renderCB(); return; }
  if(d.tradd){ const b = trBp(), team = TR.side === "give" ? b.me : b.teams.find(t=>t.rid === TR.partner); const a = trAssets(team).find(z=>z.id === d.tradd); if(a){ TR[TR.side].push(a); TR.answer = null; } renderCB(); return; }
  if(d.focus){ const f = $(d.focus); if(f){ f.focus(); f.scrollIntoView({behavior:"smooth", block:"center"}); } return; }
  if(el.id === "trCheck"){ trCheck(); return; }
}, true);
// the generic handler adds players; for start/compare, the second pick triggers the reveal
document.addEventListener("click", e=>{ const el = e.target.closest("[data-add]"); if(!el) return; setTimeout(()=>{ if(TOOL.mode !== "trade" && CB.a.length === 2 && !S.thinking) reveal(); }, 0); });
document.addEventListener("input", e=>{ if(e.target.id === "trq"){ TR.q = e.target.value; renderCB(); } });
document.addEventListener("change", e=>{ if(e.target.id === "trLeague"){ TR.lid = e.target.value; TR.partner = null; TR.give = []; TR.get = []; TR.answer = null; TR.fc = null; renderCB(); trEnsure(); } });

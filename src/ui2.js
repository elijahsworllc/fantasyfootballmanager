
/* ---------- kickoff times: ESPN's public scoreboard (exact times, venue country); Sleeper dates as fallback ---------- */
const ESPN_FIX = {WSH:"WAS", JAC:"JAX", LA:"LAR"};
S.kick = {};
async function loadKick(){
  const wk = S.week, season = S.season; if(!wk || !season || S.kick[wk]) return;
  S.kick[wk] = {loading:true};
  try{
    const j = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${wk}`);
    const by = {}, games = [];
    for(const ev of j.events || []){
      const comp = ev.competitions && ev.competitions[0]; if(!comp) continue;
      const ts = Date.parse(ev.date), addr = (comp.venue && comp.venue.address) || {};
      const intl = !!(addr.country && addr.country !== "USA");
      const teams = (comp.competitors || []).map(c=>{ const a = c.team && c.team.abbreviation; return ESPN_FIX[a] || a; });
      const home = (comp.competitors || []).find(c=>c.homeAway === "home"), ha = home && home.team && home.team.abbreviation;
      const g = {ts, intl, city: intl ? (addr.city || addr.country) : null, vcity: addr.city || null, short: ev.shortName, teams, indoor: !!(comp.venue && comp.venue.indoor), home: ESPN_FIX[ha] || ha, venue: comp.venue && comp.venue.fullName};
      games.push(g); for(const t of teams) by[t] = g;
    }
    S.kick[wk] = {ok: games.length > 0, byTeam: by, games: games.sort((a,b)=>a.ts-b.ts)};
  }catch(e){ S.kick[wk] = {ok:false}; }
  render();
}
const ET = ts => new Date(new Date(ts).toLocaleString("en-US", {timeZone:"America/New_York"}));
// when a team's game locks this week; null on bye
function kickoff(team){
  if(!team) return null;
  const k = S.kick[S.week];
  if(k && k.ok && k.byTeam[team]) return k.byTeam[team];
  const g = S.sched[team]; if(!g || !g.date) return null;
  const d = new Date(g.date + "T12:00:00").getDay();   // dates only: Thursday night games kick at 8:15 PM ET, everything else assumed 1 PM ET
  return {ts: Date.parse(g.date + (d === 4 ? "T20:15:00-04:00" : "T13:00:00-04:00")), approx:true, intl:false};
}
function kickLabel(k){
  if(!k) return "Bye";
  const d = new Date(k.ts), day = d.toLocaleDateString([], {weekday:"short"});
  return k.approx ? day : `${day} ${d.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})}`;
}
const intlTag = k => k && k.intl ? ` <span class="intl">${esc(k.city || "Intl")}</span>` : "";
function untilText(ts){
  const m = Math.round((ts - Date.now())/6e4); if(m <= 0) return "locked";
  if(m < 60) return `locks in ${m}m`; const h = Math.floor(m/60); if(h < 24) return `locks in ${h}h ${m%60}m`;
  return `locks in ${Math.floor(h/24)}d ${h%24}h`;
}
// the moment a decision in this league stops being possible: the first lock among the players involved
function resDeadline(r, kind){
  const teams = [];
  const add = f => { if(f && !f.locked && f.team) teams.push(f.team); };
  if(kind === "monitor"){ (r.current||[]).forEach(p=>{ const f = r._c[p]; if(f && !f.locked && f.status === "Questionable") add(f); }); (r.roster && r.roster.reserve || []).forEach(p=>add(r._c[p])); }
  else if(kind === "startsit" && r.moves){ r.moves.ins.concat(r.moves.outs).forEach(add); }
  const ts = teams.map(t=>kickoff(t)).filter(Boolean).sort((a,b)=>a.ts-b.ts);
  return ts[0] || null;
}
// group anything by kickoff slot, soonest first
function bySlot(items){
  const slots = new Map();
  for(const it of items){ const k = it.k, key = k ? k.ts : 9e15; if(!slots.has(key)) slots.set(key, {k, items:[]}); slots.get(key).items.push(it); }
  return [...slots.entries()].sort((a,b)=>a[0]-b[0]).map(e=>e[1]);
}
const slotHead = (k, first) => `<div class="slot${first?" next":""}">${k ? esc(kickLabel(k)) + intlTag(k) + (k.approx ? "" : `<span style="font-family:var(--body);font-style:normal;font-weight:500;font-size:12px;letter-spacing:0;text-transform:none">${esc(untilText(k.ts))}</span>`) : "Bye week players"}</div>`;

/* ---------- next-kickoff bulletin: Thursday night on Wed/Thu, early Sunday (international) games inside 48 hours ---------- */
function bulletinHTML(){
  const K = S.kick[S.week]; if(!K || !K.ok) return "";
  const now = Date.now(), dow = ET(now).getDay();
  const isEarly = g => { const d = ET(g.ts), wd = d.getDay(); return wd === 4 || wd === 5 || wd === 6 || (wd === 0 && (g.intl || d.getHours() < 12)); };
  const next = K.games.filter(g=>g.ts > now && isEarly(g));
  if(!next.length) return "";
  const first = next[0], tnf = ET(first.ts).getDay() === 4;
  if(tnf ? ![3,4].includes(dow) : first.ts - now > 48*3.6e6) return "";
  const window = next.filter(g=>Math.abs(g.ts - first.ts) < 3.6e6), teams = new Set(window.flatMap(g=>g.teams));
  const rows = [], starters = new Set(); let startCount = 0;
  for(const r of S.results){
    if(!r.slots || r.sev === "off") continue;
    const id = r.league.league_id, info = p => p && p !== "0" ? (r._c[p] ||= pinfo(p, r.league)) : null;
    r.current.forEach(p=>{ const f = info(p); if(f && teams.has(f.team)){ startCount++; starters.add(id); } });
    // 1. starters in this game who can't play, or whose swap comes from this game
    const swap = {}; if(r.moves) r.moves.outs.forEach((o,i)=>{ if(o && r.moves.ins[i]) swap[o.pid] = r.moves.ins[i]; });
    r.current.forEach(p=>{ const f = info(p); if(!f || f.locked) return;
      const bad = !!f.reason || OUT_STATUSES.has(f.status) || f.status === "Doubtful", sub = swap[p];
      if(bad && (teams.has(f.team) || (sub && teams.has(sub.team)))) rows.push({id, r, sev:"crit", what: `${f.full} is ${statusLabel(f) === "Bye" ? "on bye" : statusLabel(f) === "Doubt" ? "Doubtful" : statusLabel(f)}`, how: sub ? `Start ${sub.full} (+${fmt(sub.eff - f.eff)} pts)` : "No healthy bench option: check waivers"});
      else if(f.status === "Questionable" && teams.has(f.team)) rows.push({id, r, sev:"warn", what: `${f.full} is Questionable`, how: "Decide before he locks at kickoff"});
    });
    // 2. better lineups that involve a player in this game
    if(r.moves && r.gain > 0) r.moves.ins.forEach((a,i)=>{ const b = r.moves.outs[i]; if(!a || !b) return;
      if((teams.has(a.team) || teams.has(b.team)) && !rows.some(x=>x.id === id && x.sev === "crit") && a.eff - b.eff >= 1) rows.push({id, r, sev:"up", what: `Start ${a.full} over ${b.full}`, how: `+${fmt(a.eff - b.eff)} projected pts in this league's scoring`}); });
  }
  const title = tnf ? "Thursday Night" : first.intl ? `${first.city || "International"} game` : `${ET(first.ts).toLocaleDateString("en-US", {weekday:"long"})} early game`;
  const games = window.map(g=>esc(g.short)).join(" · ");
  const order = {crit:0, warn:1, up:2};
  rows.sort((a,b)=>order[a.sev]-order[b.sev] || a.r.league.name.localeCompare(b.r.league.name));
  const head = `<div class="bh"><span class="t"><b>${esc(title)}</b><small>${games} · ${esc(kickLabel(first))}${first.intl ? " · " + esc(first.city || "") : ""} · you start ${startCount} player${startCount===1?"":"s"} here in ${starters.size} league${starters.size===1?"":"s"}</small></span><span class="cd">${esc(untilText(first.ts))}</span></div>`;
  if(!rows.length) return `<section class="bulletin calm">${head}<div class="sub">Every lineup with a player in this game is set. Nothing to do before kickoff.</div></section>`;
  return `<section class="bulletin">${head}${rows.slice(0, 8).map(x=>`<div class="brow"><span class="pill p-${x.sev}">${{crit:"Fix",warn:"Check",up:"Boost"}[x.sev]}</span><span class="t"><b>${esc(x.r.league.name)}</b><span>${esc(x.what)} · ${esc(x.how)}</span></span><a class="openbtn" href="${leagueLink(x.id)}" target="_blank" rel="noopener">Open ${ICON.ext}</a></div>`).join("")}
    ${rows.length > 8 ? `<button class="ghost tint" data-go="fix" data-tab="fix">See all ${rows.length}</button>` : ""}</section>`;
}

/* ---------- touch feedback: press in, spring back with a glow ring, and a light haptic tick ---------- */
const haptic = (()=>{ let lab = null; return ()=>{ try{
  if(navigator.vibrate){ navigator.vibrate(8); return; }
  if(!lab){ const i = document.createElement("input"); i.type = "checkbox"; i.setAttribute("switch", ""); i.id = "hapt"; i.tabIndex = -1; i.setAttribute("aria-hidden","true");
    i.style.cssText = "position:fixed;left:-200px;top:0;opacity:0;pointer-events:none";
    lab = document.createElement("label"); lab.htmlFor = "hapt"; lab.setAttribute("aria-hidden","true"); lab.style.cssText = "position:fixed;left:-200px;top:0;opacity:0;pointer-events:none";
    document.body.append(i, lab); }
  lab.click();   // iOS 18+ Safari plays a haptic when a switch toggles
}catch(e){} }; })();
const TAP_SEL = "button, a, summary, [data-go]";
let press = null;
document.addEventListener("pointerdown", e=>{
  const el = e.target.closest(TAP_SEL); if(!el || el.disabled || e.button > 0) return;
  press = {el, x:e.clientX, y:e.clientY, anim: reduceMotion() ? null : el.animate([{transform:"scale(1)"},{transform:"scale(.955)"}], {duration:140, easing:"ease-out", fill:"forwards"})};
}, {passive:true});
document.addEventListener("pointerup", e=>{
  const p = press; press = null; if(!p) return;
  if(p.anim) p.anim.cancel();
  if(Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) return;   // a scroll, not a tap
  haptic();
  if(reduceMotion()) return;
  p.el.animate([{transform:"scale(.955)"},{transform:"scale(1.035)", offset:.45},{transform:"scale(1)"}], {duration:460, easing:"cubic-bezier(.22,1,.36,1)"});
  const r = p.el.getBoundingClientRect(); if(!r.width) return;
  const d = document.createElement("div"); d.className = "tapring";
  Object.assign(d.style, {left:r.left+"px", top:r.top+"px", width:r.width+"px", height:r.height+"px", borderRadius:getComputedStyle(p.el).borderRadius});
  document.body.appendChild(d);
  d.animate([{boxShadow:"0 0 0 0 rgba(170,150,255,.55), inset 0 0 0 1px rgba(210,200,255,.7)", opacity:1},{boxShadow:"0 0 0 16px rgba(170,150,255,0), inset 0 0 0 1px rgba(210,200,255,0)", opacity:0}],
    {duration:560, easing:"cubic-bezier(.22,1,.36,1)"}).onfinish = ()=>d.remove();
}, {passive:true});
document.addEventListener("pointercancel", ()=>{ if(press && press.anim) press.anim.cancel(); press = null; });

/* ---------- warp: Connect pulls you into the crystal ball and out into the command center ---------- */
async function warpIn(){
  if(reduceMotion()){ loadAll(null); return; }
  const orb = $("orb"), wrap = document.querySelector(".orbwrap"), sec = document.querySelector(".connect");
  if(!orb || !wrap || !sec){ loadAll(null); return; }
  const r = orb.getBoundingClientRect();
  S.warping = true;
  SPACE.warpFrom = {x: r.left + r.width/2, y: r.top + r.height*.47};
  sec.classList.add("leaving");
  ORB.mode = "think"; ORB.boost = 1;
  const dx = innerWidth/2 - (r.left + r.width/2), dy = innerHeight/2 - (r.top + r.height*.47);
  wrap.animate([{transform:"none"},{transform:`translate(${dx*.25}px,${dy*.25}px) scale(1.12)`, offset:.3},{transform:`translate(${dx}px,${dy}px) scale(3.4)`}], {duration:1150, easing:"cubic-bezier(.65,0,.3,1)", fill:"forwards"});
  SPACE.warpTarget = 1;
  loadAll(null);                     // data starts loading while you fly in
  await sleep(1000);
  $("flash").animate([{opacity:0},{opacity:.95, offset:.35},{opacity:0}], {duration:520, easing:"ease-out"});
  await sleep(200);
  S.warping = false; S.arrive = true; ORB.boost = 0;
  render();
}

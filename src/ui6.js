/* =====================================================================
   V2.1 · one flow: pinned crystal ball, game plan rail, top-left menu,
   Diagnose / Trades / Offers screens, smarter asks, spin & shake
   ===================================================================== */
VIEWS.add("direction"); VIEWS.add("trades"); VIEWS.add("offers");

const NI = {
  home:`<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>`,
  diagnose:`<path d="M3 12h4l2.2-5.5 4.2 11 2.4-5.5H21"/>`,
  trades:`<path d="M5 8h12l-3-3"/><path d="M19 16H7l3 3"/>`,
  offers:`<path d="M21 3L3 10.4l7.2 2.6L13 20.5z"/><path d="M10.2 13L21 3"/>`,
  lineups:`<rect x="5" y="4.5" width="14" height="16.5" rx="2.5"/><path d="M9 4.5h6v3H9z"/><path d="M9 14l2.2 2.2L15.5 12"/>`,
  waivers:`<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>`,
  rankings:`<path d="M4 6h3M4 12h3M4 18h3"/><path d="M10 6h10M10 12h7M10 18h4"/>`,
  brief:`<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h7M9 17h5"/>`,
  start:`<path d="M7 5v14M17 5v14"/><path d="M3 12h4M17 12h4"/><path d="M10 9l2 3-2 3M14 9l-2 3 2 3"/>`,
  compare:`<path d="M4 18l5-6 4 3 7-9"/><path d="M4 13l5-2 4 1 7-5" opacity=".55"/>`,
  exposure:`<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.8-3.4 3.2-5.3 6-5.3s5.2 1.9 6 5.3"/><path d="M16 5a3 3 0 0 1 0 6M18 14.8c1.8.7 2.9 2.4 3.2 5"/>`,
  reviews:`<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>`,
  market:`<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/><path d="M11 8v6M9 9.5h3a1.2 1.2 0 0 1 0 2.4h-2a1.2 1.2 0 0 0 0 2.4h3"/>`,
  monitor:`<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`,
  swaps:`<path d="M7 17V7M4 10l3-3 3 3"/><path d="M17 7v10M14 14l3 3 3-3"/>`,
  team:`<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/>`,
  orb:`<circle cx="12" cy="10.5" r="6.5"/><path d="M7.5 20.5h9l-1.6-3.2H9.1z"/>`,
  refresh:`<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>`,
  user:`<circle cx="12" cy="8" r="3.6"/><path d="M5 20c1-3.8 3.8-5.8 7-5.8s6 2 7 5.8"/>`
};
const svgI = (k, s=20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NI[k]||""}</svg>`;

/* ---------- what locks next ---------- */
function lockMap(){
  if(S._lockAt === S.loadedAt && S._lockKick === !!(S.kick[S.week] && S.kick[S.week].ok) && S._lockDone === JSON.stringify(doneList())) return S._locks;
  const m = {};
  const put = (lid, k, kind) => { if(!k || k.ts <= Date.now()) return; const e = m[lid]; if(!e || k.ts < e.k.ts) m[lid] = {k, kind}; };
  for(const g of outGroups()) for(const x of g.rows) if(!isDone(x.r.league.league_id)) put(x.r.league.league_id, x.dl, "fix");
  for(const r of S.results){ if(r.sev === "off" || isDone(r.league.league_id)) continue;
    if(r.issues.some(x=>x.sev === "warn")) put(r.league.league_id, resDeadline(r, "monitor"), "monitor");
    if(r.moves && r.gain > 0) put(r.league.league_id, resDeadline(r, "startsit"), "startsit"); }
  S._locks = m; S._lockAt = S.loadedAt; S._lockKick = !!(S.kick[S.week] && S.kick[S.week].ok); S._lockDone = JSON.stringify(doneList());
  return m;
}
function doneList(){ return S.results.filter(r=>isDone(r.league.league_id)).map(r=>r.league.league_id); }
function nextLock(){
  const all = Object.values(lockMap()).sort((a,b)=>a.k.ts - b.k.ts);
  if(!all.length) return null;
  const first = all[0], same = all.filter(e=>e.k.ts - first.k.ts < 3.6e6);
  return {k:first.k, n:same.length, fix:same.filter(e=>e.kind === "fix").length, total:all.length};
}
const hoursTo = ts => (ts - Date.now())/3.6e6;

/* ---------- offers you've sent, tracked on this device ---------- */
const OFFERS = { all(){ return store.get("offers", []); }, save(a){ store.set("offers", a.slice(0, 120)); } };
function addOffer(o){
  const a = OFFERS.all(), key = o.lid + "|" + o.give.join("+") + ">" + o.get.join("+"), ex = a.find(z=>z.key === key);
  if(ex){ ex.ts = Date.now(); ex.status = "sent"; } else a.unshift({...o, key, ts: Date.now(), status: "sent"});
  OFFERS.save(a);
}
function offerStats(){
  const a = OFFERS.all(), waiting = a.filter(o=>o.status === "sent"), nudge = waiting.filter(o=>Date.now() - o.ts > 2*864e5);
  const done = a.filter(o=>["accepted","declined"].includes(o.status)), acc = a.filter(o=>o.status === "accepted").length;
  return {all:a, waiting:waiting.length, nudge:nudge.length, countered:a.filter(o=>o.status === "countered").length, acc, rate: done.length ? acc/done.length : null};
}

/* ---------- the game plan: one ordered path through the app ---------- */
const STEPS = [
  {go:"direction", n:1, label:"Diagnose", icon:"diagnose"},
  {go:"trades",    n:2, label:"Trades",   icon:"trades"},
  {go:"offers",    n:3, label:"Offers",   icon:"offers"},
  {go:"fix",       n:4, label:"Lineups",  icon:"lineups"},
  {go:"waivers",   n:5, label:"Waivers",  icon:"waivers"}
];
function stepInfo(k){
  if(k === "direction"){
    if(S.dir){ const L = Object.values(S.dir.leagues), limbo = L.filter(z=>LIMBO.has(z.me.dir)).length;
      return {badge: limbo || null, tone:"warn", title:"Diagnose your teams", line: limbo ? `${limbo} team${limbo>1?"s are":" is"} in limbo: one spot out of the money is the worst finish` : `All ${L.length} teams have a clear lane`}; }
    const tl = teamList().filter(x=>x.b), und = tl.filter(x=>x.dir === "none").length;
    return {badge: und || null, tone:"warn", title:"Diagnose your teams", line: tl.length ? (und ? `${und} team${und>1?"s have":" has"} no direction yet. Simulate the season to pick a lane` : "Every team has a lane. Re-check playoff odds any time") : "Scoring your teams…"};
  }
  if(k === "trades") return {title:"Get trade advice", line:"Recs built for each team, plus trade check, compare and real market prices"};
  if(k === "offers"){ const o = offerStats();
    return {badge: o.waiting || null, tone: o.nudge ? "warn" : "up", title:"Track your offers", line: o.all.length ? `${o.waiting} waiting on an answer${o.nudge ? ` · ${o.nudge} need${o.nudge>1?"":"s"} a nudge` : ""}${o.countered ? ` · ${o.countered} countered` : ""}` : "Copy any trade rec and it's tracked here until they answer"}; }
  if(k === "fix"){ const c = fixCounts(), nl = nextLock(), urgent = !!(nl && hoursTo(nl.k.ts) < 48 && (c.fix || nl.fix));
    const line = c.fix + c.monitor + c.startsit ? `${c.fix} must fix · ${c.monitor} game-time · ${c.startsit} upgrades${nl ? ` · first lock ${kickLabel(nl.k)}` : ""}` : "Every lineup is set";
    return {badge: c.fix || null, tone:"crit", title:"Set your lineups", line, urgent}; }
  if(k === "waivers"){ const d = ET(Date.now()), dow = d.getDay(), soon = dow === 2 || (dow === 3 && d.getHours() < 12);
    return {title:"Work the waiver wire", line: soon ? "Most claims process tonight. Set bids before bed" : "Fill holes, stash value, and bid what your leagues actually pay", urgent:false, badge: soon ? "!" : null, tone:"warn"}; }
  return {title:k, line:""};
}
function renderChrome(){
  const dot = $("menuDot"); if(dot) dot.hidden = !(S.results.length && fixCounts().fix);
  if(MENU.open) renderMenu();
}
const LOCKWORD = {fix:"fix", monitor:"game-time", startsit:"upgrade"};
function backBtn(parent, label){ return `<button class="ghost back" data-back="${parent}">${ICON.back} ${esc(label)}</button>`; }

/* ---------- top-left menu ---------- */
const MENU = {open:false, q:""};
function menuItem(icon, label, sub, attrs, count, tone){
  return `<button class="mitem" ${attrs}>${svgI(icon)}<span class="t">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ""}</span>${count != null && count !== "" ? `<span class="ct${tone ? " "+tone : ""}">${count}</span>` : ""}</button>`;
}
function renderMenu(){
  const p = $("mpanel"); if(!p) return;
  const c = fixCounts(), o = offerStats(), nl = nextLock(), dirI = stepInfo("direction");
  const q = MENU.q.trim().toLowerCase(), locks = lockMap();
  const teams = q ? teamList().filter(x=>x.name.toLowerCase().includes(q)).slice(0, 12) : [];
  const ae = document.activeElement, keep = ae && ae.id === "mq2" ? ae.selectionStart : null;
  const acct = !accountsOn() ? "" : ACC.session ? menuItem("user", "Account", accName(), `data-acopen="account"`) : menuItem("user", "Sign in", "Save your setup and use it on every device", `data-acopen="signin"`);
  p.innerHTML = `
    <div class="mgroup"><input class="search" id="mq2" type="search" placeholder="Jump to a team · ${teamList().length} leagues" value="${esc(MENU.q)}" autocomplete="off">
      ${q ? `<div class="mteams">${teams.map(x=>{ const l = locks[x.id];
        return `<button class="mitem" data-team="${x.id}">${svgI("team",18)}<span class="t">${esc(x.name)}<small>${esc(x.rec)} · ${DIR3[x.dir]}${l ? ` · ${LOCKWORD[l.kind]} by ${esc(kickLabel(l.k))}` : ""}</small></span>${l ? `<span class="ct ${l.kind === "fix" ? "crit" : l.kind === "monitor" ? "warn" : "up"}">${l.kind === "fix" ? "Fix" : l.kind === "monitor" ? "Check" : "Swap"}</span>` : ""}</button>`; }).join("") || `<div class="sub" style="padding:6px 8px">No league matches.</div>`}</div>` : ""}
    </div>
    <div class="mgroup"><div class="lab">This week${nl ? ` · first lock ${esc(kickLabel(nl.k))}` : ""}</div>
      ${menuItem("lineups","Must fix","Starters who can't play",`data-go="fix" data-tab="fix"`, c.fix, c.fix ? "crit" : "")}
      ${menuItem("monitor","Game-time","Questionable starters to check",`data-go="fix" data-tab="monitor"`, c.monitor, c.monitor ? "warn" : "")}
      ${menuItem("swaps","Upgrades","Bench players who outscore a starter",`data-go="fix" data-tab="startsit"`, c.startsit, "")}
      ${menuItem("waivers","Waivers","Holes to fill, stashes and bids",`data-go="waivers"`)}
      ${menuItem("brief",`Week ${S.week} brief`,"The story of your week",`data-go="brief"`)}
    </div>
    <div class="mgroup"><div class="lab">Trades</div><div class="mgrid">
      <button class="mtile" data-go="trades">${svgI("trades",18)}Trade finder</button>
      <button class="mtile" data-opentool="trade">${svgI("swaps",18)}Trade check</button>
      <button class="mtile" data-opentool="compare">${svgI("compare",18)}Compare</button>
      <button class="mtile" data-go="offers">${svgI("offers",18)}Offers${INBOX.all().filter(x=>x.status === "open").length ? ` <span class="ct warn">${INBOX.all().filter(x=>x.status === "open").length}</span>` : ""}</button>
      <button class="mtile" data-nav="trades:market">${svgI("market",18)}Trade market</button>
      <button class="mtile" data-opentool="start">${svgI("start",18)}Start / Sit</button>
    </div></div>
    <div class="mgroup"><div class="lab">Players &amp; teams</div><div class="mgrid">
      <button class="mtile" data-go="rankings">${svgI("rankings",18)}Rankings</button>
      <button class="mtile" data-nav="players:exposure">${svgI("exposure",18)}Exposure</button>
      <button class="mtile" data-nav="teams:value">${svgI("reviews",18)}Now vs future</button>
      <button class="mtile" data-nav="teams:odds">${svgI("diagnose",18)}Playoff odds${dirI.badge ? ` <span class="ct warn">${dirI.badge}</span>` : ""}</button>
    </div></div>
    ${acct ? `<div class="mgroup">${acct}</div>` : ""}
    <div class="mfoot"><button class="ghost" id="mRefresh">${svgI("refresh",16)}Refresh</button><button class="ghost" id="mSwitch">${svgI("user",16)}Switch Sleeper user</button></div>`;
  if(keep != null){ const el = $("mq2"); el.focus({preventScroll:true}); try{ el.setSelectionRange(keep, keep); }catch(_){} }
}
function openMenu(){
  const m = $("menu"); if(!m || MENU.open) return;
  MENU.open = true; MENU.q = ""; renderMenu(); m.hidden = false; $("menuBtn").setAttribute("aria-expanded","true");
  requestAnimationFrame(()=>requestAnimationFrame(()=>m.classList.add("open")));
  document.body.style.overflow = "hidden";
  setTimeout(()=>{ const f = m.querySelector(".mitem"); if(f) f.focus({preventScroll:true}); }, 60);
}
function closeMenu(){
  const m = $("menu"); if(!m || !MENU.open) return;
  MENU.open = false; m.classList.remove("open"); $("menuBtn").setAttribute("aria-expanded","false"); document.body.style.overflow = "";
  setTimeout(()=>{ if(!MENU.open) m.hidden = true; }, reduceMotion() ? 0 : 260);
}

/* ---------- toast ---------- */
function showToast(text){
  const t = $("toast"); if(!t) return;
  t.innerHTML = `<span class="miniorb sm" aria-hidden="true"></span><span>${esc(text)}</span>`; t.hidden = false;
  t.getAnimations().forEach(a=>a.cancel());
  if(!reduceMotion()) t.animate([{opacity:0, transform:"translate(-50%,10px)"},{opacity:1, transform:"translate(-50%,0)"}], {duration:260, easing:"cubic-bezier(.22,1,.36,1)"});
  clearTimeout(S._toastT); S._toastT = setTimeout(()=>{ t.hidden = true; }, 2600);
}

/* ---------- Diagnose: every team simulated, limbo first ---------- */
function viewDirection(){
  const tabs = [["value","Now vs future"],["odds","Playoff odds"]];
  if(!tabs.some(x=>x[0] === S.ttab)) S.ttab = store.get("ttab", "value");
  const ti = tabs.findIndex(x=>x[0] === S.ttab);
  let h = `<section class="pagehead"><h1 class="h1">Teams</h1><div class="sub">${S.ttab === "value"
      ? "Every dynasty team's value today and in two seasons, graded by position against its league. Tap a team for its full diagnosis and trade recs."
      : "Every season simulated 1,000 times to pick a lane: contend or rebuild. Teams stuck in the middle come first, because that's where a move matters most."}</div></section>
    <div class="seg" role="tablist" aria-label="Team view" style="--n:2;--i:${ti}">${tabs.map(([k,l])=>`<button role="tab" data-ttab="${k}" aria-selected="${S.ttab===k}">${l}</button>`).join("")}<i aria-hidden="true"></i></div>
    <div class="statusline" id="statusline"></div>`;
  if(S.ttab === "value"){ h += renderBlueprints(); if(S.bpLoading || !S.bp) h += `<div class="skel" aria-hidden="true"><i style="height:130px"></i><i style="height:150px"></i><i style="height:150px"></i></div>`; return h; }
  if(!S.dir){
    if(!S.dirLoading && !S.dirError) setTimeout(loadDirection, 0);
    if(S.dirError) return h + `<div class="err">${esc(S.dirError)}</div>`;
    return h + `<div class="skel" aria-hidden="true"><i style="height:120px"></i><i style="height:150px"></i><i style="height:150px"></i></div>`;
  }
  return h + renderDirList() + `<div class="nextstep"><span class="sub">Lanes set. Find the deals that move each team along it.</span><button class="ghost go" data-go="trades">Trade finder →</button></div>`;
}

/* ---------- Trades hub: finder per team, check, compare, market ---------- */
function viewTrades(){
  const tl = teamList(), o = offerStats();
  const L = S.dir && S.dir.leagues;
  const pri = x => { const z = L && L[x.id] && L[x.id].me; if(z) return LIMBO.has(z.dir) ? 0 : x.dir === "none" ? 1 : 2; return x.dir === "none" ? 1 : 2; };
  const list = tl.filter(x=>x.b).sort((a,b)=>pri(a) - pri(b) || a.name.localeCompare(b.name));
  let h = `<section class="pagehead"><h1 class="h1">Trades</h1><div class="sub">Pick a team for recs built around its direction, check any offer, or see what a player actually cost.</div></section>
    <section class="hub3">
      <button class="ttile glass" data-opentool="trade">${svgI("trades",24)}<b>Trade check</b><small>Build any offer and grade it</small></button>
      <button class="ttile glass" data-opentool="compare">${svgI("compare",24)}<b>Compare</b><small>Two players, long term</small></button>
      <button class="ttile glass" data-go="offers">${svgI("offers",24)}<b>Offers${o.waiting ? ` <span class="ct up">${o.waiting}</span>` : ""}</b><small>${o.all.length ? `${o.waiting} waiting` : "Track what you send"}</small></button>
    </section>
    <section style="display:flex;flex-direction:column;gap:10px"><div class="sec"><h2 class="h2">Trade finder</h2><span class="sub">${L ? "Limbo teams first" : "Undecided teams first"}</span></div>
      <div class="teamrow-list">${list.map(x=>{ const z = L && L[x.id] && L[x.id].me;
        const tag = z ? `<span class="dtag d-${DIR[z.dir].mode === "buy" ? "contend" : "rebuild"}">${DIR[z.dir].short}</span>` : `<span class="dtag d-${x.dir}">${DIR3[x.dir]}</span>`;
        return `<button class="trow" data-team="${x.id}" data-anchor="trades" data-from="trades"><span class="t"><span class="nm">${esc(x.name)}</span><span class="mt">${esc(x.rec)}${z ? ` · ${pct(z.odds.po)} playoff odds` : ""} · ${x.dir === "none" ? "no direction set" : DIR3[x.dir].toLowerCase()}</span></span>${tag}<span class="chev" aria-hidden="true">›</span></button>`; }).join("") || `<div class="empty" style="margin:0">${S.bpLoading ? "Scoring your teams…" : "No dynasty teams with enough data yet."}</div>`}</div>
      ${!L ? `<button class="ghost tint" data-go="direction" style="align-self:flex-start">${svgI("diagnose",16)} Simulate every season to sort by playoff odds</button>` : ""}</section>`;
  h += recentTradesHTML();
  h += marketHTML();
  return h;
}
function marketHTML(){
  const q = (S.mq||"").trim().toLowerCase();
  let h = `<section id="market" style="display:flex;flex-direction:column;gap:10px;scroll-margin-top:190px"><div class="sec"><h2 class="h2">Trade market</h2><span class="sub">Real trades in your leagues</span></div>
    <input class="search" id="mq" type="search" placeholder="What did a player cost? (e.g. ${esc((nameIndex().filter(p=>p.mine).sort((a,b)=>b.pts-a.pts)[0]||{full:"jeanty"}).full.split(" ").slice(-1)[0])})" value="${esc(S.mq||"")}" autocomplete="off">`;
  if(q.length >= 3){
    if(!S.tx){ if(!S.txP) loadTx().then(()=>render()).catch(()=>{}); return h + `<div class="statusline"><span class="livedot" style="background:var(--violet)"></span>Reading this season's trades…</div></section>`; }
    const ids = Object.keys(S.proj).filter(id=>pname(id).toLowerCase().includes(q)).slice(0, 6);
    const rows = ids.flatMap(id=>marketFor(id).map(r=>({...r, pid:id})));
    h += rows.length ? `<div class="plist">${rows.slice(0, 25).map(r=>`<div class="prow"><div class="ptop"><span class="nm">${esc(pname(r.pid))}</span><span class="pos">${new Date(r.ts).toLocaleDateString([], {month:"short", day:"numeric"})}</span></div>
      <div class="pstat">${esc(r.name)} · bought by ${esc(r.buyer)}${r.mine ? " · your trade" : ""}</div>
      <div class="pstat">Cost: ${esc(r.paid.join(", ") || "nothing listed")}${r.got.length ? ` · buyer also got ${esc(r.got.join(", "))}` : ""}</div></div>`).join("")}</div>`
      : `<div class="empty">No trades for that player in your leagues this season.</div>`;
  }
  return h + `</section>`;
}

/* ---------- Offers: what you sent and what came back ---------- */
const OF_STATUS = [["sent","Waiting"],["countered","Countered"],["accepted","Accepted"],["declined","Declined"]];
/* ---------- Home: what can't wait, then the plan ---------- */
function nowCardHTML(){
  const b = bulletinHTML(); if(b) return b;
  const nl = nextLock(), c = fixCounts(); if(!nl || !(c.fix + c.monitor)) return "";
  const hot = hoursTo(nl.k.ts) < 24;
  return `<section class="nowcard glass${hot ? " hot" : ""}"><span class="t"><span class="lab">Next lock · ${esc(kickLabel(nl.k))}</span><b>${nl.n} lineup${nl.n>1?"s":""} to handle before ${esc(kickLabel(nl.k).split(" ")[0])} kickoff</b><small>${nl.fix ? `${nl.fix} with a starter who can't play` : "Game-time calls and better lineups"}</small></span>
    <span class="cd${hot ? " hot" : ""}">${esc(untilText(nl.k.ts))}</span><button class="ghost go" data-go="fix" data-tab="${nl.fix ? "fix" : "monitor"}">Fix</button></section>`;
}
function weekItems(){
  const items = [], o = offerStats(), dir = stepInfo("direction"), wv = stepInfo("waivers");
  items.push(wv.badge ? {go:"waivers", icon:"waivers", tone:"warn", hot:true, title:"Waivers run tonight", line:"Most leagues process claims overnight. Fill holes and set bids before bed", badge:"!"}
    : {go:"waivers", icon:"waivers", calm:true, title:"Waivers", line:"Lineup holes to fill, stashes worth adding, and what to bid"});
  if(dir.badge) items.push({go:"direction", nav:"teams:odds", icon:"diagnose", tone:"warn", title:`Diagnose ${dir.badge} team${dir.badge>1?"s":""} with no lane`, line:"Undecided teams lose value every season. Simulate the year and pick contend or rebuild", badge:dir.badge});
  const rcv = INBOX.all().filter(x=>x.status === "open");
  if(rcv.length) items.push({go:"offers", icon:"offers", tone:"warn", title:`Answer ${rcv.length} trade offer${rcv.length>1?"s":""}`, line:`${rcv.filter(x=>x.rev && x.rev.band === "smash").length} smash · ${rcv.filter(x=>x.rev && x.rev.band === "close").length} close · ${rcv.filter(x=>x.rev && x.rev.band === "lowball").length} lowball`, badge:rcv.length});
  if(o.waiting) items.push({go:"offers", icon:"offers", tone: o.nudge ? "warn" : "up", title:`${o.waiting} sent offer${o.waiting>1?"s":""} waiting`, line: o.nudge ? `${o.nudge} sent 2+ days ago: time for a nudge` : "Mark the answer when it comes back", badge:o.waiting});
  items.push({go:"brief", icon:"brief", calm:true, title:`Week ${S.week} brief`, line:"Your whole week in a two-minute read", cta: S.brief[S.week] ? "Open" : "Generate"});
  return items;
}
function planHTML(){
  const items = weekItems(), need = items.filter(x=>!x.calm).length;
  return `<section style="display:flex;flex-direction:column;gap:10px"><div class="sec"><h2 class="h2">This week</h2><span class="sub">${need ? `${need} more thing${need>1?"s":""} need${need>1?"":"s"} you` : "Nothing else needs you"}</span></div>
    <div class="plan glass">${items.map(x=>`<button class="pstep${x.hot ? " hot" : ""}${x.calm ? " calm" : ""}" ${x.nav ? `data-nav="${x.nav}"` : `data-go="${x.go}"`}><span class="n">${svgI(x.icon,16)}</span><span class="t"><b>${esc(x.title)}</b><small>${esc(x.line)}</small></span>${x.badge ? `<span class="ct ${x.tone}">${x.badge}</span>` : x.cta ? `<span class="cta" style="color:var(--cyan-2);font-weight:650;font-size:13px">${x.cta}</span>` : ""}<span class="chev" aria-hidden="true">›</span></button>`).join("")}</div></section>`;
}

/* ---------- the pinned ask bar: live read of what you typed ---------- */
const STOPW = new Set([...STOP, "sell","buy","trade","trades","waiver","waivers","rank","ranks","rankings","tier","tiers","start","sit","bench","flex","play","compare","value","worth","cost","market","brief","offer","offers","league","team","teams","rebuild","contend","contending","rebuilding","direction","week","rest","season","top","best","adds","add","pickup","pickups","stash","faab","injured","injury","questionable","lineup","lineups","fix","out","bye","risers","fallers","trending","dynasty","redraft","should","would","could","can","get","give","send","from","have","has","him","his","them","they","their","about","which","next","last","now","today","tonight","much","many","does","did","where","when","why","how","keep","hold","drop","cut","claim","bid","yes","no","not","any","some","more","less","good","bad","great","buy-low","sell-high"]);
const ENGLISH = new Set(["chase","love","best","will","young","hunt","cook","hall","bell","white","brown","hill","rice","price","ward","reed","stone","mack","hunter","worthy","dart","nix","london","mills","banks","fields","sweat","person","major","law","golden","house","wise","moss","lamb","green","black","gray","king","knight","sanders","carter","rush","long","strong","may","high","low","love","walker","jones","smith","johnson","williams","thomas","taylor","jackson","harris","davis","allen","moore","wilson","adams","collins","henry","jacobs","hurts","waddle","pitts","penix","bowers"]);
const NICK = {cmc:"christian mccaffrey", arsb:"amon-ra st brown", jsn:"jaxon smith-njigba", btj:"brian thomas", mhj:"marvin harrison", "amon-ra":"amon-ra st brown", jt:"jonathan taylor", kw:"kyren williams", "ceedee":"ceedee lamb", "jj":"justin jefferson", "jefferson":"justin jefferson", "bijan":"bijan robinson", "puka":"puka nacua", "saquon":"saquon barkley", "lamar":"lamar jackson", "mahomes":"patrick mahomes", "tyreek":"tyreek hill"};
const NFLN = {cardinals:"ARI",falcons:"ATL",ravens:"BAL",bills:"BUF",panthers:"CAR",bears:"CHI",bengals:"CIN",browns:"CLE",cowboys:"DAL",broncos:"DEN",lions:"DET",packers:"GB",texans:"HOU",colts:"IND",jaguars:"JAX",jags:"JAX",chiefs:"KC",raiders:"LV",chargers:"LAC",rams:"LAR",dolphins:"MIA",vikings:"MIN",patriots:"NE",pats:"NE",saints:"NO",giants:"NYG",jets:"NYJ",eagles:"PHI",steelers:"PIT","49ers":"SF",niners:"SF",seahawks:"SEA",buccaneers:"TB",bucs:"TB",titans:"TEN",commanders:"WAS"};
const NFL_ABBR = new Set(Object.values(NFLN).concat(["WAS"]));
const POSW = [[/\bquarterbacks?\b|\bqbs?\b/,"QB"],[/\brunning ?backs?\b|\brbs?\b/,"RB"],[/\bwide ?receivers?\b|\breceivers?\b|\bwrs?\b/,"WR"],[/\btight ?ends?\b|\btes?\b/,"TE"],[/\bkickers?\b/,"K"],[/\bdefen[cs]es?\b|\bd\/?st\b|\bdsts?\b/,"DEF"]];
const GENERIC = new Set(["league","leagues","dynasty","fantasy","football","ff","the","of","and","sf","superflex","super","flex","ppr","half","te","tep","12","10","14","16","team","teams","2025","2026","2027","my","in","a","dyno","redraft","keeper","best","ball","lg","ffl","club","official","2.0","12t","10t","14t"]);
function lev(a, b){ if(Math.abs(a.length - b.length) > 1) return 9; const m = a.length, n = b.length, d = Array.from({length:m+1}, (_,i)=>[i]); for(let j=1;j<=n;j++) d[0][j] = j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++) d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)); return d[m][n]; }
function playerIdx(){
  const n = Object.keys(S.proj).length; if(S._pidx && S._pidxN === n) return S._pidx;
  const fc = {}, lc = {};
  const rows = nameIndex().map(p=>{ const full = p.full.replace(/\./g,"").replace(/'/g,"'").replace(/\s+/g," ").trim(), parts = full.split(" "), first = parts[0], lastParts = parts.slice(1).filter(w=>!/^(jr|sr|ii|iii|iv|v)$/.test(w));
    fc[first] = (fc[first]||0) + 1; const last = lastParts.join(" "); lc[last] = (lc[last]||0) + 1; return {...p, fullN:full, parts, first, lastParts, last}; });
  rows.forEach(r=>{ r.firstUnique = fc[r.first] === 1; r.lastDup = lc[r.last] > 1; });
  S._pidx = rows; S._pidxN = n; return rows;
}
function tokenize(text){
  const orig = text.replace(/[’‘]/g,"'").replace(/\./g,"").replace(/'s\b/gi,"").replace(/[^A-Za-z0-9'\-/ ]/g," ").split(/\s+/).filter(Boolean);
  return {orig, toks: orig.map(t=>t.toLowerCase())};
}
function findPlayers2(text){
  const {orig, toks} = tokenize(text), low = text.toLowerCase(), ctx = /\b(start|sit|or|vs|versus|trade|for|compare|better|over|sell|buy|value|rank)\b/.test(low);
  const cands = [];
  for(const p of playerIdx()){
    let best = null; const n = p.parts.length;
    for(let i=0; i+n<=toks.length && !best; i++) if(p.parts.every((w,j)=>toks[i+j] === w)) best = {s:100, a:i, b:i+n-1};
    if(!best){ const nick = Object.keys(NICK).find(k=>NICK[k] === p.fullN && toks.includes(k)); if(nick){ const i = toks.indexOf(nick); best = {s:92, a:i, b:i}; } }
    if(!best && p.lastParts.length){ const ln = p.lastParts.length;
      for(let i=0; i+ln<=toks.length && !best; i++) if(p.lastParts.every((w,j)=>toks[i+j] === w)){
        const english = ln === 1 && ENGLISH.has(p.lastParts[0]) && !/^[A-Z]/.test(orig[i]) && !ctx;
        if(!english) best = {s: p.lastDup ? 40 : 50, a:i, b:i+ln-1}; } }
    if(!best && p.firstUnique && p.first.length >= 4 && !STOPW.has(p.first) && !ENGLISH.has(p.first)){ const i = toks.indexOf(p.first); if(i >= 0) best = {s:40, a:i, b:i}; }
    if(!best){ const L = p.lastParts[p.lastParts.length-1] || "";
      for(let i=0; i<toks.length && !best; i++){ const w = toks[i]; if(w.length < 4 || STOPW.has(w) || GENERIC.has(w)) continue;
        if(L.length > w.length && L.startsWith(w)) best = {s: 22 + w.length, a:i, b:i};
        else if(L.length >= 5 && w.length >= 5 && lev(w, L) === 1) best = {s:33, a:i, b:i}; } }
    if(best){ best.s += (p.mine ? 9 : 0) + Math.min(9, p.pts/2.5); cands.push({p, ...best}); }
  }
  cands.sort((x,y)=>y.s - x.s);
  const used = new Set(), out = [];
  for(const c of cands){ if(c.s < 34) break; let clash = false; for(let k=c.a; k<=c.b; k++) if(used.has(k)) clash = true; if(clash) continue;
    for(let k=c.a; k<=c.b; k++) used.add(k); out.push(c); if(out.length >= 4) break; }
  out.sort((x,y)=>x.a - y.a);
  return {players: out.map(c=>({id:c.p.id, name:pname(c.p.id), pos:(S.proj[c.p.id]&&S.proj[c.p.id].player||{}).position, team:(S.proj[c.p.id]&&S.proj[c.p.id].player||{}).team})), used, toks, orig};
}
function findLeague(toks, used){
  const free = toks.filter((t,i)=>!used.has(i));
  let best = null, bs = 0, tie = false;
  for(const r of S.results){ if(!r.league) continue; const lg = r.league;
    const nt = lg.name.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w=>w && !GENERIC.has(w)); if(!nt.length) continue;
    let s = 0; for(const w of nt){ if(free.includes(w)) s += 10; else if(w.length >= 5 && free.some(t=>t.length >= 4 && !STOPW.has(t) && w.startsWith(t))) s += 6; }
    s = s / Math.sqrt(nt.length);
    if(s > bs){ bs = s; best = lg; tie = false; } else if(s === bs && s > 0) tie = true; }
  return bs >= 5.5 && !tie ? best : null;
}
const ownedIn = pid => cbLeagues().filter(x=>(x.mine.players||[]).includes(pid));
function ownerIn(x, pid){ const r = (x.rosters||[]).find(z=>z !== x.mine && (z.players||[]).includes(pid)); if(!r) return null;
  const b = (S.bp||[]).find(z=>z.lg.league_id === x.lg.league_id), t = b && b.teams.find(z=>z.rid === r.roster_id); return {rid:r.roster_id, name: t ? t.name : `Team ${r.roster_id}`}; }
function runTool(mode, P, lg){
  TOOL.mode = mode; CB.mode = mode; CB.league = lg && cbLeagues().some(x=>x.lg.league_id === lg.league_id) ? lg.league_id : "all"; CB.b = []; CB.qa = ""; TOOL.sub = "matchup";
  CB.a = P.slice(0,2).map(p=>({id:p.id, name:p.name})); go("ask"); if(CB.a.length === 2) setTimeout(reveal, 300);
}
function interpret(raw){
  const t = raw.trim(), low = t.toLowerCase();
  const F = findPlayers2(t), P = F.players, n = P.length;
  const lg = findLeague(F.toks, F.used);
  let pos = null; for(const [re, p] of POSW) if(re.test(low)){ pos = p; break; }
  const team = (()=>{ for(let i=0;i<F.toks.length;i++){ if(F.used.has(i)) continue; if(NFLN[F.toks[i]]) return NFLN[F.toks[i]]; if(/^[A-Z]{2,3}$/.test(F.orig[i]) && NFL_ABBR.has(F.orig[i])) return F.orig[i]; } return null; })();
  const sc = {}, add = (k, v) => { sc[k] = (sc[k]||0) + v; };
  const T = re => re.test(low);
  if(T(/\b(who'?s out|out|injur\w*|hurt|bye|inactive|ruled out|must fix|can'?t play|empty)\b/)) add("fix", 4);
  if(T(/\bfix\b/) && !n) add("fix", 3);
  if(T(/\b(questionable|game[- ]?time|gtd|doubtful|monitor)\b/)) add("monitor", 5);
  if(T(/\b(bench points|optimal|optimi[sz]e|better lineups?|leaving points|best lineups?|set (my )?lineups?)\b/)) add("swaps", 5);
  if(T(/\b(start|sit|flex|who should i play|play)\b/)) add("start", n >= 2 ? 6 : 3);
  if(T(/\bor\b/) && n >= 2) add("start", 2);
  if(T(/\b(dynasty|long[- ]?term|keep|hold|compare|vs|versus|who'?s better|better (asset|player|long))\b/)) add("compare", n >= 2 ? 6 : 3);
  if(T(/\b(trade|offer|deal|accept|package|counter|swap)\b/)) add("trade", 5);
  if(T(/\b(give|get|send)\b/) || (T(/\bfor\b/) && n >= 2)) add("trade", 3);
  if(T(/\b(sell|sell high|move on from|shop|cash out|get rid of)\b/)) add("sell", 7);
  if(T(/\b(buy|buy low|acquire|target|go get|trade for)\b/)) add("buy", 7);
  if(T(/\b(contend\w*|rebuild\w*|retool|tank\w*|push|all[- ]in|direction|limbo|middle|blow it up|win now|which way|playoff odds|title odds|diagnos\w*|playoffs?)\b/)) add("direction", 6);
  if(T(/\b(team values?|now (vs|and) future|future value|current value|portfolio|grades?|diagnos\w*|my teams?|teams?|values?)\b/) && !n) add("teamval", (T(/\bvalues?\b/) && pos) || sc.trade || sc.sell || sc.buy ? 3 : 6);
  if(T(/\b(waivers?|wire|pick ?ups?|adds?|free agents?|fa|faab|stash\w*|claims?|stream\w*)\b/)) add("waivers", 6);
  if(T(/\b(rank\w*|tiers?|top \d+|best (qb|rb|wr|te)s?|risers?|fallers?|trending|movers?|values?)\b/)) add("rankings", n ? 3 : 5);
  if(pos && !n && !sc.waivers) add("rankings", 2);
  if(T(/\b(how many|exposure|shares|do i own|rostered|where do i have|who do i have|my players)\b/)) add("exposure", 7);
  if(T(/\b(brief|summary|recap|my week|week ahead|overview|what matters)\b/)) add("brief", 8);
  if(T(/\b(cost|costs|paid|price|market|going for|traded for|worth|what did)\b/)) add("market", n ? 6 : 4);
  if(T(/\b(offers?|pending|waiting|follow ?up|nudge)\b/) && !T(/\b(make|send) (an )?offer\b/)) add("offers", 4);
  if(lg && (sc.trade || sc.sell || sc.buy) && !n) add("finder", 7);
  if(lg && !Object.keys(sc).length){ add("team", 6); add("finder", 5); }
  if(!Object.keys(sc).length){
    if(n >= 2){ add("start", 4); add("compare", 3); add("trade", 2); }
    else if(n === 1){ add(ownedIn(P[0].id).length ? "sell" : "buy", 4.2); add("compare", 4); add("exposure", 3); add("start", 2.5); add("market", 2); }
    else if(team) add("exposure", 5);
    else if(pos) add("rankings", 4);
    else add("help", 1);
  }
  const A = P[0], B = P[1], c = fixCounts(), out = [];
  const push = (k, it) => { if(it) (Array.isArray(it) ? it : [it]).forEach((z,i)=>out.push({...z, key:k, score:(sc[k]||0) - i*.4})); };
  const B_ = {
    fix: ()=>({icon:"lineups", label:"Fix your lineups", detail:`${c.fix} lineup${c.fix===1?"":"s"} with a starter who can't play, soonest lock first`, run:()=>go("fix", {tab:"fix"})}),
    monitor: ()=>({icon:"monitor", label:"Game-time calls", detail:`${c.monitor} lineup${c.monitor===1?"":"s"} with a Questionable starter`, run:()=>go("fix", {tab:"monitor"})}),
    swaps: ()=>({icon:"swaps", label:"Lineup upgrades", detail:`${c.startsit} league${c.startsit===1?"":"s"} where a bench player outscores a starter`, run:()=>go("fix", {tab:"startsit"})}),
    start: ()=> n >= 2 ? {icon:"start", label:`Start/Sit: ${A.name} or ${B.name}`, detail:"This week's projection, matchup, weather and your ranks", run:()=>runTool("start", P, lg)}
      : n === 1 ? {icon:"start", label:`Start/Sit with ${A.name}`, detail:"Pick who he's up against this week", run:()=>runTool("start", P, lg)} : {icon:"start", label:"Open Start/Sit", detail:"Head to head for this week", run:()=>runTool("start", [], lg)},
    compare: ()=> n >= 2 ? {icon:"compare", label:`Compare ${A.name} vs ${B.name}`, detail:"Dynasty value, age, production and 30-day trend", run:()=>runTool("compare", P)}
      : n === 1 ? {icon:"compare", label:`Compare ${A.name} with…`, detail:"Long-term value side by side", run:()=>runTool("compare", P)} : {icon:"compare", label:"Open Compare", detail:"Two players over the long run", run:()=>runTool("compare", [])},
    trade: ()=>{
      if(n >= 2){ const lgs = lg ? cbLeagues().filter(x=>x.lg.league_id === lg.league_id) : cbLeagues();
        for(const x of lgs){ const mine = new Set(x.mine.players||[]), give = P.filter(p=>mine.has(p.id)), get = P.filter(p=>!mine.has(p.id) && ownerIn(x, p.id));
          if(give.length && get.length){ const flipped = /\b(give|send|trade)\b/.test(low) && give[0].id !== A.id;
            return {icon:"trades", label:`Trade check: ${give.map(p=>p.name).join(" + ")} for ${get.map(p=>p.name).join(" + ")}`, detail: flipped ? `You have ${give[0].name} in ${x.lg.name}, so he's your side` : `${x.lg.name} · fair value, fit for both teams, playoff odds`, run:()=>cbPrefillTrade({lid:x.lg.league_id, give, get})}; } }
        return {icon:"trades", label:`Trade check with ${A.name} and ${B.name}`, detail:"They're not on opposite sides in one of your leagues. Open the builder.", run:()=>{ TOOL.mode = "trade"; CB.mode = "trade"; go("ask"); }}; }
      if(n === 1) return ownedIn(A.id).length ? B_.sell() : B_.buy();
      if(lg) return B_.finder();
      return {icon:"trades", label:"Find trades", detail:"Recs for each team, trade check and market prices", run:()=>go("trades")};
    },
    sell: ()=>{ if(!A) return lg ? B_.finder() : {icon:"trades", label:"Find sell trades", detail:"Pick a team for buyers and offers", run:()=>go("trades")};
      const own = ownedIn(A.id).filter(x=>!lg || x.lg.league_id === lg.league_id); if(!own.length) return B_.buy();
      return own.slice(0,3).map(x=>({icon:"trades", label:`Sell ${A.name} in ${x.lg.name}`, detail:"Trade recs and the teams that need him", run:()=>{ S.navFrom = "trades"; go("team", {lid:x.lg.league_id, anchor:"trades"}); }})); },
    buy: ()=>{ if(!A) return lg ? B_.finder() : {icon:"trades", label:"Find buy trades", detail:"Pick a team for upgrades and offers", run:()=>go("trades")};
      const where = cbLeagues().filter(x=>(!lg || x.lg.league_id === lg.league_id) && !(x.mine.players||[]).includes(A.id)).map(x=>({x, o:ownerIn(x, A.id)})).filter(z=>z.o);
      if(!where.length) return {icon:"trades", label:`Trade for ${A.name}`, detail:"He isn't rostered by a league mate in your leagues. Try waivers.", run:()=>go("waivers")};
      return where.slice(0,3).map(z=>({icon:"trades", label:`Trade for ${A.name} in ${z.x.lg.name}`, detail:`${z.o.name} has him. Build the offer`, run:()=>cbPrefillTrade({lid:z.x.lg.league_id, give:[], get:[{id:A.id, name:A.name}]})})); },
    finder: ()=> lg ? {icon:"trades", label:`Trade recs in ${lg.name}`, detail:"Built around that team's direction", run:()=>{ S.navFrom = "trades"; go("team", {lid:lg.league_id, anchor:"trades"}); }} : null,
    direction: ()=> lg ? {icon:"diagnose", label:`Contend or rebuild in ${lg.name}?`, detail:"Playoff odds, roster window and the data's call", run:()=>go("team", {lid:lg.league_id})}
      : {icon:"diagnose", label:"Playoff odds for every team", detail:"1,000 simulated seasons per league, and the right lane for each", run:()=>{ S.ttab = "odds"; go("direction"); }},
    teamval: ()=> lg ? {icon:"team", label:`Diagnose ${lg.name}`, detail:"Value now vs in two seasons, position grades and trade recs", run:()=>go("team", {lid:lg.league_id})}
      : {icon:"reviews", label:"Every team: now vs future value", detail:"Position grades and the two-season outlook for each dynasty team", run:()=>{ S.ttab = "value"; go("direction"); }},
    waivers: ()=>({icon:"waivers", label:`Waivers${pos ? `: best ${pos} adds` : ""}`, detail:"Holes to fill, stashes, and what to bid", run:()=>go("waivers")}),
    rankings: ()=>{ const mode = T(/\b(this week|week \d+|start)\b/) ? "week" : T(/\b(rest of (the )?season|ros|redraft)\b/) ? "ros" : T(/\bdynasty|long[- ]?term\b/) ? "dyn" : (T(/riser|faller|trending|mover/) ? "dyn" : RK.mode);
      const mv = T(/\b(fallers?|down|sell high|dropping)\b/) ? "fall" : T(/\b(risers?|trending|movers?|buy low|up|rising)\b/) ? "rise" : "rank";
      const lbl = {week:`Week ${S.week}`, ros:"Rest of season", dyn:"Dynasty"}[mode];
      return {icon:"rankings", label:`${A ? `${A.name} in the ` : ""}${pos || (A && A.pos) || "Overall"} rankings · ${lbl}${mv === "rise" ? " · 30-day risers" : mv === "fall" ? " · 30-day fallers" : ""}`, detail: A ? "Tier, value, production and why he's ranked there" : "Tiers, 30-day movers and the case for each player",
        run:()=>{ RK.mode = mode; store.set("rk:mode", mode); RK.pos = pos || (A && A.pos) || "ALL"; RK.sort = mv; RK.q = ""; RK.open = A ? A.id : null; go("rankings", A ? {anchor:"rk-"+A.id} : {}); }}; },
    exposure: ()=> A ? {icon:"exposure", label:`Where you have ${A.name}`, detail:`On ${ownedIn(A.id).length} of your rosters · start/sit in each`, run:()=>{ S.ptab = "exposure"; S.query = A.name; S.playerFilter = "all"; go("players"); }}
      : team ? {icon:"exposure", label:`Your ${team} players`, detail:"Every league you start or roster them", run:()=>{ S.ptab = "exposure"; S.query = team; S.playerFilter = "all"; go("players"); }}
      : {icon:"exposure", label:"Your exposure", detail:"Who you own across every league", run:()=>{ S.ptab = "exposure"; S.query = ""; go("players"); }},
    brief: ()=>({icon:"brief", label:`Week ${S.week} brief`, detail:"The story of your week, before kickoff", run:()=>go("brief")}),
    market: ()=> A ? {icon:"market", label:`What ${A.name} has cost`, detail:"Real trades in your leagues this season", run:()=>{ S.mq = A.name; go("trades", {anchor:"market"}); }}
      : {icon:"market", label:"Trade market", detail:"Search what players actually cost", run:()=>go("trades", {anchor:"market"})},
    offers: ()=>{ const o = offerStats(); return {icon:"offers", label:"Your offers", detail: o.all.length ? `${o.waiting} waiting · ${o.nudge} need a nudge` : "Nothing tracked yet", run:()=>go("offers")}; },
    team: ()=> lg ? {icon:"team", label:`Diagnose ${lg.name}`, detail:"Value now vs future, the data's lane, and trade recs", run:()=>go("team", {lid:lg.league_id})} : null,
    help: ()=>{ const j = jumpMatches(t); return j.length ? j.slice(0, 3).map(x=>({icon:x.icon, label:x.label, detail:x.detail, run:x.run})) : [{icon:"orb", label:"Open the crystal ball", detail:"Start/Sit, trade check and compare", run:()=>go("ask")}]; }
  };
  for(const k of Object.keys(sc)) push(k, B_[k] && B_[k]());
  // a named league is always one tap away
  if(lg && !out.some(o=>o.key === "team" || o.key === "finder" || o.key === "direction")) push("team", Object.assign(B_.team(), {}));
  const seen = new Set(), list = out.filter(o=>o && o.label && !seen.has(o.label) && seen.add(o.label)).sort((a,b)=>b.score - a.score);
  const chips = P.map(p=>`<span>${esc(p.name)}${p.pos ? ` · ${p.pos}` : ""}${p.team ? ` ${p.team}` : ""}</span>`).concat(lg ? [`<span class="lg">${esc(lg.name)}</span>`] : [], pos ? [`<span class="lg">${pos}</span>`] : [], team && !P.length ? [`<span class="lg">${team}</span>`] : []);
  return {list, chips, players:P, league:lg, pos, team};
}
function askFromText(text){
  const t = (text||"").trim();
  hideDrop();
  if(!t){ go("ask"); return; }
  const I = interpret(t), sel = S.dropSel && S.dropFor === t ? S.dropSel : 0, it = I.list[sel] || I.list[0];
  const rec = store.get("recentAsk", []).filter(x=>x !== t); rec.unshift(t); store.set("recentAsk", rec.slice(0, 5));
  const q = $("askq"); if(q){ q.value = ""; q.blur(); }
  if(!it){ go("ask"); return; }
  showToast(it.label);
  it.run();
}
function hideDrop(){ const d = $("askdrop"); if(d) d.hidden = true; S.dropSel = 0; }
/* every place the search can send you; words are what people type for it */
const JUMPS = [
  {k:"lineups", icon:"lineups", label:"Lineups", detail:"Must fix, game-time and upgrades", words:"lineups lineup fix start sit out injured bye", run:()=>go("fix")},
  {k:"trades", icon:"trades", label:"Trade finder", detail:"Recs built around each team's lane", words:"trades trade finder recs deal", run:()=>go("trades")},
  {k:"check", icon:"swaps", label:"Trade check", detail:"Build any offer and grade it", words:"trade check offer grade evaluate accept counter", run:()=>{ TOOL.mode = "trade"; CB.mode = "trade"; go("ask"); }},
  {k:"compare", icon:"compare", label:"Compare players", detail:"Dynasty value, age and production side by side", words:"compare versus vs value", run:()=>{ TOOL.mode = "compare"; CB.mode = "compare"; go("ask"); }},
  {k:"teams", icon:"reviews", label:"Teams: now vs future", detail:"Value today and in two seasons, by team", words:"teams team value values future current diagnose diagnosis grades portfolio", run:()=>{ S.ttab = "value"; go("direction"); }},
  {k:"odds", icon:"diagnose", label:"Playoff odds", detail:"Contend or rebuild, for every team", words:"playoff odds contend rebuild direction lane simulate", run:()=>{ S.ttab = "odds"; go("direction"); }},
  {k:"rankings", icon:"rankings", label:"Rankings", detail:"Week, rest of season and dynasty tiers", words:"rankings rank tiers risers fallers", run:()=>go("rankings")},
  {k:"waivers", icon:"waivers", label:"Waivers", detail:"Holes to fill, stashes and bids", words:"waivers waiver wire adds pickups faab free agents stash", run:()=>go("waivers")},
  {k:"offers", icon:"offers", label:"Offers", detail:"Trades you sent and their answers", words:"offers offer pending sent nudge", run:()=>go("offers")},
  {k:"market", icon:"market", label:"Trade market", detail:"What players actually cost in your leagues", words:"market cost price paid traded", run:()=>go("trades", {anchor:"market"})},
  {k:"exposure", icon:"exposure", label:"Exposure", detail:"Who you own across every league", words:"exposure shares own rostered players", run:()=>{ S.ptab = "exposure"; S.query = ""; go("players"); }},
  {k:"brief", icon:"brief", label:`Week brief`, detail:"Your whole week in a two-minute read", words:"brief summary recap week overview", run:()=>go("brief")}
];
function jumpMatches(text){
  const ws = text.toLowerCase().split(/\s+/).filter(w=>w.length >= 2);
  if(!ws.length) return [];
  return JUMPS.map(j=>{ const vocab = (j.words + " " + j.label.toLowerCase()).split(/\s+/); let s = 0;
    for(const w of ws) if(vocab.some(v=>v === w)) s += 3; else if(vocab.some(v=>v.startsWith(w))) s += 2; else if(w.length >= 4 && vocab.some(v=>v.length >= 5 && lev(w, v) === 1)) s += 1;
    return {...j, s}; }).filter(j=>j.s).sort((a,b)=>b.s - a.s);
}
/* finish what's being typed: a player, a league or a keyword that will actually work */
function completions(text){
  const raw = text.replace(/\s+$/,""), words = raw.split(/\s+/); if(!words[0] || text.endsWith(" ")) return [];
  const leagues = S.results.filter(r=>r.league).map(r=>r.league), pidx = playerIdx(), out = [];
  for(let k = Math.min(3, words.length); k >= 1 && !out.length; k--){
    const frag = words.slice(-k).join(" ").toLowerCase().replace(/[.']/g,""), head = words.slice(0, -k).join(" ");
    if(frag.length < 2) continue;
    const pl = pidx.filter(p=>(p.fullN.startsWith(frag) || (k === 1 && frag.length >= 3 && p.last.startsWith(frag))) && p.fullN !== frag)
      .sort((a,b)=>(b.mine - a.mine) || b.pts - a.pts).slice(0, 3);
    for(const p of pl){ const nm = pname(p.id), e = S.proj[p.id] && S.proj[p.id].player || {};
      out.push({kind:"player", icon:"exposure", text:(head ? head + " " : "") + nm + " ", label:nm, detail:`${e.position||""} ${e.team||""}${p.mine ? ` · on ${ownedIn(p.id).length} of your rosters` : ""}`.trim()}); }
    if(frag.length >= 3) for(const lg of leagues.filter(l=>{ const n = l.name.toLowerCase(); return n !== frag && (n.startsWith(frag) || n.split(/[^a-z0-9]+/).some(w=>w.length >= 3 && w.startsWith(frag))); }).slice(0, 2))
      out.push({kind:"league", icon:"team", text:(head ? head + " " : "") + lg.name + " ", label:lg.name, detail:"League"});
    if(k === 1 && frag.length >= 2){ const kw = ["trade","sell","buy","compare","value","diagnose","rank","waivers","lineups","start","offers","market","brief","rebuild","contend"].filter(w=>w.startsWith(frag) && w !== frag).slice(0, 2);
      for(const w of kw) out.push({kind:"word", icon:"orb", text:(head ? head + " " : "") + w + " ", label:w, detail:"Keyword"}); }
  }
  return out.slice(0, 4);
}
function suggested(){
  const out = [], c = fixCounts(), nl = nextLock();
  if(c.fix) out.push({icon:"lineups", label:`Fix ${c.fix} lineup${c.fix>1?"s":""}`, detail: nl ? `First lock ${kickLabel(nl.k)}` : "Starters who can't play", run:()=>go("fix", {tab:"fix"})});
  const tl = teamList().filter(x=>x.b && !x.r.bestBall), L = S.dir && S.dir.leagues;
  const pick = (L ? tl.find(x=>L[x.id] && LIMBO.has(L[x.id].me.dir)) : null) || tl.find(x=>x.dir === "none");
  if(pick) out.push({icon:"team", label:`Diagnose ${pick.name}`, detail: L && L[pick.id] && LIMBO.has(L[pick.id].me.dir) ? `${pct(L[pick.id].me.odds.po)} playoff odds, stuck in the middle` : "No lane set yet: see value now vs future", run:()=>go("team", {lid:pick.id})});
  const idea = promptIdeas().find(x=>/,? dynasty value\?$/.test(x)); if(idea) out.push({icon:"compare", label:idea.replace(/, dynasty value\?$/, "").replace(" or ", " vs "), detail:"Compare dynasty value", ask:idea});
  return out.slice(0, 3);
}
function updateDrop(){
  const q = $("askq"), d = $("askdrop"); if(!q || !d) return;
  if(document.activeElement !== q || !S.results.length){ d.hidden = true; return; }
  const t = q.value.trim(), row = (it, attrs, sel) => `<button class="drow${sel ? " sel" : ""}" ${attrs}>${svgI(it.icon,18)}<span class="t"><b>${esc(it.label)}</b>${it.detail ? `<small>${esc(it.detail)}</small>` : ""}</span>${sel ? `<kbd>↵</kbd>` : ""}</button>`;
  if(!t){
    const recent = store.get("recentAsk", []).slice(0, 3), sug = suggested();
    S.dropIntents = sug.filter(x=>x.run); S.dropFor = "";
    d.innerHTML = `<div class="dchips jump"><small>Go to</small>${["lineups","trades","teams","compare","check","rankings","waivers","offers"].map(k=>{ const j = JUMPS.find(z=>z.k === k); return `<button class="jchip" data-jump="${k}">${esc(j.label.replace(": now vs future","").replace(" players","").replace(" finder",""))}</button>`; }).join("")}</div>
      ${sug.length ? `<div class="lab">Suggested</div>${sug.map(x=>x.run ? row(x, `data-intent="${S.dropIntents.indexOf(x)}"`) : row(x, `data-ask="${esc(x.ask)}"`)).join("")}` : ""}
      ${recent.length ? `<div class="lab">Recent</div>${recent.map(x=>row({icon:"monitor", label:x}, `data-ask="${esc(x)}"`)).join("")}` : ""}
      <div class="dhint">Type a keyword (trade, value, compare, rank, waivers), a player, or one of your leagues. Mix them: "sell Puka in Gridiron".</div>`;
    d.hidden = false; return;
  }
  const I = interpret(t), C = completions(q.value); S.dropIntents = I.list; if(S.dropFor !== t){ S.dropSel = 0; S.dropFor = t; }
  d.innerHTML = (C.length ? `<div class="lab">Finish typing</div>${C.map(c=>row(c, `data-complete="${esc(c.text)}"`)).join("")}` : "") +
    (I.chips.length ? `<div class="dchips"><small>Heard</small>${I.chips.join("")}</div>` : "") +
    (I.list.length ? `<div class="lab">${C.length ? "Or go" : "Go"}</div>` : "") +
    I.list.slice(0, 4).map((it,i)=>row(it, `data-intent="${i}"`, i === (S.dropSel||0))).join("");
  d.hidden = false;
}

/* ---------- spin the ball, shake the phone ---------- */
const SHAKE = {on: store.get("shake", true), last:0, hits:[], px:null, asked:false};
function motionOK(){
  try{ if(SHAKE.asked || !SHAKE.on) return; if(typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function"){ SHAKE.asked = true; DeviceMotionEvent.requestPermission().catch(()=>{}); } }catch(e){}
}
function spinMini(dir=1){ const m = $("miniOrb"); if(!m || reduceMotion()) return;
  m.animate([{transform:"rotate(0) scale(1)"},{transform:`rotate(${dir*560}deg) scale(1.28)`, offset:.6},{transform:`rotate(${dir*720}deg) scale(1)`}], {duration:640, easing:"cubic-bezier(.22,1,.36,1)"}); }
function burstOrb(){ ORB.boost = 1; ORB.pulse = .6; ORB.shock = {x:.5, y:.47}; setTimeout(()=>{ ORB.boost = 0; }, 900); }
function askNow(source){
  haptic();
  if(currentView() === "ask"){ burstOrb();
    if(cbReady() && !S.thinking){ cbAsk(); return; }
    showToast(TOOL.mode === "trade" ? "Add a player to each side, then spin" : "Pick two players, then spin the ball"); return; }
  const q = $("askq");
  if(q && q.value.trim()){ spinMini(); const v = q.value; setTimeout(()=>askFromText(v), reduceMotion() ? 0 : 480); return; }
  if(source === "shake"){ go("ask"); setTimeout(burstOrb, 120); }
}
window.addEventListener("orbspin", ()=>askNow("spin"));
window.addEventListener("devicemotion", e=>{
  if(!SHAKE.on) return; const a = e.accelerationIncludingGravity || e.acceleration; if(!a || a.x == null) return;
  const p = SHAKE.px; SHAKE.px = {x:a.x, y:a.y, z:a.z}; if(!p) return;
  const d = Math.abs(a.x-p.x) + Math.abs(a.y-p.y) + Math.abs(a.z-p.z), now = Date.now();
  if(d > 24){ SHAKE.hits = SHAKE.hits.filter(t=>now - t < 800); SHAKE.hits.push(now);
    if(SHAKE.hits.length >= 3 && now - SHAKE.last > 2200 && S.results.length){ SHAKE.last = now; SHAKE.hits = []; askNow("shake"); } }
});
let MO = null;
document.addEventListener("pointerdown", e=>{ const m = e.target.closest("#miniOrb"); if(!m) return; MO = {x:e.clientX, el:m, dx:0}; try{ m.setPointerCapture(e.pointerId); }catch(_){} motionOK(); });
document.addEventListener("pointermove", e=>{ if(!MO) return; MO.dx = e.clientX - MO.x; MO.el.style.transform = `rotate(${MO.dx*5}deg) scale(1.1)`; }, {passive:true});
document.addEventListener("pointerup", ()=>{ if(!MO) return; const m = MO; MO = null; m.el.style.transform = "";
  const q = $("askq"), flick = Math.abs(m.dx) > 22;
  if(q && q.value.trim()){ spinMini(m.dx < 0 ? -1 : 1); const v = q.value; setTimeout(()=>askFromText(v), reduceMotion() ? 0 : 480); }
  else if(flick){ spinMini(m.dx < 0 ? -1 : 1); setTimeout(()=>go("ask"), 380); }
  else if(q) q.focus(); });
document.addEventListener("pointerdown", e=>{ if(e.target.id === "orb") motionOK(); }, {passive:true});

/* ---------- wiring ---------- */
document.addEventListener("click", e=>{
  if(e.target.closest("#menuBtn")){ MENU.open ? closeMenu() : openMenu(); return; }
  if(e.target.classList && e.target.classList.contains("scrim")){ closeMenu(); return; }
  if(e.target.closest("#mRefresh")){ closeMenu(); $("refresh").click(); return; }
  if(e.target.closest("#mSwitch")){ closeMenu(); S.userId = null; S.results = []; S.displayName = ""; S.error = null; S.bp = null; S.sim = {}; S.brief = {}; S.dir = null; S.lastKey = null; render(); return; }
  const it = e.target.closest("[data-intent]"); if(it){ const k = +it.dataset.intent, x = (S.dropIntents||[])[k]; const q = $("askq");
    if(x){ const t = q ? q.value.trim() : ""; if(t){ const rec = store.get("recentAsk", []).filter(z=>z !== t); rec.unshift(t); store.set("recentAsk", rec.slice(0,5)); }
      if(q){ q.value = ""; q.blur(); } hideDrop(); showToast(x.label); x.run(); } return; }
  const jp = e.target.closest("[data-jump]"); if(jp){ const j = JUMPS.find(z=>z.k === jp.dataset.jump), q = $("askq"); if(q){ q.value = ""; q.blur(); } hideDrop(); if(j) j.run(); return; }
  const cp = e.target.closest("[data-complete]"); if(cp){ const q = $("askq"); if(q){ q.value = cp.dataset.complete; q.focus(); try{ q.setSelectionRange(q.value.length, q.value.length); }catch(_){} } S.dropSel = 0; updateDrop(); return; }
  const bk = e.target.closest("[data-back]"); if(bk){ if((S.hdepth||0) > 0) history.back(); else go(bk.dataset.back); return; }
  const nv = e.target.closest("[data-nav]"); if(nv){ const [v, arg] = nv.dataset.nav.split(":");
    if(v === "players" && arg === "reviews"){ S.ttab = "value"; go("direction"); }
    else if(v === "players"){ S.ptab = arg; go("players"); }
    else if(v === "teams"){ S.ttab = arg; store.set("ttab", arg); go("direction"); }
    else if(v === "trades"){ go("trades", {anchor: arg}); setTimeout(()=>{ const m = $("mq"); if(m && arg === "market") m.focus({preventScroll:true}); }, 400); }
    return; }
  const ofs = e.target.closest("[data-ofs]"); if(ofs){ const i = ofs.dataset.ofs.lastIndexOf("|"), key = ofs.dataset.ofs.slice(0,i), st = ofs.dataset.ofs.slice(i+1);
    const a = OFFERS.all(), x = a.find(z=>z.key === key); if(x){ x.status = st; x.ts = Date.now(); OFFERS.save(a); } render(); return; }
  const ofr = e.target.closest("[data-ofrm]"); if(ofr){ OFFERS.save(OFFERS.all().filter(z=>z.key !== ofr.dataset.ofrm)); render(); return; }
  const tt = e.target.closest("[data-ttab]"); if(tt){ S.ttab = tt.dataset.ttab; store.set("ttab", S.ttab); render(); return; }
  const dlf = e.target.closest("[data-dlf]"); if(dlf){ S.dirFilter = dlf.dataset.dlf || null; render(); return; }
  const dr = e.target.closest("[data-dir]"); if(dr){ go("team", {lid: dr.dataset.dir}); return; }
  if(e.target.closest("#shakeT")){ SHAKE.on = !SHAKE.on; store.set("shake", SHAKE.on); if(SHAKE.on){ SHAKE.asked = false; motionOK(); } render(); return; }
}, true);
document.addEventListener("input", e=>{
  if(e.target.id === "askq"){ updateDrop(); return; }
  if(e.target.id === "mq2"){ MENU.q = e.target.value; renderMenu(); return; }
  if(e.target.id === "mq"){ S.mq = e.target.value; render(); return; }
});
document.addEventListener("focusin", e=>{ if(e.target.id === "askq"){ updateDrop(); $("top").classList.remove("tuck"); } });
document.addEventListener("focusout", e=>{ if(e.target.id === "askq") setTimeout(()=>{ if(document.activeElement !== $("askq")) hideDrop(); }, 160); });
document.addEventListener("keydown", e=>{
  if(e.key === "Escape"){ if(MENU.open){ closeMenu(); $("menuBtn").focus(); return; } const q = $("askq"); if(q && document.activeElement === q){ q.blur(); hideDrop(); } return; }
  if(e.target.id === "askq" && (e.key === "ArrowDown" || e.key === "ArrowUp") && (S.dropIntents||[]).length){ e.preventDefault();
    const n = Math.min(5, S.dropIntents.length); S.dropSel = ((S.dropSel||0) + (e.key === "ArrowDown" ? 1 : -1) + n) % n; updateDrop(); }
});
{ const d = $("askdrop"); if(d){ d.addEventListener("mousedown", e=>e.preventDefault()); d.addEventListener("pointerdown", e=>{ if(e.pointerType === "mouse") e.preventDefault(); }); } }
let lastY = 0;
window.addEventListener("scroll", ()=>{ const y = window.scrollY, top = $("top"); if(!top) return;
  if(document.activeElement !== $("askq")){ if(y > 140 && y > lastY + 6) top.classList.add("tuck"); else if(y < lastY - 6 || y < 140) top.classList.remove("tuck"); }
  lastY = y; }, {passive:true});

/* ---------- phone back gesture walks back through screens ---------- */
try{ history.replaceState({cc:1, v:"home"}, ""); }catch(_){}
window.addEventListener("popstate", e=>{
  const st = e.state; S.hdepth = Math.max(0, (S.hdepth||0) - 1);
  if(MENU.open) closeMenu();
  if(!S.results.length) return;
  if(st && st.cc){ if(st.v === "fix" && st.tab) S.fixTab = st.tab; if(st.v === "players" && st.ptab) S.ptab = st.ptab; go(st.v, {lid: st.lid, fromPop: true}); }
  else go("home", {fromPop: true});
});

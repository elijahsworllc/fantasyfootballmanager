/* =====================================================================
   Week Path home (Nov 28, 2026)
   Every tool sits in one of five stages, in the order a manager works through a week:
   Check in → Pick up → Trade → Set lineups → Game day. One hue per stage; red only means "needs you".
   The order is fixed (it no longer reorders by use) so the page is easy to learn.
   - Today's games: the games today that have one of your starters, first on the page.
   - Each tile has a one-line description and a live status line; hover (desktop) or ⓘ (phone) explains it.
   - A one-minute tour for new managers.
   - Matchup Preview: every head-to-head this week with your chance to win.
   ===================================================================== */
const WSTAGES = [
  {id:"in",    name:"Check in",    when:"Mon–Tue", hue:"#A08CFF", blurb:"See where every team stands",   tools:["brief","teams","edges"]},
  {id:"add",   name:"Pick up",     when:"Tue–Wed", hue:"#5FD6E6", blurb:"Fill holes before waivers run", tools:["waivers","rankings","exposure"]},
  {id:"trade", name:"Trade",       when:"Wed–Fri", hue:"#4BE3A0", blurb:"Find and send fair offers",     tools:["optimizer","trades","trade","compare","managers","offers"]},
  {id:"set",   name:"Set lineups", when:"Thu–Sun", hue:"#FFC15C", blurb:"Start the right players",       tools:["fix","start","matchups"]},
  {id:"game",  name:"Game day",    when:"Sun–Mon", hue:"#FF7A9C", blurb:"Lock in and watch it play out", tools:["run","live","weather"]}
];
// one short phrase per tool (no comma lists), and what the popup explains
const WTOOL = {
  brief:    {d:"Your week at a glance",       what:"A short read on every league: who won, who got hurt, and what to do first this week.", when:"Monday night or Tuesday morning, before anything else.", steps:["Open it and skim the top card","Tap any line to jump to that fix","Then move on to Pick up"], min:2},
  teams:    {d:"Each team's best path",       what:"Shows whether each team should push for a title or build for next year, from its record, roster age and value.", when:"When you need to know which teams should buy and which should sell.", steps:["Find your team in the list","Read its lane: contend or rebuild","Use that goal in Trade and Pick up"], min:1},
  edges:    {d:"Who your scoring favors",     what:"Finds players who score more under your league's settings (like TE premium or 6-point passing) than in normal rankings.", when:"When a league has unusual scoring and you want an edge on it.", steps:["Pick a league","See who gains and loses under its rules","Target the gainers in trades and waivers"], min:1},
  waivers:  {d:"Best pickups and bids",       what:"Finds the gaps in each lineup and the best free agents to fill them, with a bid that should win.", when:"Tuesday and Wednesday, before waivers run.", steps:["See which leagues have a hole","Pick a player from the short list","Copy the suggested bid into Sleeper"], min:2},
  rankings: {d:"Tiers you can reorder",       what:"Every player in tiers, using FFU values from real trades. Move players to make the list your own.", when:"When you want one list to guide pickups and starts.", steps:["Pick a position","Move a player up or down a tier","Your order is used across the site"], min:1},
  exposure: {d:"Shares across leagues",       what:"Lists every player you roster across all your leagues, so you can spot the risk if one of them gets hurt.", when:"When you play many leagues and want to spread your risk.", steps:["Sort by most shares","Tap a player to see which teams roster them","Trade away shares you have too many of"], min:1},
  optimizer:{d:"Top offers to send now",      what:"Searches every league-mate's roster for trades where you both win, matched to each team's direction.", when:"Any time you want trades that are likely to be accepted.", steps:["Pick your goal: win now or build","Review the offers it found","Open one in the trade builder and send it"], min:2},
  trades:   {d:"Ideas for one team",          what:"Builds trade ideas for one of your teams, based on what it needs and who has it.", when:"When one team has a clear need, like a starting WR.", steps:["Pick a team","See the partners who fit","Open an idea to tweak it"], min:1},
  trade:    {d:"Grade any offer",             what:"Build any trade and see who wins it now and long term, with a fair-or-not verdict.", when:"When you get an offer, or before you send one.", steps:["Add the players on each side","Read the grade and the verdict","Adjust until it's fair, then send"], min:1},
  compare:  {d:"Two players head to head",    what:"Puts two players side by side: value, age, schedule and outlook.", when:"When a trade or pickup comes down to two names.", steps:["Pick two players","See who wins each row","Use the verdict in your trade"], min:1},
  managers: {d:"How rivals trade",            what:"Profiles each league-mate: how often they trade, what they like, and who accepts fair offers.", when:"Before you send an offer, to pick the right partner.", steps:["Open a league","See each manager's trade style","Target the ones who say yes"], min:1},
  offers:   {d:"Status of sent offers",       what:"Keeps a list of offers you've sent and reminds you when one has gone quiet.", when:"After you send an offer.", steps:["Copy any trade and it's logged here","Check its status","Follow up or withdraw"], min:1},
  fix:      {d:"Fix inactive starters",       what:"Finds starters who are out, on bye or questionable in every league and suggests the best swap.", when:"Any day before lock. A red number means a starter can't play.", steps:["Open the Must fix tab","Make the suggested swap in Sleeper","Repeat until the count is zero"], min:2},
  start:    {d:"Settle close calls",          what:"Compares two or more players for this week, with projections rescored for your league.", when:"When you're torn between two starters.", steps:["Add the players you're choosing between","See the projected points","Start the winner"], min:1},
  matchups: {d:"Your odds this week",         what:"Projects every head-to-head you're in this week and shows your chance to win each one.", when:"Thursday through Saturday, while you set lineups.", steps:["Find the close matchups","See how many points your bench leaves out","Upgrade that lineup in Start / Sit"], min:1},
  run:      {d:"Every league in one pass",    what:"Walks you through each league that still needs a decision, one at a time, right before games start.", when:"Sunday morning, about 30 minutes before kickoff.", steps:["Tap Start","Make each call, or skip it","Done when every league is set"], min:3},
  live:     {d:"Your matchups live",          what:"Live scores for every matchup you're in, with win chances that update as games go.", when:"During games.", steps:["Open it once games start","See where you're winning or losing","Tap a matchup for player scores"], min:1},
  weather:  {d:"Wind and rain by game",       what:"Shows wind, rain and snow for every game your starters play in, and how much it moves their projections.", when:"Game day, before each kickoff window.", steps:["Scan the flagged games","See which of your starters it affects","Swap out a starter if the weather is bad"], min:1}
};
// clearer names (also used by the desktop rail and the menu)
const WRENAME = {exposure:"Player Exposure", compare:"Compare Players", managers:"Manager Scout", offers:"Offer Tracker", live:"Live Scores"};
for(const [, items] of CC_TOOLS) for(const t of items) if(WRENAME[t[0]]) t[1] = WRENAME[t[0]];
{ const g = CC_TOOLS.find(x=>x[0] === "Game day"); if(g && !g[1].some(x=>x[0] === "matchups")) g[1].splice(g[1].findIndex(x=>x[0] === "start") + 1, 0, ["matchups","Matchup Preview","matchup","#FFC15C",{go:"matchups"}, 1]); }
if(!TOOL_ORDER.includes("matchups")) TOOL_ORDER.splice(TOOL_ORDER.indexOf("start") + 1, 0, "matchups");
Object.assign(NI, {
  matchup:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.2"/>',
  wxflag:'<path d="M7 18a4.5 4.5 0 1 1 1-8.9A6 6 0 0 1 19.5 11 3.5 3.5 0 0 1 18 18z"/>',
  injflag:'<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.2"/>'
});
VIEWS.add("matchups");
RELATED.matchups = ["start","fix","live"];

/* ---------- stage of the week (New York time) ---------- */
function weekStage(){
  const d = ET(Date.now()).getDay();   // 0 Sun … 6 Sat
  return d === 0 || d === 1 ? 4 : d === 2 ? 0 : d === 3 ? 1 : d === 6 ? 3 : 2;
}
const sameETDay = (a, b) => ET(a).toDateString() === ET(b).toDateString();

/* ---------- live status line for each tile ---------- */
function matchupStats(){
  const m = (S.results || []).filter(r => r.match && r.sev !== "off");
  const pr = r => r.moves ? r.match.meOpt : r.match.me;
  return {n: m.length, fav: m.filter(r => r.match.win >= .5).length, close: m.filter(r => Math.abs(pr(r) - r.match.opp) <= 6).length};
}
function wStatus(id){
  const c = fixCounts(), n = (S.results || []).filter(r => r.sev !== "off").length;
  switch(id){
    case "brief": return {t: `Week ${S.week} is ready`};
    case "teams": return {t: `${n} team${n === 1 ? "" : "s"} to plan`};
    case "edges": return {t: "Rescored for each league"};
    case "waivers": { const w = stepInfo("waivers"); return w && w.badge ? {t: "Claims run tonight", hot:"warn"} : {t: "Before waivers run"}; }
    case "rankings": return {t: "Used across the site"};
    case "exposure": return {t: `Across ${n} league${n === 1 ? "" : "s"}`};
    case "optimizer": return {t: "Every league at once"};
    case "trades": return {t: "Pick a team to start"};
    case "trade": return {t: "Build or paste an offer"};
    case "compare": return {t: "Any two players"};
    case "managers": return {t: "Scout every league-mate"};
    case "offers": { const o = offerStats(); return o.waiting ? {t: `${o.waiting} waiting on an answer`, hot:"info"} : {t: "Copy a trade to track it"}; }
    case "start": return c.startsit ? {t: `${c.startsit} upgrade${c.startsit > 1 ? "s" : ""} found`} : {t: "No close calls yet"};
    case "matchups": { const s = matchupStats(); return s.n ? {t: `Favored in ${s.fav} of ${s.n}${s.close ? ` · ${s.close} close` : ""}`} : {t: "Opens when matchups post"}; }
    case "run": { const q = typeof runQueue === "function" ? runQueue().length : 0; return q ? {t: `${q} league${q > 1 ? "s" : ""} queued`, hot:"warn"} : {t: "Nothing to run yet"}; }
    case "fix": case "live": case "weather": { const st = toolStatus(id); return {t: st.t, hot: st.hot}; }
  }
  return {t: ""};
}

/* ---------- Today's games ---------- */
// every starter of yours, by NFL team, with the leagues they start in
function myStartersByTeam(){
  const by = {};
  for(const r of S.results || []){
    if(!r.current || r.sev === "off") continue;
    for(const pid of r.current){
      if(!pid || pid === "0") continue;
      const f = r._c && r._c[pid] || pinfo(pid, r.league); if(!f || !f.team) continue;
      const t = by[f.team] ||= {}, e = t[pid] ||= {pid, f, lids: new Set()}; e.lids.add(r.league.league_id);
    }
  }
  return by;
}
function gameStarters(g, by){
  const list = g.teams.flatMap(t => Object.values(by[t] || {})), lids = new Set();
  list.forEach(e => e.lids.forEach(l => lids.add(l)));
  return {list, leagues: lids.size};
}
function shortName(pid){ const n = pname(pid).split(" "); return n.length > 1 ? `${n[0][0]}. ${n.slice(1).join(" ")}` : n[0]; }
function todayHTML(){
  const k = S.kick && S.kick[S.week]; if(!k || !k.ok || !S.results.length) return "";
  const now = Date.now(), by = myStartersByTeam();
  const mine = k.games.map(g => ({g, ...gameStarters(g, by)})).filter(x => x.list.length);
  const today = mine.filter(x => sameETDay(x.g.ts, now) && now < x.g.ts + 4*3.6e6);
  if(!today.length){
    const nx = mine.filter(x => x.g.ts > now).sort((a, b) => a.g.ts - b.g.ts)[0]; if(!nx) return "";
    const same = mine.filter(x => Math.abs(x.g.ts - nx.g.ts) < 3.6e6), n = same.reduce((s, x) => s + x.list.length, 0);
    return `<section class="wtoday quiet" data-wtour="today"><div class="wtdh"><span class="wtdl">No games today</span><h2>Next kickoff ${esc(kickLabel(nx.g))}</h2></div>
      <div class="wtdnext"><b>${same.length > 1 ? `${same.length} games` : esc(nx.g.short || nx.g.teams.join(" @ "))}</b><span>${n} of your starters play</span><button class="wtdgo" data-go="weather">See the slate</button></div></section>`;
  }
  const live = x => now >= x.g.ts && now < x.g.ts + 3.5*3.6e6;
  const hurt = x => x.list.some(e => /Questionable|Doubtful|Out/.test(e.f.status || ""));
  // the games that matter most first: still to play or in progress, flagged, most of your starters
  const rank = x => (x.g.ts > now ? 0 : live(x) ? 1 : 3) - (hurt(x) ? 1 : 0) - x.list.length/20;
  today.sort((a, b) => rank(a) - rank(b) || a.g.ts - b.g.ts);
  const MAX = 4, shown = today.slice(0, MAX), more = today.length - shown.length;
  const starters = today.reduce((s, x) => s + x.list.length, 0), lids = new Set(); today.forEach(x => x.list.forEach(e => e.lids.forEach(l => lids.add(l))));
  const night = today.every(x => ET(x.g.ts).getHours() >= 18), word = night ? "tonight" : "today";
  const flag = x => {
    const hurt = x.list.find(e => /Questionable|Doubtful|Out/.test(e.f.status || ""));
    if(hurt) return `<span class="wfl inj">${svgI("injflag", 13)}${esc(shortName(hurt.pid))} ${esc(hurt.f.status.toLowerCase())}</span>`;
    const w = typeof wxGameFlag === "function" ? wxGameFlag(x.g.teams[0]) : null;
    if(w) return `<span class="wfl wx ${w.level}">${svgI("wxflag", 13)}${esc(w.text)}</span>`;
    return `<span class="wfl">${x.g.indoor ? "Indoors" : "No flags"}</span>`;
  };
  return `<section class="wtoday" data-wtour="today"><div class="wtdh"><span class="wtdl">${today.some(live) ? `<i class="wlv"></i>` : ""}${night ? "Tonight's" : "Today's"} games</span><h2>${starters} of your starters play ${word}</h2><small>${today.length} game${today.length === 1 ? "" : "s"} across ${lids.size} league${lids.size === 1 ? "" : "s"}</small></div>
    <div class="wtdrow">${shown.map(x => `<button class="wgm${live(x) ? " live" : ""}" data-go="${live(x) ? "live" : "fix"}"><span class="wgt"><b>${esc(x.g.short || x.g.teams.join(" @ "))}</b><span class="wgk">${live(x) ? `<i class="wlv"></i>Live` : esc(kickLabel(x.g))}</span></span>
      <span class="wgp">${x.list.slice(0, 4).map(e => `<span>${esc(shortName(e.pid))} ${esc(e.f.pos || "")}</span>`).join("")}${x.list.length > 4 ? `<span>+${x.list.length - 4}</span>` : ""}</span>
      <span class="wgf">${flag(x)}<span class="wgl">${x.leagues} league${x.leagues === 1 ? "" : "s"}</span></span></button>`).join("")}</div>${more ? `<button class="wtdmore" data-go="${today.some(live) ? "live" : "weather"}">See ${more} more game${more > 1 ? "s" : ""} with your starters</button>` : ""}</section>`;
}

/* ---------- the page ---------- */
const WLEARN = { get(){ return !store.get("wLearnDone", false); }, done(){ store.set("wLearnDone", true); } };
function wTile(id, defs, hue){
  const t = defs[id]; if(!t) return "";
  const st = wStatus(id), info = WTOOL[id] || {};
  const crit = id === "fix" && fixCounts().fix;
  return `<div class="wtile${crit ? " hot" : ""}" style="--h:${hue}" data-wtool="${id}"><button class="wmain" ${toolAttr(t.how)}><span class="wic">${svgI(t.ic, 20)}</span><span class="wtx"><b>${esc(t.label)}</b><span class="wd">${esc(info.d || "")}</span><span class="ws${st.hot === "crit" ? " crit" : ""}">${esc(st.t || "")}</span></span></button>${crit ? `<span class="wbadge">${crit}</span>` : ""}<button class="winf" data-winfo="${id}" aria-label="How ${esc(t.label)} works">${svgI("info", 16)}</button></div>`;
}
function viewHomeWeek(){
  const defs = toolDefs(), now = weekStage(), c = fixCounts();
  let h = homeHead() + todayHTML();
  if(WLEARN.get()) h += `<section class="wlearn"><div class="wlt"><b>New here? Learn FFU in a minute</b><small>A quick tour of the five stages and where each tool lives.</small></div><button class="wlb" data-wtour-start="1">Start tour</button><button class="wlx" data-wlearn-x="1" aria-label="Hide">×</button></section>`;
  h += `<nav class="wpath" data-wtour="path" aria-label="Your week">${WSTAGES.map((s, k) => `<button class="wpn${k === now ? " now" : ""}" style="--h:${s.hue}" data-wstage="${k}"${k === now ? ' data-wtour="now"' : ""}>${k === now ? `<span class="wnow">NOW</span>` : ""}<span class="wdot">${k + 1}${s.id === "set" && c.fix ? `<span class="wred">${c.fix}</span>` : ""}</span><span class="wnm">${s.name}</span><span class="wwh">${s.when}</span></button>`).join("")}</nav>`;
  h += WSTAGES.map((s, k) => `<section class="wsec${k === now ? " now" : ""}" id="wsec-${k}" style="--h:${s.hue}"><div class="wsh"><span class="wn">${k + 1}</span><h2>${s.name}</h2>${k === now ? `<span class="wnowt">NOW</span>` : ""}<span class="wbl">${s.blurb}</span><span class="wln"></span></div>
    <div class="wgrid">${s.tools.map(id => wTile(id, defs, s.hue)).join("")}</div></section>`).join("");
  h += `<div class="wfoot"><button class="linkb" data-wtour-start="1">How this page works</button></div>`;
  return h + `<div class="statusline" id="statusline"></div>` + homeFoot();
}
{ const _vh = viewHome; viewHome = function(){ return HOME_V.get() === "week" ? (document.body.classList.add("homealt"), viewHomeWeek()) : _vh(); }; }
// the Week Path is the default home; earlier layouts stay one setting away
HOME_V.get = function(){ return store.get("homeV", "week"); };
(()=>{ const q = new URLSearchParams(location.search).get("home"); if(q === "week") HOME_V.set("week");
  if(!store.get("homeWeekMoved", false)){ store.set("homeWeekMoved", true); if(!q) store.set("homeV", "week"); } })();

/* ---------- how-to popups: hover card on desktop, sheet on phone ---------- */
const WPOP = {el:null, scrim:null, t:null, id:null};
function wPopEls(){
  if(!WPOP.el){ WPOP.el = document.createElement("div"); WPOP.el.className = "wpop"; WPOP.el.setAttribute("role", "dialog");
    WPOP.scrim = document.createElement("div"); WPOP.scrim.className = "wscrim"; document.body.append(WPOP.scrim, WPOP.el); }
  return WPOP.el;
}
const wSheet = () => !matchMedia("(hover:hover) and (pointer:fine)").matches || innerWidth < 720;
function wOpenPop(tile){
  const id = tile.dataset.wtool, info = WTOOL[id], defs = toolDefs(), t = defs[id]; if(!info || !t) return;
  const st = WSTAGES.findIndex(s => s.tools.includes(id)), s = WSTAGES[st], el = wPopEls(), sheet = wSheet();
  el.style.setProperty("--h", s.hue);
  el.innerHTML = `<div class="wp1"><span class="wic">${svgI(t.ic, 18)}</span><div><small>${st + 1} · ${s.name}</small><b>${esc(t.label)}</b></div></div><p>${esc(info.what)}</p><div class="wwhen"><b>Use it:</b> ${esc(info.when)}</div>
    <ol>${info.steps.map(x => `<li>${esc(x)}</li>`).join("")}</ol><div class="wpa"><button class="wopen" ${toolAttr(t.how)}>Open ${esc(t.label)}</button><span class="wtm">About ${info.min} min</span>${sheet ? `<button class="wpx" data-wpop-x="1">Close</button>` : ""}</div>`;
  el.classList.toggle("sheet", sheet); WPOP.scrim.classList.toggle("on", sheet);
  if(!sheet){ const r = tile.getBoundingClientRect(), w = 300; let x = r.right + 10; if(x + w > innerWidth - 12) x = r.left - w - 10; if(x < 12) x = Math.min(innerWidth - w - 12, r.left);
    el.style.left = x + "px"; el.style.top = Math.max(12, Math.min(innerHeight - 330, r.top)) + "px"; }
  else { el.style.left = ""; el.style.top = ""; }
  el.classList.add("on"); WPOP.id = id;
}
function wClosePop(){ if(WPOP.el){ WPOP.el.classList.remove("on"); WPOP.scrim.classList.remove("on"); } WPOP.id = null; }
document.addEventListener("mouseover", e => {
  if(wSheet() || WTOUR.on) return;
  const tile = e.target.closest(".wtile"), pop = e.target.closest(".wpop");
  if(pop){ clearTimeout(WPOP.t); return; }
  clearTimeout(WPOP.t);
  if(tile){ if(WPOP.id !== tile.dataset.wtool) WPOP.t = setTimeout(() => wOpenPop(tile), 420); }
  else if(WPOP.id) WPOP.t = setTimeout(wClosePop, 220);
});
document.addEventListener("click", e => {
  const inf = e.target.closest("[data-winfo]");
  if(inf){ e.preventDefault(); e.stopPropagation(); const tile = inf.closest(".wtile"); if(WPOP.id === tile.dataset.wtool && WPOP.el.classList.contains("on")) wClosePop(); else wOpenPop(tile); return; }
  if(e.target.closest("[data-wpop-x]") || e.target.closest(".wscrim")){ wClosePop(); return; }
  if(e.target.closest(".wopen")){ wClosePop(); return; }   // the button's own data-go/opentool does the navigation
  const pn = e.target.closest("[data-wstage]");
  if(pn){ const sec = document.getElementById("wsec-" + pn.dataset.wstage); if(sec){ sec.scrollIntoView({behavior: reduceMotion() ? "auto" : "smooth", block:"start"}); sec.classList.remove("flash"); void sec.offsetWidth; sec.classList.add("flash"); } return; }
  if(e.target.closest("[data-wlearn-x]")){ WLEARN.done(); render(); return; }
  if(e.target.closest("[data-wtour-start]")){ wTourStart(); return; }
  if(WPOP.id && !e.target.closest(".wpop")) wClosePop();
}, true);
addEventListener("scroll", () => { if(WPOP.id && !wSheet()) wClosePop(); }, {passive:true});
document.addEventListener("keydown", e => { if(e.key === "Escape"){ wClosePop(); wTourEnd(); } });

/* ---------- one-minute tour ---------- */
const WTOUR = {on:false, i:0, ring:null, bub:null};
const WSTEPS = [
  {sel:'[data-wtour="today"]', b:"Today's games come first", p:"Every game today that has one of your starters, with kickoff and any weather or injury flag. On days without games it counts down to the next kickoff."},
  {sel:'[data-wtour="path"]', b:"Your week, in order", p:"Every tool lives in one of five stages, from Check in on Tuesday to Game day on Sunday. Tap a stage to jump to its tools."},
  {sel:'[data-wtour="now"]', b:"Where you are now", p:"The glowing stage is where most managers are on this day of the week. Start there if you're short on time."},
  {sel:'.wtile.hot, .wtile', b:"Red means it needs you", p:"Colors show the stage. Red only shows up when something can't wait, like a starter who is out. Clear the red first."},
  {sel:'.wtile .winf', b:"Every tool explains itself", p:"Tap ⓘ, or hover on a computer, to see what a tool does, when to use it and three steps to get going."},
  {sel:'#askq, .askbar, .ask', b:"Stuck? Just ask", p:"Type a question like \"Who should I start at flex?\" and the Crystal Ball picks the right tool for you."}
];
function wTourStart(){
  if(S.view !== "home") go("home");
  wClosePop(); WTOUR.on = true; WTOUR.i = 0;
  WTOUR.ring ||= Object.assign(document.createElement("div"), {className:"wring"});
  WTOUR.bub ||= Object.assign(document.createElement("div"), {className:"wbub"});
  WTOUR.bub.setAttribute("role", "dialog"); document.body.append(WTOUR.ring, WTOUR.bub);
  wTourShow();
}
function wTourShow(){
  const steps = WSTEPS.filter(s => document.querySelector(s.sel)), st = steps[WTOUR.i];
  if(!st){ wTourEnd(); return; }
  const el = document.querySelector(st.sel);
  el.scrollIntoView({block:"center", behavior:"auto"});
  requestAnimationFrame(() => {
    const r = el.getBoundingClientRect(), bw = Math.min(300, innerWidth - 24);
    Object.assign(WTOUR.ring.style, {left:(r.left - 6) + "px", top:(r.top - 6) + "px", width:(r.width + 12) + "px", height:(r.height + 12) + "px"});
    WTOUR.bub.style.width = bw + "px";
    WTOUR.bub.innerHTML = `<span class="wtk">Tour ${WTOUR.i + 1} / ${steps.length}</span><b>${esc(st.b)}</b><p>${esc(st.p)}</p><div class="wta"><button class="wtn">${WTOUR.i === steps.length - 1 ? "Got it" : "Next"}</button><button class="wts">Skip tour</button></div>`;
    WTOUR.bub.style.left = Math.max(12, Math.min(innerWidth - bw - 12, r.left + r.width/2 - bw/2)) + "px";
    const below = r.bottom + 14; WTOUR.bub.style.top = (below + 190 < innerHeight ? below : Math.max(12, r.top - 200)) + "px";
    WTOUR.ring.classList.add("on"); WTOUR.bub.classList.add("on");
    WTOUR.bub.querySelector(".wtn").onclick = () => { WTOUR.i++; if(WTOUR.i >= steps.length){ WLEARN.done(); wTourEnd(); render(); } else wTourShow(); };
    WTOUR.bub.querySelector(".wts").onclick = () => { WLEARN.done(); wTourEnd(); render(); };
    WTOUR.bub.querySelector(".wtn").focus({preventScroll:true});
  });
}
function wTourEnd(){ WTOUR.on = false; WTOUR.ring && WTOUR.ring.classList.remove("on"); WTOUR.bub && WTOUR.bub.classList.remove("on"); }

/* ---------- Matchup Preview ---------- */
const MP = {users:{}, busy:{}};
function mpOpp(r){
  const x = (S.raw || []).find(z => z && z.lg && z.lg.league_id === r.league.league_id); if(!x || !Array.isArray(x.matchups) || !x.mine) return null;
  const me = x.matchups.find(m => m.roster_id === x.mine.roster_id), opp = me && me.matchup_id != null && x.matchups.find(m => m.matchup_id === me.matchup_id && m.roster_id !== me.roster_id);
  if(!opp) return null;
  const ro = (x.rosters || []).find(z => z.roster_id === opp.roster_id), lid = r.league.league_id, users = MP.users[lid] || (typeof LIVE !== "undefined" && LIVE.users[lid]);
  if(!users && !MP.busy[lid]){ MP.busy[lid] = 1; getJSON(`/v1/league/${lid}/users`, {cache:"prefer"}).then(u => { MP.users[lid] = u || []; if(S.view === "matchups") render(); }).catch(() => {}); }
  const u = users && ro && users.find(z => z.user_id === ro.owner_id);
  return u ? ((u.metadata && u.metadata.team_name) || u.display_name || "Opponent") : "Opponent";
}
function viewMatchups(){
  let h = `<section class="pagehead">${backBtn("home","Home")}<h1 class="h1">Matchup Preview</h1><div class="sub">Every head-to-head you're in this week, with your chance to win. Projections are rescored for each league and include game weather.</div></section>`;
  const rows = (S.results || []).filter(r => r.match && r.sev !== "off");
  if(!rows.length) return h + `<div class="glass ccempty">Matchups show up once Sleeper posts this week's schedule for your leagues.</div>`;
  const pr = r => r.moves ? r.match.meOpt : r.match.me, s = matchupStats(), left = rows.reduce((t, r) => t + Math.max(0, r.match.meOpt - r.match.me), 0);
  h += `<section class="glass lvsum"><span class="lvsoon">Week ${S.week}</span><div class="lvstats">
    <div><b class="num">${s.fav}<small>/${s.n}</small></b><span>matchups you're favored in</span></div>
    <div><b class="num">${s.close}</b><span>close enough to swing</span></div>
    <div><b class="num">${left.toFixed(1)}</b><span>points your bench leaves out</span></div></div></section>`;
  rows.sort((a, b) => Math.abs(a.match.win - .5) - Math.abs(b.match.win - .5));
  h += `<section class="mplist">${rows.map(r => { const m = r.match, w = Math.round(m.win*100), gain = m.meOpt - m.me, tone = w >= 60 ? "up" : w <= 40 ? "dn" : "even";
    return `<article class="glass mprow ${tone}"><div class="mptop"><b>${esc(r.league.name)}</b><span class="mpw">${w}%<small> to win</small></span></div>
      <div class="mpbar" aria-hidden="true"><i style="width:${w}%"></i></div>
      <div class="mpsc"><span><small>${gain > .5 ? "Your best lineup" : "You"}</small><b class="num">${m.meOpt.toFixed(1)}</b></span><span class="mpvs">vs</span><span><small>${esc(mpOpp(r) || "Opponent")}</small><b class="num">${m.opp.toFixed(1)}</b></span></div>
      ${gain > .5 ? `<button class="ghost tint sm mpgo" data-go="fix" data-tab="startsit">Start your best lineup for +${gain.toFixed(1)} pts</button>` : `<span class="mpok">Your best lineup is set</span>`}</article>`; }).join("")}</section>`;
  return h + `<p class="src">Win chance compares your best projected lineup with your opponent's starters. Played games count their real points.</p>`;
}

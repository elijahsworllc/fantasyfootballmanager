/* =====================================================================
   Polish sweep (Nov 25, 2026)
   - Long rows of option bubbles become one compact dropdown (chipSelect). Picking an option fires the
     same click the bubble used to, so every view keeps its own logic.
   ===================================================================== */
function chipSelect(label, attr, opts, cur, extra){
  return `<label class="csel"><span class="chiplab">${esc(label)}</span><span class="cselbox"><select data-chipsel="${attr}" aria-label="${esc(label)}">${opts.map(([v, l])=>`<option value="${esc(v)}" ${String(v) === String(cur ?? "") ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></span>${extra || ""}</label>`;
}
document.addEventListener("change", e => {
  const s = e.target.closest("select[data-chipsel]"); if(!s) return;
  const attr = s.dataset.chipsel;
  if(attr === "arch"){ S.bpArch = s.value || null; render(); return; }   // the bubble toggled; the dropdown sets
  const b = document.createElement("button"); b.type = "button"; b.hidden = true; b.setAttribute("data-" + attr, s.value);
  s.closest(".csel").appendChild(b); b.click(); b.remove();
});

/* =====================================================================
   Home layouts (Nov 25, 2026): three low-cost options built from existing parts.
   classic = today's home · focus = one "up next" card + your top tools + teams
   launcher = your tools first, each with a live status line · hub = your leagues as the home, with actions
   Pick with ?home=focus|launcher|hub (remembered) or Settings → Home layout.
   Tools order themselves by how often you open them on this device.
   ===================================================================== */
const HOME_V = { get(){ return store.get("homeV", "classic"); }, set(v){ store.set("homeV", v); } };
(()=>{ const q = new URLSearchParams(location.search).get("home"); if(q && ["classic","focus","launcher","hub"].includes(q)) HOME_V.set(q); })();
const TOOL_ORDER = ["fix","live","trades","trade","waivers","ask","offers","start","run","teams","rankings","managers","edges","exposure","compare","brief"];
function toolDefs(){ const m = {}; for(const [, items] of CC_TOOLS) for(const [id, label, ic, col, how] of items) m[id] = {id, label, ic, col, how}; return m; }
const USE = { all(){ return store.get("toolUse", {}); }, hit(id){ if(!id) return; const u = this.all(); u[id] = (u[id] || 0) + 1; store.set("toolUse", u); } };
// count what people open, from the rail, the dock, the menu or a tool tile
document.addEventListener("click", e => { const el = e.target.closest("[data-go],[data-opentool],[data-nav]"); if(!el || el.closest(".plan")) return;
  const d = el.dataset, id = d.opentool || (d.nav ? ({"teams:value":"teams","players:exposure":"exposure","players:rankings":"rankings"}[d.nav] || d.nav.split(":")[0]) : d.go === "direction" ? "teams" : d.go);
  if(id && id !== "home") USE.hit(id); }, true);
function toolStatus(id){
  const c = fixCounts(), nl = nextLock(), inb = INBOX.all().filter(x=>x.status === "open").length;
  switch(id){
    case "fix": return c.fix ? {t:`${c.fix} must fix${c.monitor ? ` · ${c.monitor} game-time` : ""}`, hot:"crit"} : c.monitor ? {t:`${c.monitor} game-time call${c.monitor > 1 ? "s" : ""}`, hot:"warn"} : {t:"All lineups set"};
    case "live": return typeof LIVE !== "undefined" && LIVE.anyLive ? {t:"Games on now", hot:"live"} : {t: nl ? `Next kickoff ${kickLabel(nl.k)}` : "Scores when games start"};
    case "run": { const q = typeof runQueue === "function" ? runQueue().length : 0; return q ? {t:`${q} league${q > 1 ? "s" : ""}, one at a time`, hot:"warn"} : {t:"Nothing to run"}; }
    case "offers": return inb ? {t:`${inb} waiting on an answer`, hot:"info"} : {t:"Track offers you send"};
    case "waivers": return {t:"Holes to fill, bids that win"};
    case "trades": return {t:"Trades built for each team"};
    case "trade": return {t:"Grade any offer"};
    case "ask": return {t:"Ask anything about your teams"};
    case "start": return {t:"Who to start, side by side"};
    case "teams": return {t:"Contend or rebuild, per team"};
    case "rankings": return {t:"Tiers you can reorder"};
    case "managers": return {t:"Who trades, and how"};
    case "edges": return {t:"Players your scoring rewards"};
    case "exposure": return {t:"Every player across leagues"};
    case "compare": return {t:"Two players, long term"};
    case "brief": return {t:"Your week in two minutes"};
  }
  return {t:""};
}
function topTools(n){
  const defs = toolDefs(), use = USE.all(), inSeason = S.results.some(r=>r.league && r.league.status === "in_season");
  return TOOL_ORDER.filter(id => defs[id] && (id !== "live" || inSeason))
    .map((id, i) => ({id, i, u: use[id] || 0, pin: id === "fix" && fixCounts().fix ? 1 : 0}))
    .sort((a, b) => b.pin - a.pin || b.u - a.u || a.i - b.i).slice(0, n).map(x => defs[x.id]);
}
function toolAttr(how){ return how.go ? `data-go="${how.go}"` : how.tool ? `data-opentool="${how.tool}"` : how.nav ? `data-nav="${how.nav}"` : `data-ccrun="1"`; }
function toolTiles(n, big){
  return `<div class="tgrid${big ? " big" : ""}">${topTools(n).map(t => { const st = toolStatus(t.id);
    return `<button class="ttile glass${st.hot ? " " + st.hot : ""}" style="--tc:${t.col}" ${toolAttr(t.how)}><span class="tic">${svgI(t.ic, big ? 22 : 20)}</span><span class="tt"><b>${esc(t.label)}</b><small>${esc(st.t)}</small></span>${ccBadge(t.id)}</button>`; }).join("")}</div>`;
}
function homeHead(){
  const c = fixCounts();
  return `<section class="hhead"><div class="sub">${S.displayName ? esc(S.displayName) + " · " : ""}${S.season} · week ${S.week}${S.week !== S.nflWeek ? " (next)" : ""}</div>
    <h1 class="h1">${c.fix ? `${c.fix} lineup${c.fix > 1 ? "s" : ""} need${c.fix > 1 ? "" : "s"} you` : "Every lineup is set"}</h1></section>`;
}
function homeFoot(){
  return `${accountCardHTML()}${renderSettings()}<p class="src">Sources: Sleeper (leagues, rosters, injuries, projections rescored with each league's settings) · ESPN (kickoffs) · FFU values from real trades.</p>`;
}
function alsoLine(){
  const items = weekItems().filter(x => !x.calm && !/lineup/i.test(x.title || ""));
  return items.length ? `<div class="also"><span>Also this week</span>${items.slice(0, 3).map(x => `<button class="linkb" ${x.nav ? `data-nav="${x.nav}"` : `data-go="${x.go}"`}>${esc(x.title)}</button>`).join("")}</div>` : "";
}
function runButton(){
  const q = typeof runQueue === "function" ? runQueue().length : 0; if(!q) return "";
  return `<button class="primary runbtn" data-runstart="1">Start game-day run · ${q} league${q > 1 ? "s" : ""} →</button>`;
}
function viewHomeFocus(){
  return homeHead() + nowCardHTML() + runButton() + alsoLine()
    + `<section class="hsec"><div class="sec"><h2 class="h2">Your tools</h2><button class="linkb" data-menu="1">All tools</button></div>${toolTiles(6)}</section>`
    + `<div class="statusline" id="statusline"></div>` + teamsSectionHTML(lockMap()) + homeFoot();
}
function viewHomeLauncher(){
  const atn = teamList().filter(x => x.alert === "crit" || x.alert === "warn").slice(0, 3);
  return homeHead() + toolTiles(8, true)
    + (atn.length ? `<section class="hsec"><div class="sec"><h2 class="h2">Needs you first</h2><button class="linkb" data-go="direction">All teams</button></div><div class="teamrow-list">${atn.map(x => `<button class="trow" data-team="${x.id}"><span class="dotx" style="background:${x.alert === "crit" ? "var(--crit)" : "var(--warn)"}"></span><span class="t"><span class="nm">${esc(x.name)}</span><span class="mt">${esc(x.meta || "")}</span></span><span class="tr">${x.alert === "crit" ? "Fix" : "Check"}</span></button>`).join("")}</div></section>` : "")
    + `<div class="statusline" id="statusline"></div>` + homeFoot();
}
const HUB = {q:""};
function viewHomeHub(){
  const c = fixCounts(), list = teamList(), q = HUB.q.trim().toLowerCase();
  const shown = list.filter(x => !q || x.name.toLowerCase().includes(q));
  const rank = x => x.alert === "crit" ? 0 : x.alert === "warn" ? 1 : x.alert ? 2 : 3;
  shown.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const pills = [c.fix ? `<button class="pill p-crit" data-go="fix" data-tab="fix">${c.fix} must fix</button>` : "", c.monitor ? `<button class="pill p-warn" data-go="fix" data-tab="monitor">${c.monitor} game-time</button>` : "", c.startsit ? `<button class="pill p-up" data-go="fix" data-tab="startsit">${c.startsit} upgrade${c.startsit > 1 ? "s" : ""}</button>` : ""].join("");
  let h = homeHead() + `<section class="hubbar glass"><div class="pills">${pills || `<span class="sub">Nothing urgent</span>`}</div>${runButton()}</section>`;
  h += `<section class="hsec"><div class="sec"><h2 class="h2">Your leagues</h2><span class="sub">${shown.length} of ${list.length}</span></div>
    <input class="search" id="hubq" type="search" placeholder="Find a league" value="${esc(HUB.q)}" autocomplete="off">
    <div class="hublist">${shown.map(x => { const tag = x.alert === "crit" ? `<span class="pill p-crit">Fix</span>` : x.alert === "warn" ? `<span class="pill p-warn">Check</span>` : x.alert === "up" ? `<span class="pill p-up">Upgrade</span>` : "";
      return `<article class="hubrow glass"><button class="hubmain" data-team="${x.id}"><span class="t"><b>${esc(x.name)}</b><small>${esc(x.meta || "")}</small></span>${tag}</button>
        <div class="hubact">${x.alert ? `<button class="ghost tint sm" data-go="fix">Lineup</button>` : ""}<button class="ghost sm" data-team="${x.id}" data-from="trades">Trades</button><a class="ghost sm" href="${leagueLink(x.id)}" target="_blank" rel="noopener">Sleeper ${ICON.ext}</a></div></article>`; }).join("") || `<div class="empty">No leagues match.</div>`}</div></section>`;
  return h + `<div class="statusline" id="statusline"></div>` + homeFoot();
}
document.addEventListener("input", e => { if(e.target.id === "hubq"){ HUB.q = e.target.value; render(); } });
document.addEventListener("change", e => { if(e.target.id === "homeSel"){ HOME_V.set(e.target.value); window.scrollTo({top:0}); render(); } });
document.addEventListener("click", e => { if(e.target.closest("[data-menu]")){ const m = document.getElementById("menuBtn") || document.querySelector("[data-openmenu],#menu"); if(m) m.click(); } });
const _viewHomeClassic = viewHome;
viewHome = function(){ const v = HOME_V.get(); document.body.classList.toggle("homealt", v !== "classic");
  return v === "focus" ? viewHomeFocus() : v === "launcher" ? viewHomeLauncher() : v === "hub" ? viewHomeHub() : _viewHomeClassic(); };

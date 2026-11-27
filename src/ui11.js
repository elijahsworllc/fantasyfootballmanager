/* =====================================================================
   V4 chrome (Nov 25, 2026)
   - Home defaults to the Launcher: the tools live in the middle of the screen.
   - The desktop tool list becomes a slim jump rail that never repeats the screen. It shows only what
     helps right now: Jump (⌘K, every tool, team and league), what needs you, tools related to the page
     you're on (or your recent tools on Home), and a map of the current page. It expands on hover or
     focus and tucks back to icons when you leave it.
   - New header: FFU lockup, the crystal ball inline on desktop, a live status chip, week, account.
   ===================================================================== */
const FFU_MARK = s => `<svg width="${s}" height="${s}" viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="16" rx="15" ry="5.5" fill="none" stroke="url(#lgR)" stroke-width="1.4" stroke-dasharray="3 2.2" transform="rotate(-24 16 16)"/><circle cx="16" cy="16" r="9.5" fill="url(#lgO)"/><circle cx="12.6" cy="12.4" r="2.6" fill="#fff" opacity=".55"/></svg>`;
HOME_V.get = function(){ return store.get("homeV", "launcher"); };
Object.assign(NI, {
  jump:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  anchor:'<path d="M5 7h14M5 12h10M5 17h6"/>',
  recent:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'});
const RELATED = {
  fix:["run","start","weather","live","waivers"], live:["fix","run","weather"], weather:["start","fix","live"], waivers:["fix","exposure","rankings"],
  trades:["trade","offers","managers","compare"], offers:["trade","trades","managers"], managers:["trades","trade","offers"],
  direction:["edges","rankings","trades"], team:["trades","trade","edges"], edges:["rankings","trades","teams"],
  rankings:["edges","exposure","start"], players:["rankings","waivers","fix"], brief:["fix","waivers","trades"], ask:["start","trade","compare"]
};
const RECENT = { all(){ return store.get("toolRecent", []); }, push(id){ if(!id || id === "home") return; const r = this.all().filter(x => x !== id); r.unshift(id); store.set("toolRecent", r.slice(0, 6)); } };
document.addEventListener("click", e => { const el = e.target.closest("[data-go],[data-opentool],[data-nav]"); if(!el) return;
  const d = el.dataset, id = d.opentool || (d.nav ? ({"teams:value":"teams","players:exposure":"exposure","players:rankings":"rankings"}[d.nav] || d.nav.split(":")[0]) : d.go === "direction" ? "teams" : d.go);
  RECENT.push(id); }, true);

// a map of the page you're on: its section headings, so long screens are one tap from any part
function pageMap(){
  const main = $("main"); if(!main) return [];
  const hs = [...main.querySelectorAll(".sec .h2, h2.h2, .rktier, .sec b.h2")].filter(h => h.offsetParent && h.textContent.trim()).slice(0, 8);
  return hs.map((h, i) => { if(!h.id) h.id = "sec-" + i + "-" + h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24); return {id:h.id, label:h.textContent.trim().replace(/\s+\d+$/, "")}; });
}
function railBtn(t, extra){ const st = toolStatus(t.id), b = ccBadge(t.id);
  return `<button class="cci" style="--tc:${t.col}" ${toolAttr(t.how)} title="${esc(t.label)}${st.t ? " · " + esc(st.t) : ""}">${svgI(t.ic, 20)}<span class="cl">${esc(t.label)}${extra || ""}</span>${b}</button>`; }
ccRailHTML = function(){
  const defs = toolDefs(), v = currentView(), act = ccActive(), c = fixCounts();
  const onHome = v === "home";
  let h = `<button class="jrhome" data-go="home" aria-label="Home"${onHome ? ' aria-current="page"' : ""}>${FFU_MARK(30)}<span class="cl">Home</span></button>`;
  h += `<button class="cci jumpb" data-jump="1" aria-label="Jump to any tool, team or league (Command K)">${svgI("jump", 20)}<span class="cl">Jump to…</span><kbd>⌘K</kbd></button>`;
  // what needs you, only when something does
  const now = [];
  if(c.fix && act !== "fix") now.push("fix");
  if(typeof LIVE !== "undefined" && LIVE.anyLive && act !== "live") now.push("live");
  if(INBOX.all().some(x => x.status === "open") && act !== "offers") now.push("offers");
  if(now.length) h += `<div class="ccg"><span class="cl">Needs you</span></div>` + now.map(id => railBtn(defs[id])).join("");
  // related tools for this page; on Home the tools are already on screen, so show recent ones that aren't
  const onScreen = onHome && HOME_V.get() !== "classic" ? new Set(topTools(HOME_V.get() === "launcher" ? 8 : 6).map(t => t.id)) : new Set();
  const key = v === "ask" ? "ask" : v;
  let rel = (RELATED[key] || []).filter(id => defs[id] && id !== act);
  let relLabel = "Related";
  if(onHome || !rel.length){ rel = RECENT.all().filter(id => defs[id] && id !== act && !onScreen.has(id)).slice(0, 4); relLabel = "Recent"; }
  rel = rel.filter(id => !now.includes(id));
  if(rel.length) h += `<div class="ccg"><span class="cl">${relLabel}</span></div>` + rel.map(id => railBtn(defs[id])).join("");
  // where you are on this page
  const map = pageMap();
  if(map.length > 1) h += `<div class="ccg"><span class="cl">On this page</span></div>` + map.map(m => `<button class="cci jrsec" data-anchor="${esc(m.id)}" title="${esc(m.label)}">${svgI("anchor", 18)}<span class="cl">${esc(m.label)}</span></button>`).join("");
  return h + `<div class="jrfill"></div><p class="cccred"><span class="cl">Sky: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener">Solar System Scope</a> (CC BY 4.0)</span></p>`;
};

document.addEventListener("click", e => {
  const a = e.target.closest("[data-anchor]"); if(a){ const t = document.getElementById(a.dataset.anchor); if(t){ const y = t.getBoundingClientRect().top + scrollY - 96; window.scrollTo({top:y, behavior: reduceMotion() ? "auto" : "smooth"}); } return; }
  if(e.target.closest("[data-jump]")){ openJump(); }
});
// Jump: the full menu (every tool, team and league, searchable) with the search box focused
function openJump(){ if(typeof openMenu !== "function") return; openMenu(); setTimeout(() => { const q = document.getElementById("mq2") || document.querySelector("#mpanel input[type=search]"); if(q) q.focus(); }, 60); }
document.addEventListener("keydown", e => {
  if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"){ e.preventDefault(); if(MENU.open) closeMenu(); else openJump(); }
  if(e.key === "/" && !/input|textarea|select/i.test((document.activeElement || {}).tagName || "")){ const q = $("askq"); if(q){ e.preventDefault(); q.focus(); } }
});
// the rail tucks away when the pointer leaves, and stays open while it has keyboard focus
{ let t = null; document.addEventListener("pointerover", e => { const r = e.target.closest("#ccrail"); if(!r) return; clearTimeout(t); r.classList.add("open"); });
  document.addEventListener("pointerout", e => { const r = $("ccrail"); if(!r || r.contains(e.relatedTarget)) return; clearTimeout(t); t = setTimeout(() => { if(!r.contains(document.activeElement)) r.classList.remove("open"); }, 260); });
  document.addEventListener("focusin", e => { const r = $("ccrail"); if(r) r.classList.toggle("open", r.contains(e.target)); });
  document.addEventListener("click", e => { const r = $("ccrail"); if(r && r.contains(e.target) && e.target.closest("button")) setTimeout(() => r.classList.remove("open"), 120); }); }

// header status: games on, or the next lock with a countdown
function headerStatus(){
  const el = $("hstat"); if(!el) return;
  let h = "";
  if(S.results.length){
    if(typeof LIVE !== "undefined" && LIVE.anyLive) h = `<button class="hchip live" data-go="live"><i></i>Live</button>`;
    else { const nl = nextLock(); if(nl) h = `<button class="hchip${hoursTo(nl.k.ts) < 24 ? " hot" : ""}" data-go="fix" title="Next lineup lock">${svgI("recent", 15)}<span>${esc(untilText(nl.k.ts))}</span></button>`; }
  }
  if(el.innerHTML !== h) el.innerHTML = h;
}
{ const _render = render; render = function(){ _render(); try{ headerStatus(); }catch(e){} }; }
setInterval(() => { try{ headerStatus(); }catch(e){} }, 60e3);
// the side column on Home keeps only what isn't already on screen (your movers)
{ const _side = ccSideHTML; ccSideHTML = function(){ let h = _side(); if(currentView() === "home" && HOME_V.get() !== "classic") h = h.replace(/<section class="glass ccs"><h2>Next lock<\/h2>[\s\S]*?<\/section>/, ""); return h; }; }

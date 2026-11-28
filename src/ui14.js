/* ---------- V5 header (Nov 27): hologram banner, High priority red alert, mission feed, fly-bys ----------
   The banner shows the full name on every width. When a lineup has a starter who can't play, a pulsing
   High priority pod appears and the projector line under the name turns red. The mission feed scrolls what
   changed, and every item opens the tool that handles it. Now and then something crosses the banner. */
const HB = {feedKey: ""};

headerStatus = function(){
  const el = $("hstat"), top = $("top"); if(!el) return;
  let h = "", n = 0;
  if(S.results.length){
    n = fixCounts().fix;
    if(n) h = `<button class="hpod hot" data-go="fix" data-tab="fix" title="Lineups with a starter who can't play: out, on bye or an empty slot"><i class="hp"></i>High priority <b>${n}</b></button>`;
  }
  if(el.innerHTML !== h) el.innerHTML = h;
  if(top) top.classList.toggle("alert", n > 0);
  hbFeed();
};

function hbFeed(){
  const el = $("hfeed"); if(!el) return;
  const items = [];
  if(S.results.length){
    try{
      if(typeof LIVE !== "undefined" && LIVE.anyLive) items.push(`<button data-go="live"><i class="r"></i><b>Games on now</b> · live scores</button>`);
      for(const g of outGroups().slice(0, 3)){
        const n = g.rows.length, who = g.f ? `${esc(g.f.full)} can't play` : "Empty starting slot";
        items.push(`<button data-go="fix" data-tab="fix"><i class="r"></i><b>${who}</b> · ${n > 1 ? `${n} lineups` : esc(g.rows[0].r.league.name)}</button>`);
      }
      const c = fixCounts();
      if(c.monitor) items.push(`<button data-go="fix" data-tab="monitor"><i class="a"></i><b>${c.monitor} game-time call${c.monitor > 1 ? "s" : ""}</b> · Questionable starters</button>`);
      if(c.startsit) items.push(`<button data-go="fix" data-tab="startsit"><i></i><b>${c.startsit} lineup upgrade${c.startsit > 1 ? "s" : ""}</b> · bench outscores a starter</button>`);
      const nl = nextLock(); if(nl) items.push(`<button data-go="fix"><i class="a"></i>Next lock <b>${esc(kickLabel(nl.k))}</b></button>`);
      for(const m of (typeof ccMovers === "function" ? ccMovers() : []).slice(0, 4))
        items.push(`<button data-go="rankings"><i class="${m.p > 0 ? "g" : "r"}"></i>${esc(m.name)} <b class="${m.p > 0 ? "up" : "dn"}">${m.p > 0 ? "▲ +" : "▼ "}${Math.round(m.p * 100)}%</b> in 30 days</button>`);
      const open = typeof INBOX !== "undefined" ? INBOX.all().filter(x => x.status === "open").length : 0;
      if(open) items.push(`<button data-go="offers"><i class="v"></i><b>${open} offer${open > 1 ? "s" : ""}</b> waiting on an answer</button>`);
      const wi = typeof stepInfo === "function" ? stepInfo("waivers") : null;
      if(wi && wi.line) items.push(`<button data-go="waivers"><i class="g"></i>Waivers · <b>${esc(wi.line)}</b></button>`);
    }catch(e){}
  }
  const key = items.join("");
  if(key === HB.feedKey) return;
  HB.feedKey = key;
  el.hidden = items.length < 2;
  // twice in a row so the loop is seamless; the copy is skipped by screen readers and the keyboard
  el.innerHTML = items.length < 2 ? "" : `<div class="hft" style="--hfd:${Math.max(28, items.length * 7)}s">${key}<span aria-hidden="true" style="display:contents">${key.replace(/<button /g, '<button tabindex="-1" ')}</span></div>`;
  hbTuck();
}

// scrolling down tucks away everything above the ask bar, however tall that row is at this width
function hbTuck(){ const top = $("top"), row = top && top.querySelector(".toprow"); if(row) top.style.setProperty("--tuckY", (row.offsetHeight + 8) + "px"); }
window.addEventListener("resize", hbTuck, {passive: true});

/* fly-bys: something random crosses the banner every 20 to 45 seconds */
const FLYERS = [
  {w: 46, svg: `<svg width="46" height="10" viewBox="0 0 46 10"><defs><linearGradient id="hfT1" x1="0" x2="1"><stop offset="0" stop-color="#5FD6E6" stop-opacity="0"/><stop offset="1" stop-color="#8FEAF5"/></linearGradient></defs><rect x="0" y="4" width="34" height="2" rx="1" fill="url(#hfT1)"/><path d="M33 2l12 3-12 3 2-3z" fill="#E8EDF2"/></svg>`},
  {w: 60, svg: `<svg width="60" height="12" viewBox="0 0 60 12"><defs><linearGradient id="hfT2" x1="0" x2="1"><stop offset="0" stop-color="#A08CFF" stop-opacity="0"/><stop offset="1" stop-color="#E9E3FF"/></linearGradient></defs><path d="M0 6L52 3.5v5z" fill="url(#hfT2)"/><circle cx="53" cy="6" r="3.2" fill="#fff" style="filter:drop-shadow(0 0 4px #C9B8FF)"/></svg>`},
  {w: 30, spin: true, svg: `<svg width="30" height="20" viewBox="0 0 30 20"><ellipse cx="15" cy="10" rx="13" ry="8" fill="#9A5B2E" stroke="#5E3416" stroke-width="1"/><path d="M8 10h14M11 8.3v3.4M13.7 8.3v3.4M16.3 8.3v3.4M19 8.3v3.4" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/><path d="M4.5 6.5c1 .8 1 6.2 0 7M25.5 6.5c-1 .8-1 6.2 0 7" stroke="#fff" stroke-width="1" fill="none" opacity=".8"/></svg>`},
  {w: 34, spin: true, svg: `<svg width="34" height="18" viewBox="0 0 34 18"><rect x="0" y="6" width="11" height="6" rx="1" fill="#3B5BA8" stroke="#8FEAF5" stroke-width=".6"/><rect x="23" y="6" width="11" height="6" rx="1" fill="#3B5BA8" stroke="#8FEAF5" stroke-width=".6"/><path d="M11 9h12" stroke="#9AA7B5"/><rect x="13" y="4" width="8" height="10" rx="2" fill="#D9DEE8"/><circle cx="17" cy="3" r="1.4" fill="#FF4D6D"/></svg>`},
  {w: 22, spin: true, svg: `<svg width="22" height="18" viewBox="0 0 22 18"><path d="M3 7l5-5 7 1 5 5-2 6-7 3-6-3z" fill="#5A5F73" stroke="#8A90A6" stroke-width=".8"/><circle cx="9" cy="8" r="1.6" fill="#3E4252"/><circle cx="14" cy="11" r="1.1" fill="#3E4252"/></svg>`},
  {w: 40, svg: `<svg width="40" height="18" viewBox="0 0 40 18"><ellipse cx="20" cy="12" rx="18" ry="5" fill="#7A86A8"/><ellipse cx="20" cy="9" rx="8" ry="6" fill="#8FEAF5" opacity=".75"/><circle cx="9" cy="12.5" r="1.2" fill="#E9C77A"/><circle cx="20" cy="14" r="1.2" fill="#E9C77A"/><circle cx="31" cy="12.5" r="1.2" fill="#E9C77A"/></svg>`}
];
function hbFly(){
  const top = $("top");
  setTimeout(hbFly, 20000 + Math.random() * 25000);
  if(!top || top.hidden || document.hidden || reduceMotion() || top.classList.contains("tuck")) return;
  const f = FLYERS[Math.floor(Math.random() * FLYERS.length)], el = document.createElement("div");
  el.className = "hfly"; el.innerHTML = f.svg; top.appendChild(el);
  const W = top.offsetWidth, H = Math.max(40, top.offsetHeight - 30), rtl = Math.random() < .35;
  const y0 = 8 + Math.random() * H * .6, y1 = y0 + (Math.random() * 30 - 15), tilt = Math.atan2(y1 - y0, W) * 57.3;
  const x0 = rtl ? W + 20 : -f.w - 20, x1 = rtl ? -f.w - 20 : W + 20, flip = rtl ? " scaleX(-1)" : "";
  const spin = f.spin ? (rtl ? -1 : 1) * (360 + Math.random() * 360) : 0;
  const a = el.animate([
    {transform: `translate(${x0}px,${y0}px) rotate(${rtl ? -tilt : tilt}deg)${flip}`, opacity: 0},
    {opacity: 1, offset: .08}, {opacity: 1, offset: .92},
    {transform: `translate(${x1}px,${y1}px) rotate(${(rtl ? -tilt : tilt) + spin}deg)${flip}`, opacity: 0}
  ], {duration: 2600 + Math.random() * 2600, easing: "linear"});
  a.onfinish = a.oncancel = () => el.remove();
}
setTimeout(hbFly, 6000);

// the name always fits on one line: shrink it to the space there is (fallback fonts run wider)
function hbFit(){
  const m = $("markBtn"), hl = m && m.querySelector(".hl"); if(!hl || !m.clientWidth) return;
  hl.style.fontSize = "";
  const ic = m.querySelector(".hm"), avail = m.clientWidth - 6 - (ic ? ic.getBoundingClientRect().width + 10 : 0), w = hl.scrollWidth;
  if(w > avail) hl.style.fontSize = Math.max(15, parseFloat(getComputedStyle(hl).fontSize) * avail / w) + "px";
}
window.addEventListener("resize", hbFit, {passive: true});
try{ document.fonts.ready.then(hbFit); }catch(e){}

// the hologram flickers on when the header first appears, and again when you tap it
function hbFlicker(){ const m = $("markBtn"); if(!m || reduceMotion()) return; m.classList.remove("flick"); void m.offsetWidth; m.classList.add("flick"); }
document.addEventListener("click", e => { if(e.target.closest("#markBtn")) hbFlicker(); }, true);
{ const top = $("top"); if(top){ let seen = !top.hidden; new MutationObserver(() => { if(!top.hidden && !seen){ seen = true; hbFit(); hbFlicker(); headerStatus(); hbTuck(); } else if(top.hidden) seen = false; }).observe(top, {attributes: true, attributeFilter: ["hidden"]}); } }


/* =====================================================================
   My Rankings · Team review · tool access
   ===================================================================== */

/* ---------- My Rankings: start from a real source, then make it yours ---------- */
const RK = {mode: store.get("rk:mode", "week"), pos: "ALL", qb: store.get("rk:qb", 2), mine: false, q: ""};
const RK_MODES = [["week","This week"],["ros","Rest of season"],["dyn","Dynasty"]];
function rkKey(){ return `rk:${RK.mode}:${RK.mode === "week" ? S.season + "-" + S.week : RK.qb + "qb"}`; }
function rkSource(){
  // returns [{id, name, pos, team, val, label}] sorted best first, or null while loading
  if(RK.mode === "week"){
    return Object.values(S.proj).filter(e=>e.player && e.player.team && ["QB","RB","WR","TE","K","DEF"].includes(e.player.position) && e.stats && (e.stats.pts_ppr||0) > 0.5)
      .map(e=>({id:e.player_id, name:pname(e.player_id), pos:e.player.position, team:e.player.team, val:e.stats.pts_ppr, label:fmt(e.stats.pts_ppr) + " pts"}))
      .sort((a,b)=>b.val-a.val);
  }
  const key = `${RK.qb}|12|1`, fc = S.fc[key] && S.fc[key].done;
  if(!fc){ fcValues(key).then(v=>{ S.fc[key].done = v; if(S.view === "rankings") render(); }); return null; }
  return Object.entries(fc.players).filter(([,v])=>["QB","RB","WR","TE"].includes(v.pos) && (RK.mode === "ros" ? v.r > 0 : v.v > 0))
    .map(([id,v])=>({id, name:v.name, pos:v.pos, team:(S.proj[id] && S.proj[id].player || {}).team || "", val: RK.mode === "ros" ? v.r : v.v, label:(RK.mode === "ros" ? v.r : v.v).toLocaleString(), age:v.age, trend:v.trend}))
    .sort((a,b)=>b.val-a.val).slice(0, 400);
}
function rkOrder(src){
  const saved = store.get(rkKey(), null), ids = src.map(s=>s.id);
  if(!saved) return ids;
  const have = new Set(ids), out = saved.filter(id=>have.has(id)), placed = new Set(out);
  ids.forEach((id, i)=>{ if(!placed.has(id)) out.splice(Math.min(i, out.length), 0, id); });   // new players slot in at their source rank
  return out;
}
const myRank = {};   // id -> {overall, pos} for the current mode, used by the other tools
function rkCompute(){
  const src = rkSource(); if(!src) return null;
  const by = {}; src.forEach((s,i)=>{ by[s.id] = {...s, srcRank: i+1}; });
  for(const k in myRank) delete myRank[k];
  const order = rkOrder(src), posCount = {}, posSrc = {};
  src.forEach(s=>{ posSrc[s.id] = (posSrc[s.pos] = (posSrc[s.pos]||0) + 1); });
  const rows = order.map((id,i)=>{ const s = by[id]; const pr = (posCount[s.pos] = (posCount[s.pos]||0) + 1); myRank[id] = {overall:i+1, pos:pr, posLabel:s.pos + pr}; return {...s, rank:i+1, posRank:pr, posSrcRank:posSrc[id]}; });
  return {rows, edited: !!store.get(rkKey(), null)};
}
function viewRankings(){
  const data = rkCompute();
  const owned = {}; for(const y of cbLeagues()) for(const p of y.mine.players||[]) owned[p] = (owned[p]||0) + 1;
  const posOpts = RK.mode === "week" ? ["ALL","QB","RB","WR","TE","K","DEF"] : ["ALL","QB","RB","WR","TE"];
  if(!posOpts.includes(RK.pos)) RK.pos = "ALL";
  const mi = RK_MODES.findIndex(m=>m[0] === RK.mode);
  let h = `<section style="display:flex;flex-direction:column;gap:6px"><h1 class="h1">My rankings</h1><div class="sub">Start from the source, then drag players to set your own order. Your ranks show up in Start/Sit and Compare.</div></section>
    <div class="seg" role="tablist" style="--n:3;--i:${mi}">${RK_MODES.map(([k,l])=>`<button role="tab" data-rkmode="${k}" aria-selected="${RK.mode===k}">${k==="week"?`Week ${S.week}`:l}</button>`).join("")}<i aria-hidden="true"></i></div>
    <div class="chips">${posOpts.map(p=>`<button class="chip" data-rkpos="${p}" aria-pressed="${RK.pos===p}">${p==="ALL"?"Overall":p}</button>`).join("")}
      ${RK.mode !== "week" ? `<button class="chip" data-rkqb="${RK.qb===2?1:2}" aria-pressed="false">${RK.qb===2?"Superflex":"1QB"} ⇄</button>` : ""}
      <button class="chip" data-rkmine="1" aria-pressed="${RK.mine}">My players</button></div>`;
  if(!data) return h + `<div class="statusline"><span class="livedot" style="background:var(--violet)"></span>Loading FantasyCalc values…</div>`;
  let rows = data.rows;
  if(RK.pos !== "ALL") rows = rows.filter(r=>r.pos === RK.pos);
  if(RK.mine) rows = rows.filter(r=>owned[r.id]);
  const q = RK.q.trim().toLowerCase(); if(q) rows = rows.filter(r=>r.name.toLowerCase().includes(q));
  const cap = RK.pos === "ALL" && !RK.mine && !q ? 200 : 120;
  h += `<div style="display:flex;gap:8px;align-items:center"><input class="search" id="rkq" type="search" placeholder="Find a player" value="${esc(RK.q)}" autocomplete="off" style="flex:1">${data.edited ? `<button class="ghost" data-rkreset="1">Reset</button>` : ""}</div>
    <section class="rklist glass" id="rklist" data-canDrag="${!q && !RK.mine}">${rows.slice(0, cap).map(r=>{
      const shown = RK.pos === "ALL" ? r.rank : r.posRank, srcR = RK.pos === "ALL" ? r.srcRank : r.posSrcRank, d = srcR - shown;
      return `<div class="rkrow" data-id="${esc(r.id)}"><button class="grip" aria-label="Move ${esc(r.name)}. Arrow keys move it up or down." data-grip="${esc(r.id)}"><svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true"><g fill="currentColor"><circle cx="4" cy="4" r="1.6"/><circle cx="10" cy="4" r="1.6"/><circle cx="4" cy="9" r="1.6"/><circle cx="10" cy="9" r="1.6"/><circle cx="4" cy="14" r="1.6"/><circle cx="10" cy="14" r="1.6"/></g></svg></button>
        <span class="rn">${shown}</span>${headshot(r.id,"mini")}<span class="t"><b>${esc(r.name)}</b><small>${r.pos}${RK.pos==="ALL"?r.posRank:""} · ${esc(r.team||"FA")}${owned[r.id]?` · <span style="color:var(--cyan-2)">yours ×${owned[r.id]}</span>`:""}</small></span>
        <span class="rv">${d ? `<i class="${d>0?"up":"dn"}">${d>0?"▲":"▼"}${Math.abs(d)}</i>` : ""}<small>${esc(r.label)}</small></span></div>`; }).join("")}</section>
    <p class="src">${RK.mode === "week" ? `Source order: Sleeper (Rotowire) week ${S.week} PPR projections.` : `Source order: FantasyCalc ${RK.mode === "ros" ? "redraft (rest of season)" : "dynasty"} values, ${RK.qb === 2 ? "Superflex" : "1QB"}, 12 teams, PPR, built from real trades.`} ▲▼ shows how far you've moved a player from the source. ${RK.mode === "week" ? "Weekly ranks start fresh each week." : ""} Saved on this device.</p>`;
  return h;
}
function rkMove(id, delta){
  const src = rkSource(); if(!src) return;
  let order = rkOrder(src);
  const visible = order.filter(i=>{ const s = src.find(z=>z.id === i); return RK.pos === "ALL" || (s && s.pos === RK.pos); });
  const from = visible.indexOf(id), to = Math.max(0, Math.min(visible.length-1, from + delta)); if(from < 0 || from === to) return;
  const moved = visible.slice(); moved.splice(to, 0, moved.splice(from, 1)[0]);
  if(RK.pos === "ALL") order = moved;
  else { const slots = order.map((i,k)=>visible.includes(i) ? k : -1).filter(k=>k >= 0); slots.forEach((k,n)=>{ order[k] = moved[n]; }); }   // reorder inside the position, keep everyone else's overall slot
  store.set(rkKey(), order);
}
// drag to reorder (touch and mouse), with auto-scroll near the edges
let DRAG = null;
document.addEventListener("pointerdown", e=>{
  const g = e.target.closest("[data-grip]"); if(!g) return;
  const list = $("rklist"); if(!list || list.dataset.candrag === "false") return;
  e.preventDefault();
  const row = g.closest(".rkrow"), rows = [...list.querySelectorAll(".rkrow")], idx = rows.indexOf(row), h = row.getBoundingClientRect().height;
  DRAG = {id:g.dataset.grip, row, rows, idx, h, y0:e.clientY, sy0:window.scrollY, to:idx, pid:e.pointerId};
  S.dragging = true; row.classList.add("dragging"); try{ g.setPointerCapture(e.pointerId); }catch(_){}
  haptic();
});
document.addEventListener("pointermove", e=>{
  if(!DRAG || e.pointerId !== DRAG.pid) return;
  DRAG.y = e.clientY;
  const dy = e.clientY - DRAG.y0 + (window.scrollY - DRAG.sy0), to = Math.max(0, Math.min(DRAG.rows.length-1, DRAG.idx + Math.round(dy/DRAG.h)));
  DRAG.row.style.transform = `translateY(${dy}px) scale(1.02)`;
  if(to !== DRAG.to){ DRAG.to = to; haptic();
    DRAG.rows.forEach((r,i)=>{ if(r === DRAG.row) return; const shift = DRAG.idx < to ? (i > DRAG.idx && i <= to ? -DRAG.h : 0) : (i >= to && i < DRAG.idx ? DRAG.h : 0); r.style.transform = shift ? `translateY(${shift}px)` : ""; }); }
  if(!DRAG.scrolling){ DRAG.scrolling = true; const step = ()=>{ if(!DRAG){ return; } const y = DRAG.y, edge = 90, v = y < edge ? -(edge-y)/6 : y > innerHeight - edge - 70 ? (y - (innerHeight - edge - 70))/6 : 0;
    if(v){ window.scrollBy(0, v); requestAnimationFrame(step); } else DRAG.scrolling = false; }; requestAnimationFrame(step); }
}, {passive:true});
const endDrag = ()=>{ if(!DRAG) return; const d = DRAG; DRAG = null; S.dragging = false;
  d.rows.forEach(r=>{ r.style.transform = ""; }); d.row.classList.remove("dragging");
  if(d.to !== d.idx) rkMove(d.id, d.to - d.idx);
  render(); };
document.addEventListener("pointerup", endDrag); document.addEventListener("pointercancel", endDrag);
document.addEventListener("keydown", e=>{ const g = e.target.closest && e.target.closest("[data-grip]"); if(!g || !["ArrowUp","ArrowDown"].includes(e.key)) return;
  e.preventDefault(); rkMove(g.dataset.grip, e.key === "ArrowUp" ? -1 : 1); render(); const n = document.querySelector(`[data-grip="${CSS.escape(g.dataset.grip)}"]`); if(n) n.focus(); });
document.addEventListener("click", e=>{
  const el = e.target.closest("[data-rkmode],[data-rkpos],[data-rkqb],[data-rkmine],[data-rkreset]"); if(!el) return; const d = el.dataset;
  if(d.rkmode){ RK.mode = d.rkmode; store.set("rk:mode", RK.mode); }
  if(d.rkpos) RK.pos = d.rkpos;
  if(d.rkqb){ RK.qb = +d.rkqb; store.set("rk:qb", RK.qb); }
  if(d.rkmine) RK.mine = !RK.mine;
  if(d.rkreset){ try{ localStorage.removeItem("cc:" + rkKey()); }catch(_){} }
  render();
});
document.addEventListener("input", e=>{ if(e.target.id === "rkq"){ RK.q = e.target.value; render(); } });
// a player's rank in your current list, for the other tools
function rankBadge(id){ if(!Object.keys(myRank).length) rkCompute(); const r = myRank[id]; return r ? `${r.posLabel} <small>#${r.overall}</small>` : "—"; }

/* ---------- Team review: Sleeper-style roster with a decision overlay ---------- */
function teamOverlay(x, st){
  const b = x.b, me = b.me, r = x.r, dir = x.dir, byId = {}; me.pl.forEach(p=>byId[p.id] = p);
  const D = st && st.detail, recs = D ? recsFor(D, dir) : [];
  const away = new Set(), targets = [];
  recs.forEach(([ev])=>{ ev.give.forEach(a=>away.add(a.id)); ev.get.forEach(a=>{ if(a.pos !== "PICK") targets.push({a, team: ev.them.bp.name}); }); });
  const weak = ["QB","RB","WR","TE"].filter(p=>["D","F"].includes(me.grades[p]));
  const core = new Set((dir === "rebuild" ? me.pl.filter(isYoung) : me.pl.filter(p=>me.nowStarters.has(p.id))).sort((a,c)=>(dir==="rebuild"?c.v-a.v:c.r-a.r)).slice(0,3).map(p=>p.id));
  const ins = new Set(r.moves ? r.moves.ins.map(f=>f.pid) : []), outs = new Set(r.moves ? r.moves.outs.filter(Boolean).map(f=>f.pid) : []);
  const tags = id => { const p = byId[id], t = [];
    if(ins.has(id)) t.push(["up","Start this week"]); if(outs.has(id)) t.push(["warn","Bench this week"]);
    if(away.has(id)) t.push(["warn", dir === "rebuild" ? "Sell" : "Trade chip"]);
    if(p){ const tr = p.v ? (p.trend||0)/p.v : 0;
      if(tr >= .05 && !core.has(id)) t.push(["ok", `Sell high +${Math.round(tr*100)}% 30d`]);
      if(tr <= -.08) t.push(["crit", `Value ${Math.round(tr*100)}% 30d`]);
      if(dir === "rebuild" && isOld(p) && p.r >= 500 && !away.has(id)) t.push(["warn", `Sell before decline · age ${Math.floor(p.age)}`]);
      if(dir === "contend" && !me.nowStarters.has(id) && p.v >= 1500 && !away.has(id)) t.push(["info", "Trade chip"]);
      if(core.has(id)) t.push(["ok", dir === "rebuild" ? "Core: keep" : "Core starter"]); }
    return t.slice(0, 2); };
  return {tags, weak, targets, recs, away};
}
function rosterRow(r, pid, slot, ov, weakPos){
  const f = pid && pid !== "0" ? (r._c[pid] ||= pinfo(pid, r.league)) : null, p = f && (x=>x)(f);
  const val = f && TEAMCTX.byId[pid];
  const k = f && f.team ? kickoff(f.team) : null;
  const tags = f ? ov.tags(pid) : [];
  if(slot && f && weakPos.includes(f.pos) && !tags.length) tags.push(["crit", `Weak spot: ${f.pos} graded ${TEAMCTX.grades[f.pos]}`]);
  return `<div class="rrow">${slot ? `<span class="slotp s-${esc(slot.toLowerCase().replace(/[^a-z]/g,""))}">${esc(SLOT_LABEL[slot] || slot)}</span>` : ""}${f ? headshot(pid,"mini") : `<span class="mini pk">—</span>`}
    <span class="t"><b>${f ? esc(f.full) : "Empty"}${f ? statusTag(f) : ""}</b><small>${f ? `${f.pos} · ${esc(f.team || "FA")}${f.game ? ` · ${esc(oppText(f))}` : ""}${k ? ` · ${esc(kickLabel(k))}` : f.reason ? ` · ${esc(f.reason)}` : ""}` : "Nobody in this slot"}</small>
    ${tags.length ? `<span class="otags">${tags.map(([c,l])=>`<i class="ot o-${c}">${esc(l)}</i>`).join("")}</span>` : ""}</span>
    <span class="rv"><b>${f ? fmt(f.eff) : "—"}</b><small>${val && val.v ? val.v.toLocaleString() : ""}</small></span></div>`;
}
const TEAMCTX = {byId:{}, grades:{}};
function viewTeam(){
  const x = teamList().find(z=>z.id === S.teamLid);
  if(!x) return `<button class="ghost back" data-go="home">${ICON.back} My teams</button><div class="empty">That league isn't loaded.</div>`;
  const b = x.b, id = x.id, r = x.r;
  let h = `<button class="ghost back" data-go="home">${ICON.back} My teams</button>`;
  if(!b){ return h + `<section style="display:flex;flex-direction:column;gap:4px"><h1 class="h1" style="font-size:32px">${esc(x.name)}</h1><div class="sub">${esc(x.meta)}</div></section>` + (S.bpLoading ? `<div class="skel" aria-hidden="true"><i style="height:120px"></i><i style="height:300px"></i></div>` : `<div class="empty">${S.bpError ? esc(S.bpError) : "Not enough roster data to review this team."}</div>`); }
  const me = b.me, N = b.N, st = S.sim[id];
  if(!st) setTimeout(()=>ensureSim(id), 0);
  TEAMCTX.byId = {}; me.pl.forEach(p=>TEAMCTX.byId[p.id] = p); TEAMCTX.grades = me.grades;
  const ready = st && st.detail && st.L, t = ready ? st.L.me : null;
  const ov = teamOverlay(x, ready ? st : null);
  const pf = r.roster.settings ? (r.roster.settings.fpts||0) + (r.roster.settings.fpts_decimal||0)/100 : 0;
  // header, Sleeper-style
  h += `<section class="tmhead glass"><span class="tav">${esc(me.name.split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase())}</span><span class="t"><b>${esc(me.name)}</b><small>${esc(x.name)}</small><small>${esc(x.rec)}${pf ? ` · ${Math.round(pf)} PF` : ""}${t ? ` · ${ord(t.stand)} of ${N}` : ""} · ${esc(x.meta.split(" · ").slice(1).join(" · "))}</small></span><a class="openbtn" href="${leagueLink(id)}" target="_blank" rel="noopener">Sleeper ${ICON.ext}</a></section>`;
  // the decision
  const simMode = t ? DIR[t.dir].mode : null, simDir = simMode === "buy" ? "contend" : simMode === "sell" ? "rebuild" : null;
  const agree = !t ? null : x.dir === "none" ? null : simDir === x.dir;
  const certainty = !t ? "Reading the season…" : agree === false ? "Data points the other way" : confidence(t) === "Clear call" ? "Clear call" : confidence(t) === "Lean" ? "Lean" : "Close call";
  const sug = simDir || x.sug;
  h += `<section class="decide glass rise"><div class="lab">Your direction</div><div class="dline"><b class="dn-${x.dir}">${DIR3[x.dir]}</b><span class="cert ${agree===false?"bad":certainty==="Clear call"?"good":""}">${esc(certainty)}</span></div>
    <div class="dirsel" role="radiogroup" aria-label="Team direction">${["contend","none","rebuild"].map(k=>`<button class="${k}" role="radio" data-setdir="${k}" aria-checked="${x.dir===k}">${DIR3[k]}${sug===k?"<small>Data says</small>":""}</button>`).join("")}</div>
    <ul class="evid">${t ? `<li><b>${pct(t.odds.po)}</b> playoff odds, <b>${pct(t.odds.title)}</b> title odds <span class="src">simulated</span></li>` : ""}
      <li>Win-now lineup value <b>${ord(me.nowRank)}</b> of ${N} · future value <b>${ord(me.futRank)}</b> of ${N} <span class="src">FantasyCalc</span></li>
      <li>${me.pl.filter(p=>me.nowStarters.has(p.id) && isOld(p)).length} of your starters are past their position's age peak · value-weighted age <b>${me.age.toFixed(1)}</b></li>
      <li><b>${me.picks.filter(p=>p.round===1).length}</b> first-round picks over the next 3 drafts <span class="src">Sleeper</span></li></ul>
    ${agree === false ? `<p class="callout" style="margin:0">The season simulation and your roster values point to <b>${DIR3[simDir]}</b>. ${esc(headline(st.L, t))}</p>` : t ? `<p class="sub" style="margin:0">${esc(headline(st.L, t))}</p>` : ""}</section>`;
  // first steps
  const steps = [];
  const seenGive = new Set();
  ov.recs.filter(([ev])=>{ const k = ev.give.map(g=>g.id).join("|") + ">" + (ev.mode === "buy" ? ev.get[0].id : ""); if(seenGive.has(k) || (ev.mode === "sell" && seenGive.has(ev.give[0].id))) return false; seenGive.add(k); seenGive.add(ev.give[0].id); return true; }).slice(0,2).forEach(([ev,mode])=>steps.push(mode === "buy" ? `Offer ${ev.give.map(a=>a.name).join(" + ")} to ${ev.them.bp.name} for ${ev.get.map(a=>a.name).join(" + ")}` : `Sell ${ev.give.map(a=>a.name).join(" + ")} to ${ev.them.bp.name} for ${ev.get.map(a=>a.name).join(" + ")}`));
  if(ov.weak.length && x.dir !== "rebuild") steps.push(`Upgrade ${ov.weak.join(" and ")}: graded ${ov.weak.map(p=>me.grades[p]).join("/")} against this league`);
  const old = me.pl.filter(p=>isOld(p) && p.r >= 500 && !ov.away.has(p.id)).sort((a,c)=>c.r-a.r).slice(0,2);
  if(x.dir === "rebuild" && old.length) steps.push(`Shop ${old.map(p=>`${p.name} (${Math.floor(p.age)})`).join(" and ")} to the contenders before their value slides`);
  if(r.sev === "crit") steps.push("Fix this week's lineup first: a starter can't play");
  if(steps.length) h += `<section class="steps glass"><div class="lab">First steps</div><ol>${steps.slice(0,4).map(s=>`<li>${esc(s)}</li>`).join("")}</ol>${!ready ? `<div class="statusline"><span class="livedot" style="background:var(--violet)"></span>${esc((st && st.phase) || "Finding trades")}…</div>` : ""}</section>`;
  // roster, Sleeper-style
  const reserve = new Set(r.roster.reserve||[]), taxi = new Set(r.roster.taxi||[]), starters = new Set(r.current||[]);
  const bench = (r.roster.players||[]).filter(p=>!starters.has(p) && !reserve.has(p) && !taxi.has(p)).sort((a,c)=>((TEAMCTX.byId[c]||{}).v||0)-((TEAMCTX.byId[a]||{}).v||0));
  h += `<section class="roster glass"><div class="rsec">Starters<span>${r.slots ? fmt(r.projCur) : ""} proj</span></div>${(r.slots||[]).map((s,i)=>rosterRow(r, r.current[i], s, ov, ov.weak)).join("")}
    <div class="rsec">Bench</div>${bench.map(p=>rosterRow(r, p, "BN", ov, [])).join("")}
    ${taxi.size ? `<div class="rsec">Taxi</div>${[...taxi].map(p=>rosterRow(r, p, "TX", ov, [])).join("")}` : ""}
    ${reserve.size ? `<div class="rsec">IR</div>${[...reserve].map(p=>rosterRow(r, p, "IR", ov, [])).join("")}` : ""}
    <p class="src" style="padding:0 14px 12px;margin:0">Points: this week's Sleeper projection in this league's scoring. Small number: FantasyCalc dynasty value. Tags come from the trade finder, 30-day value trends, age and your direction.</p></section>`;
  // trades
  h += `<section style="display:flex;flex-direction:column;gap:10px"><div class="sec"><h2 class="h2">Trades that fit</h2><span class="sub">${DIR3[x.dir]}</span></div>`;
  if(!st || st.busy) h += `<div class="skel" aria-hidden="true"><i style="height:150px"></i><i style="height:150px"></i></div>`;
  else if(st.error) h += `<div class="empty">${esc(st.error)}</div>`;
  else h += ov.recs.length ? ov.recs.map(([ev,mode],i)=>recHTML(st.L, ev, mode, i)).join("") : `<div class="empty">No clean trades found in this league right now.</div>`;
  h += `</section>`;
  if(ov.targets.length) h += `<section class="steps glass"><div class="lab">Players to trade for</div>${ov.targets.slice(0,5).map(z=>`<div class="rrow">${headshot(z.a.id,"mini")}<span class="t"><b>${esc(z.a.name)}</b><small>${z.a.pos}${z.a.age ? " · " + Math.floor(z.a.age) : ""} · on ${esc(z.team)}</small></span><span class="rv"><b>${Math.round(z.a.v).toLocaleString()}</b><small>value</small></span></div>`).join("")}</section>`;
  return h;
}

/* ---------- tool access from Home ---------- */
const TOOL_TILES = [
  ["start","Start / Sit","Head to head", `<path d="M7 5v14M17 5v14" stroke="#8FEAF5" stroke-width="1.8"/><path d="M3 12h4M17 12h4M10 9l2 3-2 3M14 9l-2 3 2 3" stroke="#fff" stroke-width="1.6"/>`],
  ["trade","Trade","Build & check", `<path d="M5 8h12l-3-3M19 16H7l3 3" stroke="#C9B8FF" stroke-width="1.8"/>`],
  ["compare","Compare","Long-term", `<path d="M4 18l5-6 4 3 7-9" stroke="#8FEAF5" stroke-width="1.8"/><path d="M4 14l5-2 4 1 7-5" stroke="#C9B8FF" stroke-width="1.6" opacity=".8"/>`],
  ["rankings","Rankings","Yours, drag to set", `<path d="M5 6h3M5 12h3M5 18h3" stroke="#F2CF7E" stroke-width="2"/><path d="M11 6h8M11 12h6M11 18h4" stroke="#fff" stroke-width="1.8"/>`],
  ["waivers","Waivers","Adds & bids", `<circle cx="12" cy="12" r="8" stroke="#8FEAF5" stroke-width="1.8"/><path d="M12 8v8M8 12h8" stroke="#fff" stroke-width="1.8"/>`],
  ["players","Exposure","Who you own", `<circle cx="9" cy="8" r="3.2" stroke="#C9B8FF" stroke-width="1.8"/><path d="M3 20c.8-3.4 3.2-5.3 6-5.3s5.2 1.9 6 5.3" stroke="#C9B8FF" stroke-width="1.8"/><path d="M16 5a3 3 0 0 1 0 6M18 14.8c1.8.7 2.9 2.4 3.2 5" stroke="#8FEAF5" stroke-width="1.6"/>`]
];
function toolsGridHTML(){
  return `<section style="display:flex;flex-direction:column;gap:10px"><div class="sec"><h2 class="h2">Tools</h2></div><div class="tgrid">${TOOL_TILES.map(([k,l,s,svg])=>`<button class="ttile glass" data-opentool="${k}"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${svg}</svg><b>${l}</b><small>${s}</small></button>`).join("")}</div></section>`;
}
document.addEventListener("click", e=>{ const el = e.target.closest("[data-opentool]"); if(!el) return; const k = el.dataset.opentool;
  if(["start","trade","compare"].includes(k)){ TOOL.mode = k; CB.mode = k; CB.a = []; CB.b = []; CB.qa = ""; TOOL.sub = "matchup"; go("ask"); }
  else go(k); });

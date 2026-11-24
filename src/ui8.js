/* =====================================================================
   V3 "command center" look (Nov 23, 2026): photographic Milky Way, dark glass,
   desktop tool rail + side column, Scoring Edges and Managers.
   On by default; Settings → Look → Classic (or ?classic) brings back the V2 look.
   ===================================================================== */
const CC = {on:false};
(function(){
  let on = store.get("look", "cc") !== "classic";
  try{ const q = new URLSearchParams(location.search); if(q.has("classic")) on = false; if(q.has("cc")) on = true; }catch(_){}
  CC.on = on; document.body.classList.toggle("cc", on);
})();
Object.assign(NI, {
  managers:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3.2 3.2 0 0 1 0 6.2M18 14.3c1.8.8 3 2.6 3 4.7"/>',
  edges:'<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  run:'<path d="M5 12h14M13 6l6 6-6 6"/>'
});
VIEWS.add("edges"); VIEWS.add("managers");

/* ---------- the sky: Solar System Scope 8K Milky Way (from ESO imagery, CC BY 4.0), color-graded ---------- */
const SKY = {on:false, dimT:1, setFocus(on){ this.dimT = on ? .78 : 1; }};
function skyInit(){
  if(!CC.on || SKY.on) return;
  const cv = document.createElement("canvas"); cv.id = "sky"; cv.setAttribute("aria-hidden", "true"); document.body.insertBefore(cv, document.body.firstChild);
  let gl = null; try{ gl = cv.getContext("webgl", {antialias:false, alpha:false, powerPreference:"high-performance"}); }catch(e){}
  if(!gl){ cv.remove(); document.body.classList.add("cc-flat"); return; }
  SKY.on = true;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, "attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}"));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, "precision highp float;varying vec2 v;uniform sampler2D T;uniform mat3 M;uniform float tanH,asp,dim;" +
    "void main(){vec3 d=normalize(M*vec3(v.x*tanH*asp,v.y*tanH,-1.));float lon=atan(d.x,-d.z);float lat=asin(clamp(d.y,-1.,1.));" +
    "vec2 uv=vec2(lon/6.2831853+.5,.5-lat/3.1415927);vec3 c=texture2D(T,uv).rgb;float vg=1.-.3*dot(v*vec2(.8,1.),v*vec2(.8,1.));gl_FragColor=vec4(c*dim*vg,1.);}"));
  gl.linkProgram(pr); gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {M:gl.getUniformLocation(pr, "M"), tanH:gl.getUniformLocation(pr, "tanH"), asp:gl.getUniformLocation(pr, "asp"), dim:gl.getUniformLocation(pr, "dim")};
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([3, 5, 15]));
  const aniso = gl.getExtension("EXT_texture_filter_anisotropic") || gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
  let level = 0;
  const upload = (img, lv) => { if(lv < level) return; level = lv;
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if(aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT))); };
  const load = (src, lv, next) => { const im = new Image(); im.decoding = "async"; im.onload = () => { upload(im, lv); if(next) next(); }; im.src = src; };
  const big = gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 8192 && window.innerWidth > 700 && !(navigator.connection && navigator.connection.saveData);
  load("sky-4k.jpg", 1, big ? () => load("sky-8k.jpg", 2) : null);
  let W = 0, H = 0, fov = 58, dim = 1; const look = {x:0, y:0, tx:0, ty:0};
  const baseFov = () => innerWidth/innerHeight < .9 ? 74 : 58;
  const resize = () => { const dpr = Math.min(window.devicePixelRatio || 1, 2); W = Math.round(innerWidth*dpr); H = Math.round(innerHeight*dpr); cv.width = W; cv.height = H; gl.viewport(0, 0, W, H); };
  addEventListener("resize", resize); resize();
  addEventListener("pointermove", e => { look.tx = e.clientX/innerWidth - .5; look.ty = e.clientY/innerHeight - .5; }, {passive:true});
  const mul = (m, n) => { const o = []; for(let c = 0; c < 3; c++) for(let r = 0; r < 3; r++) o[c*3+r] = m[r]*n[c*3] + m[3+r]*n[c*3+1] + m[6+r]*n[c*3+2]; return o; };
  const mat = (yaw, pitch, roll) => { const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    return mul([cy,0,-sy, 0,1,0, sy,0,cy], mul([1,0,0, 0,cp,sp, 0,-sp,cp], [cr,sr,0, -sr,cr,0, 0,0,1])); };
  const reduce = reduceMotion(), t0 = performance.now(); let last = t0;
  const frame = now => { requestAnimationFrame(frame); if(document.hidden) return;
    const dt = Math.min(.05, (now - last)/1000); last = now; const t = reduce ? 0 : (now - t0)/1000;
    look.x += (look.tx - look.x)*Math.min(1, dt*1.5); look.y += (look.ty - look.y)*Math.min(1, dt*1.5);
    const fovT = baseFov() - (SKY.dimT < 1 ? 3 : 0); fov += (fovT - fov)*Math.min(1, dt*2.5); dim += (SKY.dimT - dim)*Math.min(1, dt*2.5);
    const warp = typeof SPACE !== "undefined" ? SPACE.warp || 0 : 0;
    gl.uniformMatrix3fv(U.M, false, new Float32Array(mat(.06 + Math.sin(t*2*Math.PI/600)*.3 - look.x*.03, -.13 + Math.sin(t*2*Math.PI/420)*.025 + look.y*.02, -.27 + Math.sin(t*2*Math.PI/900)*.02)));
    gl.uniform1f(U.tanH, Math.tan((fov - warp*14)*Math.PI/360)); gl.uniform1f(U.asp, W/H); gl.uniform1f(U.dim, dim);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
  requestAnimationFrame(frame);
}

/* ---------- desktop rail and side column ---------- */
const CC_TOOLS = [
  ["Overview", [["home","Home","home","#46E6F5",{go:"home"}], ["ask","Crystal Ball","orb","#B9A6FF",{go:"ask"}]]],
  ["Game day", [["fix","Lineups","lineups","#FF5C7A",{go:"fix"}], ["start","Start / Sit","start","#5CB8FF",{tool:"start"}], ["waivers","Waivers","waivers","#4BE3A0",{go:"waivers"}], ["run","Game-day Run","run","#FFC15C",{run:1}], ["brief","Weekly Brief","brief","#7BE38F",{go:"brief"}]]],
  ["Trades", [["trades","Trade Finder","trades","#46E6F5",{go:"trades"}], ["trade","Trade Check","swaps","#5CE1E6",{tool:"trade"}], ["offers","Offers","offers","#9B7BFF",{go:"offers"}], ["managers","Managers","managers","#FF9A5C",{go:"managers"}, 1], ["compare","Compare","compare","#F25CD4",{tool:"compare"}]]],
  ["Teams", [["teams","Team Outlook","diagnose","#8B7BFF",{nav:"teams:value"}], ["edges","Scoring Edges","edges","#FFE066",{go:"edges"}, 1], ["exposure","Exposure","exposure","#FFB25C",{nav:"players:exposure"}], ["rankings","Rankings","rankings","#5CE1E6",{go:"rankings"}]]]
];
function ccActive(){
  const v = S.view;
  if(v === "ask") return ["start","trade","compare"].includes(TOOL.mode) ? TOOL.mode : "ask";
  if(v === "direction") return "teams";
  if(v === "players") return S.ptab === "exposure" ? "exposure" : "home";
  if(v === "team") return S.navFrom === "trades" ? "trades" : S.navFrom === "teams" ? "teams" : "home";
  return v;
}
function ccBadge(id){
  if(!S.results.length) return "";
  if(id === "fix"){ const c = fixCounts().fix; return c ? `<span class="ccb crit">${c}</span>` : ""; }
  if(id === "offers"){ const n = INBOX.all().filter(x=>x.status === "open").length; return n ? `<span class="ccb info">${n}</span>` : ""; }
  if(id === "run"){ const q = typeof runQueue === "function" ? runQueue().length : 0; return q ? `<span class="ccb warn">${q}</span>` : ""; }
  return "";
}
function ccRailHTML(){
  const act = ccActive();
  return CC_TOOLS.map(([g, items]) => `<div class="ccg">${g}</div>` + items.map(([id, label, ic, col, how, isNew]) => {
    const attr = how.go ? `data-go="${how.go}"` : how.tool ? `data-opentool="${how.tool}"` : how.nav ? `data-nav="${how.nav}"` : `data-ccrun="1"`;
    const b = ccBadge(id);
    return `<button class="cci" style="--tc:${col}" ${attr}${act === id ? ' aria-current="page"' : ""}>${svgI(ic, 20)}<span>${label}</span>${b || (isNew ? `<em class="ccnew">New</em>` : "")}</button>`; }).join("")).join("")
    + `<p class="cccred">Sky: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener">Solar System Scope</a>, from ESO imagery (CC BY 4.0).</p>`;
}
function ccSideHTML(){
  const c = fixCounts(), nl = nextLock(), open = INBOX.all().filter(x=>x.status === "open").length, q = [];
  if(c.fix) q.push(["var(--crit)", `${c.fix} lineup${c.fix>1?"s":""} to fix`, "Starters who can't play", `data-go="fix" data-tab="fix"`]);
  if(c.monitor) q.push(["var(--warn)", `${c.monitor} game-time decision${c.monitor>1?"s":""}`, "Questionable starters", `data-go="fix" data-tab="monitor"`]);
  if(c.startsit) q.push(["var(--cyan)", `${c.startsit} upgrade${c.startsit>1?"s":""}`, "Bench players who outscore a starter", `data-go="fix" data-tab="startsit"`]);
  if(open) q.push(["var(--violet)", `${open} offer${open>1?"s":""} waiting`, "Logged in your inbox", `data-go="offers"`]);
  const wi = stepInfo("waivers"); q.push(["var(--ok)", "Waivers", wi.line || "Holes to fill and bids", `data-go="waivers"`]);
  let h = `<section class="glass ccs"><h2>Needs attention</h2>${q.map(x=>`<button class="ccq" ${x[3]}><i style="background:${x[0]};box-shadow:0 0 10px ${x[0]}"></i><span><b>${esc(x[1])}</b><small>${esc(x[2])}</small></span></button>`).join("")}</section>`;
  if(nl) h += `<section class="glass ccs"><h2>Next lock</h2><div class="ccnext"><b class="num">${esc(kickLabel(nl.k))}</b><small>${nl.n} league${nl.n > 1 ? "s" : ""} with a decision lock then${nl.fix ? ` · ${nl.fix} must fix` : ""}</small></div></section>`;
  const mv = ccMovers();
  if(mv.length) h += `<section class="glass ccs"><h2>Your movers · 30 days</h2>${mv.map(m=>`<div class="ccmv"><span>${esc(m.name)} <small>${m.pos}</small></span><b class="num ${m.p > 0 ? "up" : "dn"}">${m.p > 0 ? "+" : ""}${Math.round(m.p*100)}%</b></div>`).join("")}</section>`;
  return h;
}
function ccMovers(){
  if(!S.bp) return [];
  const seen = {}, out = [];
  for(const b of S.bp) for(const p of b.me.pl){ if(seen[p.id] || !p.trend || (p.mv || p.v) < 1200) continue; seen[p.id] = 1;
    const base = Math.max(1, (p.mv || p.v) - p.trend); out.push({name:pname(p.id), pos:p.pos, p:p.trend/base}); }
  const up = out.filter(x=>x.p > .02).sort((a,b)=>b.p - a.p).slice(0, 3), dn = out.filter(x=>x.p < -.02).sort((a,b)=>a.p - b.p).slice(0, 3);
  return up.concat(dn);
}
function ccSync(){
  if(!CC.on) return;
  let rail = $("ccrail"), side = $("ccside");
  if(!rail){ rail = document.createElement("nav"); rail.id = "ccrail"; rail.className = "ccrail glass"; rail.setAttribute("aria-label", "Tools"); document.body.insertBefore(rail, $("main")); }
  if(!side){ side = document.createElement("aside"); side.id = "ccside"; side.className = "ccside"; side.setAttribute("aria-label", "This week"); $("main").after(side); }
  const ready = !!S.results.length && !["connect","loading"].includes(currentView());
  document.body.classList.toggle("cc-ready", ready);
  rail.hidden = side.hidden = !ready;
  if(!ready) return;
  const rh = ccRailHTML(); if(rail.innerHTML !== rh) rail.innerHTML = rh;
  const sh = ccSideHTML(); if(side.innerHTML !== sh) side.innerHTML = sh;
  SKY.setFocus(!["home","connect","loading"].includes(currentView()));
}
{ const _render = render; render = function(){ _render(); try{ ccSync(); }catch(e){ console.warn(e); } }; }

/* ---------- Scoring Edges: players worth more (or less) in your leagues' rules than they cost ---------- */
const EDG = {tab:"buy"};
function edgesData(){
  if(!S.bp) return null;
  const by = {};
  for(const b of S.bp){ const lg = b.lg;
    for(const t of b.teams){ const mine = t === b.me;
      for(const p of t.pl){ const mv = p.mv || p.v; if(!p.adj || p.adj.src !== "player" || mv < 900) continue;
        const e = by[p.id] ||= {id:p.id, name:pname(p.id), pos:p.pos, age:p.age, v:mv, mine:[], other:[]};
        // cost: what trades in the FFU database already pay over market for him (in-house factor), so a priced-in edge isn't counted twice
        const cost = p.ffu && p.ffu.f ? p.ffu.f - 1 : 0;
        (mine ? e.mine : e.other).push({lid:lg.league_id, lg:lg.name, rel:p.adj.rel, cost, edge:p.adj.rel - 1 - cost, team:t.name, rid:t.rid}); } } }
  const all = Object.values(by), med = (a, k) => median(a.map(x=>x[k]));
  const fin = e => ({...e, edge:med(e.at, "edge"), sc:med(e.at, "rel") - 1, cost:med(e.at, "cost")});
  const buy = all.map(e=>({...e, at:e.other.filter(x=>x.edge >= .07).sort((a,b)=>b.edge - a.edge)})).filter(e=>e.at.length).map(fin)
    .sort((a,b)=>(b.edge*Math.sqrt(b.at.length)*Math.log(b.v)) - (a.edge*Math.sqrt(a.at.length)*Math.log(a.v))).slice(0, 14);
  const hold = all.map(e=>({...e, at:e.mine.filter(x=>x.edge >= .07).sort((a,b)=>b.edge - a.edge)})).filter(e=>e.at.length).map(fin).sort((a,b)=>b.edge*b.at.length - a.edge*a.at.length).slice(0, 12);
  const sell = all.map(e=>({...e, at:e.mine.filter(x=>x.edge <= -.07).sort((a,b)=>a.edge - b.edge)})).filter(e=>e.at.length).map(fin).sort((a,b)=>a.edge*b.at.length - b.edge*a.at.length).slice(0, 12);
  return {buy, hold, sell, leagues:S.bp.length};
}
function viewEdges(){
  if(!S.bp && !S.bpLoading) loadBlueprints();
  let h = `<section class="pagehead">${backBtn("home","Home")}<h1 class="h1">Scoring Edges</h1><div class="sub">Trade prices follow standard scoring. Your leagues don't play standard scoring. These players score more, or less, in each league's own rules than their price assumes.</div></section>`;
  const d = edgesData();
  if(!d) return h + `<div class="statusline"><span class="livedot" style="background:var(--violet)"></span>Scoring every player in your leagues' rules…</div><div class="skel" aria-hidden="true"><i style="height:90px"></i><i style="height:300px"></i></div>`;
  const tabs = [["buy","Buy", d.buy.length], ["hold","Hold", d.hold.length], ["sell","Sell", d.sell.length]], ti = tabs.findIndex(x=>x[0] === EDG.tab);
  h += `<div class="seg" role="tablist" style="--n:3;--i:${ti}">${tabs.map(([k,l,n])=>`<button role="tab" data-edtab="${k}" aria-selected="${EDG.tab === k}">${l} <small class="num">${n}</small></button>`).join("")}<i aria-hidden="true"></i></div>`;
  const rows = d[EDG.tab], blurb = {buy:"On other teams, scoring more in that league than the price says. Trade for them at market.", hold:"On your roster and underpriced for your scoring. Don't sell them at market price.", sell:"On your roster and overpriced for your scoring. Market price is more than they're worth to you."}[EDG.tab];
  h += `<p class="sub" style="margin:2px 0 0">${blurb}</p>`;
  if(!rows.length) h += `<div class="glass ccempty">Nothing here right now. Edges show up when a player scores at least 7% more or less in a league's rules than his trade price allows for.</div>`;
  else h += `<div class="cclist">${rows.map((e, i)=>{ const pct = Math.round(e.edge*100), best = e.at[0];
    const sgn = x => (x >= 0 ? "+" : "") + Math.round(x*100) + "%";
    const where = e.at.slice(0, 3).map(x=>`${esc(x.lg)}: scores <span class="num">${sgn(x.rel - 1)}</span>${Math.abs(x.cost) >= .01 ? `, costs <span class="num">${sgn(x.cost)}</span>` : ""}${EDG.tab === "buy" ? ` · ${esc(x.team)}` : ""}`).join("<br>") + (e.at.length > 3 ? `<br><span class="sub">+${e.at.length - 3} more</span>` : "");
    const act = EDG.tab === "buy" ? `<button class="ghost tint" data-edbuild="${esc(JSON.stringify({lid:best.lid, rid:best.rid, get:[{uid:e.id, id:e.id}], give:[]}))}">Build offer</button>`
      : EDG.tab === "sell" ? `<button class="ghost tint" data-edbuild="${esc(JSON.stringify({lid:best.lid, rid:null, give:[{uid:e.id, id:e.id}], get:[]}))}">Shop him</button>` : "";
    return `<article class="glass ccrow" style="--i:${i}"><div class="ccrow-main"><b>${esc(e.name)} <small>${e.pos}${e.age ? " · " + Math.floor(e.age) : ""}</small></b><span class="sub">${where}</span></div>
      <div class="ccrow-side"><b class="num ${pct >= 0 ? "up" : "dn"}">${pct >= 0 ? "+" : ""}${pct}%</b><small>${e.at.length} league${e.at.length > 1 ? "s" : ""} · ${n0v(e.v)}</small>${act}</div></article>`; }).join("")}</div>`;
  h += `<div class="glass ccnote"><b>Why this works</b><span>85 of the 89 leagues we calibrated on use TE premium, yet across 143 real trades the side getting the tight end paid only 0.5% more than market (FFU calibration, Nov 2026). Managers price players on standard scoring. Scores = points per game in that league's rules vs standard scoring, compared with a typical starter. Costs = what trades in the FFU database already pay over market for him (in-house values). Edge = scores minus costs.</span></div>`;
  return h;
}
const n0v = v => Math.round(v).toLocaleString("en-US");

/* ---------- Managers: how every league-mate actually trades ---------- */
const MG = {data:null, busy:false, err:null, sort:"fit"};
const MGDB_URL = "https://raw.githubusercontent.com/elijahsworllc/fantasyfootballmanager/data/managers.json";
let MGDB_P = null;
function loadMgdb(){ return MGDB_P ||= fetch(MGDB_URL + "?h=" + Math.floor(Date.now()/3.6e6)).then(r=>r.ok ? r.json() : null).catch(()=>null); }
const ARCH_DIR = a => ["jugg","win"].includes(a) ? "Contender" : ["build","reset"].includes(a) ? "Rebuilder" : "Middle";
async function buildManagers(){
  if(MG.busy) return; MG.busy = true; MG.err = null; render();
  try{
    if(!S.bp) await loadBlueprints();
    const [tx, db] = await Promise.all([loadTx(), loadMgdb()]), rows = [], owners = {};
    MG.db = db ? {trades:db.trades, priced:db.priced, n:Object.keys(db.users || {}).length, built:db.built} : null;
    const CATS = (db && db.cats) || ["QB","RB","WR","TE","Picks"];
    for(const b of S.bp || []) for(const t of b.teams) if(t !== b.me && t.owner) owners[t.owner] = (owners[t.owner] || 0) + 1;
    for(const b of S.bp || []){
      const lg = b.lg, lid = lg.league_id, fc = await fcValues(fcKey(lg));
      const val = id => (fc.players[id] || {}).v || 0, posOf = id => (fc.players[id] || {}).pos || ((S.proj[id] || {}).player || {}).position || "?";
      const pval = p => { const on = ["1st","2nd","3rd","4th"][p.round - 1]; return on ? (fc.picks[`${p.season} ${on}`] || (fc.picks[`${p.season - 1} ${on}`] || 0)*.9 || 300) : 250; };
      const trades = (tx.byLeague[lid] || []).filter(x=>x.type === "trade" && x.status === "complete" && x.rids.length === 2);
      const myDir = ARCH_DIR(b.me.arch);
      for(const t of b.teams){ if(t === b.me) continue;
        const mine = trades.filter(x=>x.rids.includes(t.rid)), recv = {QB:0,RB:0,WR:0,TE:0,Picks:0}, sent = {QB:0,RB:0,WR:0,TE:0,Picks:0}, prem = [];
        let last = 0;
        for(const x of mine){ last = Math.max(last, x.ts || 0); const got = [], gave = [];
          for(const [pid, rid] of Object.entries(x.adds)){ const v = val(pid), pos = posOf(pid), k = recv[pos] != null ? pos : null;
            if(rid === t.rid){ got.push({v}); if(k) recv[k] += v; } else { gave.push({v}); if(k) sent[k] += v; } }
          for(const p of x.picks){ const v = pval(p); if(p.to === t.rid){ got.push({v}); recv.Picks += v; } else if(p.from === t.rid){ gave.push({v}); sent.Picks += v; } }
          const g = pmOf(got), s = pmOf(gave); if(g > 0 && s > 0) prem.push((s - g)/Math.max(g, s)); }
        const top = o => { const e = Object.entries(o).sort((a,b)=>b[1]-a[1])[0]; return e && e[1] > 0 ? e[0] : null; };
        let buys = top(recv), sells = top(sent), pm = prem.length ? median(prem) : null, n = mine.length, lgs = 1, pmN = prem.length, buyPm = null, buyShare = null, src = "local";
        const dir = ARCH_DIR(t.arch), prof = db && db.users && t.owner ? db.users[t.owner] : null, exd = db && db.excluded && t.owner ? db.excluded[t.owner] : null;
        if(prof && prof[0] >= n){   // the whole FFU database, valued on each trade's own day
          const arg = a => { const m = Math.max(...a); return m > 0 ? a.indexOf(m) : -1; }, bi = arg(prof[6]), si2 = arg(prof[7]);
          n = prof[0]; last = Math.max(last, prof[1]*864e5); lgs = prof[2]; pm = prof[4] == null ? null : prof[4]/1000; pmN = prof[5];
          buys = bi >= 0 ? CATS[bi] : null; sells = si2 >= 0 ? CATS[si2] : null; buyShare = bi >= 0 ? prof[6][bi] : null;
          buyPm = prof[8] && prof[8][1] >= 2 ? prof[8][0]/1000 : null; src = "db"; }
        const act = Math.min(1, n/(src === "db" ? 16 : 6)), rec = !last ? 0 : (Date.now() - last) < 30*864e5 ? 1 : (Date.now() - last) < 90*864e5 ? .5 : .2;
        const comp = (myDir === "Contender" && dir === "Rebuilder") || (myDir === "Rebuilder" && dir === "Contender") ? 1 : myDir === dir && dir !== "Middle" ? .25 : .6;
        const surplus = buys && buys !== "Picks" ? b.me.posRank[buys] <= Math.ceil(b.N/3) : buys === "Picks" ? b.me.picks.length > 0 : false;
        const fit = Math.round(100*(.35*act + .3*comp + .15*rec + .2*(surplus ? 1 : 0)));
        // the pitch: something of yours they keep paying for, without giving up your best at that spot
        let pitch = null;
        if(buys && buys !== "Picks" && surplus){ const at = b.me.pl.filter(p=>p.pos === buys).sort((a,c)=>c.v - a.v); const pk = at[1] && at[1].v >= 800 ? at[1] : null; if(pk) pitch = {txt:`Shop ${pname(pk.id)} (${buys})`, give:[{uid:pk.id, id:pk.id}]}; }
        else if(buys === "Picks" && myDir === "Contender" && b.me.picks.length){ const pk = b.me.picks.slice().sort((a,c)=>c.val - a.val)[0]; pitch = {txt:`Shop your ${pickLabel(pk)}`, give:[{uid:`PK:${pk.season}-${pk.round}-${pk.orig}`, id:"PICK:" + pickLabel(pk)}]}; }
        rows.push({lid, lg:lg.name, rid:t.rid, name:t.name, rec:t.rec, dir, n, lgs, last, buys, buyShare, buyPm, sells, pm, pmN, src, fit, pitch, ex:exd, more:Math.max(0, (owners[t.owner] || 1) - 1)});
      }
    }
    MG.data = rows;
  }catch(e){ MG.err = "Couldn't read trade history: " + (e.message || e); }
  MG.busy = false; render();
}
function viewManagers(){
  let h = `<section class="pagehead">${backBtn("home","Home")}<h1 class="h1">Managers</h1><div class="sub">How every league-mate actually trades, from every trade they've made this season in the FFU database: what they buy, what they sell, how they price it, and how likely they are to deal with you.</div></section>`;
  if(MG.err) return h + `<div class="err">${esc(MG.err)}</div>`;
  if(!MG.data){ if(!MG.busy) setTimeout(buildManagers, 0);
    return h + `<div class="statusline"><span class="livedot" style="background:var(--violet)"></span>Reading this season's trades in ${(S.raw||[]).filter(x=>x.mine).length} leagues…</div><div class="skel" aria-hidden="true"><i style="height:120px"></i><i style="height:320px"></i></div>`; }
  const sorts = [["fit","Best fit"], ["n","Most active"], ["pm","Pays the most"]], si = sorts.findIndex(x=>x[0] === MG.sort);
  h += `<div class="seg" role="tablist" style="--n:3;--i:${si}">${sorts.map(([k,l])=>`<button role="tab" data-mgsort="${k}" aria-selected="${MG.sort === k}">${l}</button>`).join("")}<i aria-hidden="true"></i></div>`;
  const rows = MG.data.slice().sort((a,b)=> MG.sort === "n" ? b.n - a.n || b.fit - a.fit : MG.sort === "pm" ? ((b.pm ?? -9) - (a.pm ?? -9)) : b.fit - a.fit).slice(0, 30);
  const price = pm => pm == null ? "No trades to judge yet" : pm > .05 ? `Pays ~${Math.round(pm*100)}% over` : pm < -.05 ? `Wins trades by ~${Math.round(-pm*100)}%` : "Trades near even";
  h += `<div class="ccgrid">${rows.map((m, i)=>{ const col = m.fit >= 70 ? "var(--ok)" : m.fit >= 45 ? "var(--warn)" : "var(--crit)";
    return `<article class="glass ccmgr" style="--i:${i}"><div class="ccmgr-h"><div><b>${esc(m.name)}</b><small>${esc(m.lg)} · ${m.dir}${m.rec ? " · " + esc(m.rec) : ""}${m.more ? ` · in ${m.more + 1} of your leagues` : ""}</small>${m.ex ? `<small class="ccx">High-volume account: ${m.ex[0]} trades in ${m.ex[1]} leagues this season, so it's left out of FFU values</small>` : ""}</div><div class="ccfit"><b class="num" style="color:${col}">${m.fit}</b><small>trade fit</small></div></div>
      <dl><dt>Trades this season</dt><dd class="num">${m.n}${m.src === "db" && m.lgs > 1 ? ` in ${m.lgs} leagues` : ""}${m.last ? ` · last ${esc(ago(m.last))}` : ""}</dd><dt>Buys</dt><dd>${m.buys ? m.buys + (m.buyShare ? ` · ${m.buyShare}% of value in` : "") : "–"}</dd><dt>Sells</dt><dd>${m.sells || "–"}</dd><dt>Pricing</dt><dd>${price(m.pm)}${m.pmN ? ` <small class="sub">(${m.pmN})</small>` : ""}</dd>${m.buyPm != null && m.buys ? `<dt>Buying ${m.buys}</dt><dd>${price(m.buyPm)}</dd>` : ""}</dl>
      <div class="ccpitch">${m.pitch ? `<span><small>Best pitch</small>${esc(m.pitch.txt)}</span><button class="ghost tint" data-edbuild="${esc(JSON.stringify({lid:m.lid, rid:m.rid, give:m.pitch.give, get:[]}))}">Build it</button>` : `<span><small>Best pitch</small>${m.n ? "Nothing of yours lines up with what they buy" : "No trades this season: low odds"}</span><button class="ghost" data-edbuild="${esc(JSON.stringify({lid:m.lid, rid:m.rid, give:[], get:[]}))}">Open</button>`}</div></article>`; }).join("")}</div>`;
  h += `<div class="glass ccnote"><b>How this is worked out</b><span>${MG.db ? `Trades: every completed trade this season in the FFU database (${MG.db.trades.toLocaleString()} trades, ${MG.db.n.toLocaleString()} managers), not just your leagues. Pricing: the median gap in their trades, each valued with the market on the day it happened, so later value swings don't count against them (number in brackets = trades priced). Managers we haven't crawled yet fall back to your leagues at today's values.` : `Trades: completed trades this season in your leagues. Pricing: the median gap in their trades at today's values.`} Buys and sells: the positions (or picks) they've taken in and sent out most, by value. Accounts trading at extreme volume (hundreds of trades across dozens of leagues) are left out of FFU values and profiles; their card uses your leagues only. Trade fit (0–100): 35% how often they trade, 30% whether their direction complements yours, 20% whether you're strong where they buy, 15% how recently they traded.</span></div>`;
  return h;
}

/* ---------- wiring ---------- */
document.addEventListener("change", e=>{ if(e.target.id === "lookSel"){ store.set("look", e.target.value); location.reload(); } });
document.addEventListener("click", e=>{
  const t = e.target.closest("[data-edtab],[data-edbuild],[data-mgsort],[data-ccrun]"); if(!t) return;
  if(t.dataset.ccrun){ if(typeof startRun === "function") startRun(); return; }
  if(t.dataset.edtab){ EDG.tab = t.dataset.edtab; render(); return; }
  if(t.dataset.mgsort){ MG.sort = t.dataset.mgsort; render(); return; }
  if(t.dataset.edbuild){ try{ loadIntoBuilder(JSON.parse(t.dataset.edbuild), false); }catch(err){ console.warn(err); } }
});
// fresh data from Sleeper rebuilds the managers list next time it's opened
{ const _ra = typeof runAnalysis === "function" ? runAnalysis : null; if(_ra){ runAnalysis = function(){ MG.data = null; return _ra.apply(this, arguments); }; } }
skyInit();

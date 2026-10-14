
/* =====================================================================
   V2 UI: space background, particle crystal ball, screens
   ===================================================================== */
const reduceMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
const sleep = ms => new Promise(r=>setTimeout(r, ms));

/* ---------- space background: nebulae, stars, shooting stars, floating football things ---------- */
const SPACE = {
  t:0, last:0, items:[], shots:[], nextItem:1.2, nextShot:1.6, inten:0.85, target:0.85, frame:0, warp:0, warpTarget:0, warpFrom:null, ws:null,
  init(){
    const rnd = Math.random;
    this.stars = [];
    for(let i = 0; i < 260; i++){ const d = i < 160 ? 0.2 : i < 235 ? 0.5 : 1;
      this.stars.push({x:rnd(), y:rnd(), d, s: d===1 ? 1.2+rnd() : d===0.5 ? 0.7+rnd()*0.6 : 0.4+rnd()*0.5, ph:rnd()*6.28, tw:0.4+rnd()*1.8, c: rnd()<0.18 ? "#BFD0FF" : rnd()<0.1 ? "#FFDDB8" : "#FFFFFF"}); }
    try{ const g = document.createElement("canvas"); g.width = 160; g.height = 160; const gx = g.getContext("2d"), img = gx.createImageData(160,160);
      for(let i = 0; i < img.data.length; i += 4){ const v = 120 + Math.random()*135; img.data[i] = img.data[i+1] = img.data[i+2] = v; img.data[i+3] = Math.random()*40; }
      gx.putImageData(img, 0, 0); $("grain").style.backgroundImage = `url(${g.toDataURL()})`; }catch(e){}
    this.reduce = reduceMotion();
    const loop = now => { requestAnimationFrame(loop); if(document.hidden) return; this.frame++; if(this.frame % 2 && this.warp < .02 && this.warpTarget < .02) return; this.draw(now); };
    requestAnimationFrame(loop);
  },
  spawn(W, H, mid){
    const kinds = ["football","football","helmet","trophy","goalpost","jersey"], k = kinds[Math.floor(Math.random()*kinds.length)];
    const left = Math.random() < 0.5, depth = 0.55 + Math.random()*0.75, sp = (10 + Math.random()*16)*depth;
    this.items.push({k, depth, x: mid ? W*(0.15+Math.random()*0.7) : (left ? -50 : W+50), y: H*(0.08+Math.random()*0.84),
      vx: (left ? 1 : -1)*sp, vy:(Math.random()-0.5)*6, rot:Math.random()*6.28, vr:(Math.random()-0.5)*0.5, life:0});
  },
  item(c, it){
    const col = {football:"#C77A4A", helmet:"#8FEAF5", trophy:"#F2CF7E", goalpost:"#F2CF7E", jersey:"#B9A6FF"}[it.k];
    c.save(); c.translate(it.x, it.y); c.rotate(it.rot); c.scale(it.depth, it.depth);
    c.globalAlpha = (0.2 + 0.3*it.depth) * Math.min(1, it.life/1.5) * this.inten;
    c.lineCap = "round"; c.lineJoin = "round"; c.lineWidth = 1.6; c.shadowColor = col; c.shadowBlur = 12;
    if(it.k === "football"){
      const g = c.createRadialGradient(-6,-5,1,0,0,20); g.addColorStop(0,"#E0A070"); g.addColorStop(.55,"#8A4526"); g.addColorStop(1,"#2E140A");
      c.fillStyle = g; c.beginPath(); c.ellipse(0,0,19,11,0,0,6.283); c.fill();
      c.shadowBlur = 0; c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-7,0); c.lineTo(7,0);
      for(let k = -2; k <= 2; k++){ c.moveTo(k*2.8,-2.4); c.lineTo(k*2.8,2.4); } c.moveTo(-15,-5); c.lineTo(-15,5); c.moveTo(15,-5); c.lineTo(15,5); c.stroke();
    } else {
      c.strokeStyle = col; c.beginPath();
      if(it.k === "helmet"){ c.moveTo(-18,8); c.bezierCurveTo(-21,-14,0,-22,14,-12); c.bezierCurveTo(20,-6,20,4,16,8); c.lineTo(4,8); c.lineTo(2,14); c.lineTo(-14,14); c.closePath();
        c.moveTo(16,-2); c.lineTo(27,-2); c.lineTo(27,12); c.lineTo(13,12); c.moveTo(17,5); c.lineTo(27,5); c.moveTo(-8,-18); c.quadraticCurveTo(6,-18,12,-10); c.moveTo(1,2); c.arc(-2,2,3,0,6.283); }
      else if(it.k === "trophy"){ c.moveTo(-12,-16); c.lineTo(12,-16); c.quadraticCurveTo(12,4,0,6); c.quadraticCurveTo(-12,4,-12,-16);
        c.moveTo(-12,-12); c.quadraticCurveTo(-20,-11,-18,-4); c.quadraticCurveTo(-16,0,-10,-2); c.moveTo(12,-12); c.quadraticCurveTo(20,-11,18,-4); c.quadraticCurveTo(16,0,10,-2);
        c.moveTo(0,6); c.lineTo(0,12); c.moveTo(-9,12); c.lineTo(9,12); c.lineTo(9,17); c.lineTo(-9,17); c.closePath(); }
      else if(it.k === "goalpost"){ c.moveTo(0,22); c.lineTo(0,2); c.moveTo(-17,2); c.lineTo(17,2); c.moveTo(-17,2); c.lineTo(-17,-24); c.moveTo(17,2); c.lineTo(17,-24); }
      else { c.moveTo(-8,-16); c.lineTo(-18,-11); c.lineTo(-22,-1); c.lineTo(-14,1); c.lineTo(-13,18); c.lineTo(13,18); c.lineTo(14,1); c.lineTo(22,-1); c.lineTo(18,-11); c.lineTo(8,-16); c.quadraticCurveTo(0,-10,-8,-16); }
      c.stroke();
      if(it.k === "jersey"){ c.shadowBlur = 6; c.fillStyle = col; c.font = '800 13px "Barlow Condensed", sans-serif'; c.textAlign = "center"; c.fillText("12", 0, 10); }
    }
    c.restore();
  },
  draw(now){
    const cv = $("space"); if(!cv) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1), W = window.innerWidth, H = window.innerHeight;
    if(cv.width !== Math.round(W*dpr) || cv.height !== Math.round(H*dpr)){ cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr); }
    const c = cv.getContext("2d"), dt = Math.min(0.08, (now - (this.last||now))/1000); this.last = now;
    if(!this.reduce) this.t += dt;
    this.inten += (this.target - this.inten) * Math.min(1, dt*2);
    this.warp += (this.warpTarget - this.warp) * Math.min(1, dt*(this.warpTarget > this.warp ? 1.7 : 1.1));
    const t = this.t, I = this.inten, Wp = this.warp;
    c.setTransform(dpr,0,0,dpr,0,0); c.globalCompositeOperation = "source-over"; c.globalAlpha = 1; c.shadowBlur = 0;
    const bg = c.createLinearGradient(0,0,W*0.3,H); bg.addColorStop(0,"#060818"); bg.addColorStop(.45,"#0A0C22"); bg.addColorStop(1,"#04060D");
    c.fillStyle = bg; c.fillRect(0,0,W,H);
    c.globalCompositeOperation = "lighter";
    const M = Math.max(W, 420);
    for(const n of [[W*.1+Math.sin(t*.05)*30, H*.22, M*.9, "123,92,255", .2], [W*.95, H*.62+Math.cos(t*.04)*30, M*.85, "60,196,214", .12], [W*.65+Math.cos(t*.06)*20, H*.05, M*.6, "224,123,255", .1], [W*.2, H*.95, M*.8, "70,100,255", .11]]){
      const g = c.createRadialGradient(n[0],n[1],0,n[0],n[1],n[2]); g.addColorStop(0,`rgba(${n[3]},${(n[4]*I).toFixed(3)})`); g.addColorStop(1,`rgba(${n[3]},0)`); c.fillStyle = g; c.fillRect(0,0,W,H); }
    for(const s of this.stars){ const y = ((s.y*H - t*3*s.d) % H + H) % H, x = s.x*W, a = (0.35+0.55*s.d)*(0.55+0.45*Math.sin(t*s.tw+s.ph));
      c.globalAlpha = a*(1 - Wp*.75); c.fillStyle = s.c; c.fillRect(x-s.s/2, y-s.s/2, s.s, s.s);
      if(s.d === 1 && s.s > 1.8){ c.globalAlpha = a*0.3; c.fillRect(x-s.s*2.4, y-.25, s.s*4.8, .5); c.fillRect(x-.25, y-s.s*2.4, .5, s.s*4.8); } }
    c.globalAlpha = 1;
    // hyperspace: streaks rushing out of the crystal ball
    if(Wp > .01 && !this.reduce){
      if(!this.ws){ this.ws = []; for(let i = 0; i < 420; i++) this.ws.push({a:Math.random()*6.283, r:Math.random()*Math.hypot(W,H)*.6, s:.5+Math.random()*1.3, c:["#FFFFFF","#C9B8FF","#8FEAF5","#FFFFFF"][i%4]}); }
      const f = this.warpFrom || {x:W/2, y:H/2}, m = Math.min(1, Wp*1.3), cx = f.x + (W/2 - f.x)*m, cy = f.y + (H/2 - f.y)*m, maxR = Math.hypot(W,H)*.62;
      const tg = c.createRadialGradient(cx,cy,0,cx,cy,maxR*.7); tg.addColorStop(0,`rgba(160,140,255,${(.32*Wp).toFixed(3)})`); tg.addColorStop(.4,`rgba(60,196,214,${(.1*Wp).toFixed(3)})`); tg.addColorStop(1,"rgba(0,0,0,0)");
      c.globalAlpha = 1; c.fillStyle = tg; c.fillRect(0,0,W,H);
      c.lineCap = "round";
      for(const st of this.ws){
        const r0 = st.r; st.r += (24 + st.r*(.6 + Wp*4.2)) * dt * (.35 + Wp*2.2);
        if(st.r > maxR){ st.r = 2 + Math.random()*40; st.a = Math.random()*6.283; continue; }
        const len = Math.min(st.r*.85, (st.r - r0)*(1.5 + Wp*9)), ca = Math.cos(st.a), sa = Math.sin(st.a);
        c.globalAlpha = Math.min(1, st.r/maxR*2.4) * Wp; c.strokeStyle = st.c; c.lineWidth = st.s*(.5 + st.r/maxR*1.8);
        c.beginPath(); c.moveTo(cx + ca*(st.r-len), cy + sa*(st.r-len)); c.lineTo(cx + ca*st.r, cy + sa*st.r); c.stroke();
      }
      c.globalAlpha = 1;
    }
    if(!this.reduce){
      this.nextShot -= dt;
      if(this.nextShot <= 0){ const L = Math.random() < .5, ang = (.35 + Math.random()*.5);
        this.shots.push({x: L ? Math.random()*W*.6 : W*.4 + Math.random()*W*.6, y: Math.random()*H*.45, dx: Math.cos(ang)*(L?1:-1), dy: Math.sin(ang), sp: 520+Math.random()*420, len: 70+Math.random()*90, l:0});
        this.nextShot = 2.5 + Math.random()*6.5; }
      this.shots = this.shots.filter(sh=>{ sh.l += dt; const a = Math.max(0, 1-sh.l/1.1), hx = sh.x + sh.dx*sh.sp*sh.l, hy = sh.y + sh.dy*sh.sp*sh.l;
        const g = c.createLinearGradient(hx-sh.dx*sh.len, hy-sh.dy*sh.len, hx, hy); g.addColorStop(0,"rgba(185,166,255,0)"); g.addColorStop(1,`rgba(255,255,255,${(.95*a).toFixed(2)})`);
        c.strokeStyle = g; c.lineWidth = 1.5; c.beginPath(); c.moveTo(hx-sh.dx*sh.len, hy-sh.dy*sh.len); c.lineTo(hx, hy); c.stroke();
        const hg = c.createRadialGradient(hx,hy,0,hx,hy,6); hg.addColorStop(0,`rgba(220,235,255,${(.8*a).toFixed(2)})`); hg.addColorStop(1,"rgba(220,235,255,0)"); c.fillStyle = hg; c.fillRect(hx-6,hy-6,12,12);
        return sh.l < 1.1; });
      c.globalCompositeOperation = "source-over";
      if(!this.seeded){ this.spawn(W, H, true); this.seeded = true; }
      this.nextItem -= dt;
      if(this.nextItem <= 0 && this.items.length < 3){ this.spawn(W, H, false); this.nextItem = 3 + Math.random()*6; }
      this.items = this.items.filter(it=>{ it.life += dt; it.x += it.vx*dt; it.y += it.vy*dt; it.rot += it.vr*dt; this.item(c, it); return it.x > -80 && it.x < W+80 && it.y > -80 && it.y < H+80; });
    }
    c.globalCompositeOperation = "source-over"; c.globalAlpha = 1; c.shadowBlur = 0;
    const vg = c.createRadialGradient(W/2, H*.45, Math.min(W,H)*.35, W/2, H*.5, Math.max(W,H)*.75); vg.addColorStop(0,"rgba(2,3,8,0)"); vg.addColorStop(1,"rgba(2,3,8,.6)");
    c.fillStyle = vg; c.fillRect(0,0,W,H);
  }
};

/* ---------- the crystal ball: particles with gravity ---------- */
const ORB = {
  mode:"in", boost:0, phase:0, think:0, pulse:0, t:0, rot:.6, vel:.0045, tilt:-.28, ptr:null, pp:null, pvx:0, pvy:0, shock:null, drag:null, cv:null,
  init(){
    const N = window.innerWidth < 500 ? 2000 : 2600, P = [], rnd = Math.random, TAU = Math.PI*2, pick = a => a[Math.floor(rnd()*a.length)];
    const add = o => { const a = rnd()*TAU, r = 2 + rnd()*2.4; o.sx = Math.cos(a)*r; o.sy = -1.8 + rnd()*3.8; o.sz = Math.sin(a)*r; o.ph = rnd()*TAU; o.tw = .6 + rnd()*.9; o.ox = o.oy = o.vx = o.vy = 0; P.push(o); };
    const ns = Math.round(N*.5);
    for(let i = 0; i < ns; i++){ const y = 1 - 2*(i+.5)/ns, r = Math.sqrt(1-y*y), th = i*2.399963;
      add({k:0, x:Math.cos(th)*r, y, z:Math.sin(th)*r, d:(y+1)*.38 + rnd()*.14, c: y > .35 ? "#8FEAF5" : y < -.35 ? "#7B5CFF" : "#B9A6FF", s:1.5, al:.9}); }
    for(let i = 0, n = Math.round(N*.26); i < n; i++){ const r0 = .08 + .74*Math.sqrt(rnd()), arm = Math.floor(rnd()*3);
      add({k:1, r0, a0: arm*TAU/3 + r0*3.2 + (rnd()-.5)*.7, w:.55/(.25+r0), y0:(rnd()-.5)*.5*(1-r0*.7), d:.35 + rnd()*.45, c: rnd() < .06 ? "#FFFFFF" : pick(["#F2A9E8","#B9A6FF","#7B5CFF","#E07BFF"]), s:1.8, al:.75}); }
    for(let i = 0, n = Math.round(N*.11); i < n; i++) add({k:2, r0:1.42 + (rnd()-.5)*.05, a0:i/n*TAU, d:.75 + rnd()*.25, c:"#3CC4D6", s:1.3, al:.85});
    for(let i = 0, n = Math.round(N*.05); i < n; i++){ const a0 = i/n*TAU; if(Math.floor(a0/TAU*28) % 2) continue; add({k:3, r0:1.62, a0, d:.85 + rnd()*.15, c:"#7FDCE8", s:1.2, al:.7}); }
    const lv = [[-1.1,.52],[-1.2,.68],[-1.32,.6]];
    for(let i = 0, n = Math.round(N*.06); i < n; i++){ const l = lv[i%3], a = rnd()*TAU; add({k:4, x:Math.cos(a)*l[1], y:l[0], z:Math.sin(a)*l[1], d:rnd()*.12, c:"#5A7CFF", s:1.3, al:.75}); }
    while(P.length < N){ const a = rnd()*TAU, r = 1.15 + rnd()*.95; add({k:5, x:Math.cos(a)*r, y0:rnd()*3.2, z:Math.sin(a)*r, d:.5 + rnd()*.5, c:"#C9D2DB", s:1.1, al:.35}); }
    this.P = P; this.reduce = reduceMotion(); this.last = performance.now();
    const loop = now => { requestAnimationFrame(loop); if(document.hidden) return; this.frame(now); };
    requestAnimationFrame(loop);
    // pointer: one set of listeners on the document, applied to whichever orb canvas is on screen
    const local = e => { const cv = this.cv; if(!cv) return null; const b = cv.getBoundingClientRect(); if(!b.width) return null; return {x:(e.clientX-b.left)/b.width, y:(e.clientY-b.top)/b.height, inside: e.clientX>=b.left && e.clientX<=b.right && e.clientY>=b.top && e.clientY<=b.bottom}; };
    document.addEventListener("pointerdown", e=>{ if(e.target.id !== "orb") return; this.drag = {x:e.clientX, y:e.clientY, r:this.rot, t:this.tilt, lx:e.clientX, moved:0}; try{ e.target.setPointerCapture(e.pointerId); }catch(_){} });
    document.addEventListener("pointermove", e=>{ const p = local(e); this.ptr = p && (p.inside || this.drag) ? p : null; const d = this.drag; if(!d) return;
      const dx = e.clientX-d.x, dy = e.clientY-d.y; d.moved = Math.max(d.moved, Math.abs(dx)+Math.abs(dy));
      this.rot = d.r + dx*.012; this.tilt = Math.max(-.95, Math.min(.5, d.t + dy*.006)); this.vel = (e.clientX-d.lx)*.012; d.lx = e.clientX; }, {passive:true});
    document.addEventListener("pointerup", ()=>{ if(this.drag && this.drag.moved < 6){ this.pulse = .5; this.shock = this.ptr ? {x:this.ptr.x, y:this.ptr.y} : {x:.5, y:.47}; } this.drag = null; });
    document.addEventListener("pointercancel", ()=>{ this.drag = null; this.ptr = null; });
  },
  frame(now){
    const cv = $("orb"); this.cv = cv;
    const dt = Math.min(.05, (now - this.last)/1000); this.last = now;
    if(!cv){ this.phase = 0; return; }   // off screen: the next orb materializes fresh
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(cv.clientWidth*dpr), H = Math.round(cv.clientHeight*dpr);
    if(!W || !H) return;
    if(cv.width !== W || cv.height !== H){ cv.width = W; cv.height = H; }
    const ctx = cv.getContext("2d");
    if(!this.reduce) this.t += dt;
    const t = this.t, mode = this.mode, target = mode === "out" ? 0 : 1;
    if(this.reduce) this.phase = target; else this.phase += Math.sign(target-this.phase)*Math.min(Math.abs(target-this.phase), dt*(mode === "out" ? .85 : .55));
    this.think += ((mode === "think" ? 1 : 0) - this.think)*Math.min(1, dt*3);
    this.pulse *= Math.pow(.03, dt);
    if(!this.drag){ this.vel += (.0045*(1+this.think*2+this.boost*7) - this.vel)*Math.min(1, dt*1.5); if(!this.reduce) this.rot += this.vel*dt*60; this.tilt += (-.28-this.tilt)*Math.min(1, dt*1.2); }
    const ph = this.phase, th = this.think, cx = W/2, cy = H*.47, R = Math.min(W,H)*.235;
    ctx.setTransform(1,0,0,1,0,0); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.clearRect(0,0,W,H);
    if(ph <= .001) return;
    const g = ctx.createRadialGradient(cx,cy,R*.1,cx,cy,R*2.1);
    g.addColorStop(0,`rgba(123,92,255,${(.34*ph*(1+th*.7)).toFixed(3)})`); g.addColorStop(.45,`rgba(60,196,214,${(.09*ph).toFixed(3)})`); g.addColorStop(1,"rgba(11,17,24,0)");
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
    ctx.save(); ctx.translate(cx,cy); ctx.strokeStyle = "#3CC4D6"; ctx.lineWidth = dpr;
    ctx.globalAlpha = .5*ph; ctx.setLineDash([2*dpr,6*dpr]); ctx.beginPath(); ctx.arc(0,0,R*1.8,t*.15,t*.15+Math.PI*1.3); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = .32*ph; ctx.beginPath(); ctx.arc(0,0,R*1.92,-t*.22,-t*.22+.9); ctx.stroke(); ctx.beginPath(); ctx.arc(0,0,R*1.92,-t*.22+Math.PI,-t*.22+Math.PI+.5); ctx.stroke();
    for(let i = 0; i < 60; i++){ const a = i/60*Math.PI*2 + t*.04, big = i%5 === 0, l = (big?6:3)*dpr; ctx.globalAlpha = (big?.45:.18)*ph;
      ctx.beginPath(); ctx.moveTo(Math.cos(a)*R*2.02, Math.sin(a)*R*2.02); ctx.lineTo(Math.cos(a)*(R*2.02+l), Math.sin(a)*(R*2.02+l)); ctx.stroke(); }
    if(th > .02){ ctx.strokeStyle = "#B9A6FF"; ctx.lineWidth = 2*dpr; ctx.globalAlpha = .8*th;
      ctx.beginPath(); ctx.arc(0,0,R*1.2,t*4,t*4+1.1); ctx.stroke(); ctx.beginPath(); ctx.arc(0,0,R*1.2,t*4+Math.PI,t*4+Math.PI+1.1); ctx.stroke(); }
    ctx.restore();
    const cr = Math.cos(this.rot), sr = Math.sin(this.rot), ct = Math.cos(this.tilt), st = Math.sin(this.tilt);
    const ptr = this.ptr ? {x:this.ptr.x*W, y:this.ptr.y*H} : null, rad = R*.62;
    if(ptr){ if(this.pp){ const k = Math.min(1, dt*18); this.pvx += ((ptr.x-this.pp.x)/Math.max(dt,.001) - this.pvx)*k; this.pvy += ((ptr.y-this.pp.y)/Math.max(dt,.001) - this.pvy)*k; } this.pp = {x:ptr.x, y:ptr.y}; }
    else { this.pp = null; this.pvx *= .8; this.pvy *= .8; }
    const shock = this.shock ? {x:this.shock.x*W, y:this.shock.y*H} : null, srad = R*1.9; this.shock = null;
    const pvx = this.pvx, pvy = this.pvy, pr = 1 + this.pulse*.12 + th*.025*Math.sin(t*9);
    const c1 = Math.cos(.42), s1 = Math.sin(.42), c2 = Math.cos(-.22), s2 = Math.sin(-.22);
    ctx.globalCompositeOperation = "lighter";
    for(const p of this.P){
      let e = (ph*1.6 - p.d)/.6; if(e <= 0) continue; if(e > 1) e = 1; e = e*e*(3-2*e);
      let x, y, z;
      if(p.k === 0){ x = p.x*pr; y = p.y*pr; z = p.z*pr; }
      else if(p.k === 1){ const a = p.a0 + t*p.w*(1+th*2.5); x = Math.cos(a)*p.r0; z = Math.sin(a)*p.r0; y = p.y0 + Math.sin(t*.9+p.ph)*.06; }
      else if(p.k === 2){ const a = p.a0 + t*.35*(1+th), rx = Math.cos(a)*p.r0, rz = Math.sin(a)*p.r0; x = rx; y = rz*s1; z = rz*c1; }
      else if(p.k === 3){ const a = p.a0 - t*.2, rx = Math.cos(a)*p.r0, rz = Math.sin(a)*p.r0; x = rx*c2; y = rx*s2; z = rz; }
      else if(p.k === 4){ x = p.x; y = p.y; z = p.z; }
      else { x = p.x; z = p.z; y = ((p.y0 + t*.05*p.tw) % 3.2) - 1.6; }
      if(e < 1){ const q = (1-e)*2.6, cq = Math.cos(q), sq = Math.sin(q), scx = p.sx*cq - p.sz*sq, scz = p.sx*sq + p.sz*cq;
        x = scx + (x-scx)*e; y = p.sy + (y-p.sy)*e; z = scz + (z-scz)*e; }
      const x1 = x*cr + z*sr, z1 = -x*sr + z*cr, y1 = y*ct - z1*st, z2 = y*st + z1*ct;
      const f = 3.6/(3.6 - (z2 > 2.4 ? 2.4 : z2 < -3 ? -3 : z2));
      let sx = cx + x1*R*f, sy = cy - y1*R*f;
      if(p.k !== 4 && !this.reduce){
        const px = sx + p.ox, py = sy + p.oy;
        if(ptr){ const dx = px-ptr.x, dy = py-ptr.y, d2 = dx*dx + dy*dy;
          if(d2 < rad*rad){ const d = Math.sqrt(d2) || 1, fall = 1 - d/rad, f2 = fall*fall;
            p.vx += dx/d*5600*dpr*f2*dt + pvx*fall*.09; p.vy += dy/d*5600*dpr*f2*dt + pvy*fall*.09; } }
        if(shock){ const dx = px-shock.x, dy = py-shock.y, d = Math.sqrt(dx*dx + dy*dy) || 1;
          if(d < srad){ const fall = 1 - d/srad; p.vx += dx/d*620*dpr*fall; p.vy += dy/d*620*dpr*fall; } }
        if(p.ox || p.oy || p.vx || p.vy){
          const kk = 30 + Math.min(120, Math.sqrt(p.ox*p.ox + p.oy*p.oy)/dpr*.6);   // the further a particle strays, the harder the ball pulls it home
          p.vx += (-kk*p.ox - 4.6*p.vx)*dt; p.vy += (-kk*p.oy - 4.6*p.vy)*dt; p.ox += p.vx*dt; p.oy += p.vy*dt;
          if(Math.abs(p.ox) + Math.abs(p.oy) < .05 && Math.abs(p.vx) + Math.abs(p.vy) < .5){ p.ox = p.oy = p.vx = p.vy = 0; } }
        sx += p.ox; sy += p.oy;
      }
      const depth = Math.max(0, Math.min(1, (z2+1.2)/2.4));
      let a = p.al*e*(.75 + .25*Math.sin(t*3*p.tw + p.ph));
      if(p.k === 0){ const rim = 1 - Math.min(1, Math.abs(z2)); a *= .28 + .95*rim*rim; } else a *= .3 + .7*depth;
      const spd = p.vx || p.vy ? Math.sqrt(p.vx*p.vx + p.vy*p.vy)/dpr : 0;
      if(spd > 40) a = Math.min(1, a + spd/900);
      if(a < .01) continue;
      const size = p.s*dpr*f*(.7 + .5*depth)*(e < 1 ? 1 + (1-e)*.8 : 1)*(1 + Math.min(.8, spd/600));
      ctx.globalAlpha = a > 1 ? 1 : a; ctx.fillStyle = p.c; ctx.fillRect(sx - size/2, sy - size/2, size, size);
    }
    if(ph > .02 && ph < .98){ const yl = -1 + 2*Math.max(0, Math.min(1, (ph*1.6 - .45)/.85)), rr = Math.sqrt(Math.max(0, 1 - yl*yl))*R;
      ctx.globalAlpha = .9; ctx.strokeStyle = "#8FEAF5"; ctx.lineWidth = 1.5*dpr; ctx.beginPath(); ctx.ellipse(cx, cy - yl*R*ct, rr + 6*dpr, (rr + 6*dpr)*Math.abs(st) + dpr, 0, 0, Math.PI*2); ctx.stroke(); }
    const hg = ctx.createRadialGradient(cx-R*.38, cy-R*.45, 0, cx-R*.38, cy-R*.45, R*.45);
    hg.addColorStop(0,`rgba(255,255,255,${(.22*ph).toFixed(3)})`); hg.addColorStop(1,"rgba(255,255,255,0)");
    ctx.globalAlpha = 1; ctx.fillStyle = hg; ctx.fillRect(cx-R, cy-R, R, R); ctx.globalCompositeOperation = "source-over";
  }
};
const orbCanvas = size => `<canvas id="orb" role="img" aria-label="The crystal ball. Drag to spin it, tap to send a shockwave." style="width:${size}px;height:${size}px"></canvas>`;

/* ---------- view state ---------- */
Object.assign(S, {view: "home", sort: store.get("sort", "az"), dirF: "all", fixTab: "fix", ptab: "exposure", teamLid: null, sim: {}, brief: {}, briefPhase: "idle", thinking: false, lastKey: null, counted: false});
const VIEWS = new Set(["home","fix","ask","waivers","players","team","brief","rankings"]);
if(!VIEWS.has(S.view) || S.view === "team") S.view = "home";
function go(view, opts={}){
  if(view === "team") S.teamLid = opts.lid || S.teamLid;
  if(view === "fix" && opts.tab) S.fixTab = opts.tab;
  S.view = view;
  render(); window.scrollTo(0, 0);
}
function openCB(){ go("ask"); }
function closeCB(){ go("home"); }

/* ---------- team direction ---------- */
const DIR3 = {contend:"Contend", rebuild:"Rebuild", none:"Undecided"};
const suggestDir = arch => ["jugg","win"].includes(arch) ? "contend" : ["build","reset"].includes(arch) ? "rebuild" : "none";
function teamList(){
  const bpBy = {}; for(const b of S.bp||[]) bpBy[b.lg.league_id] = b;
  return S.results.filter(r=>r.roster && r.league && r.league.status !== "pre_draft").map(r=>{
    const lg = r.league, id = lg.league_id, b = bpBy[id], set = store.get("dir:"+id, null);
    let cs = null, rs = null, sug = null;
    if(b){ const mx = k => Math.max(1, ...b.teams.map(t=>t[k])); cs = Math.round(100*b.me.now/mx("now")); rs = Math.round(100*b.me.young/mx("young")); sug = suggestDir(b.me.arch); }
    const st = r.roster.settings, rec = st ? `${st.wins}-${st.losses}${st.ties?"-"+st.ties:""}` : "";
    const typ = {0:"Redraft",1:"Keeper",2:"Dynasty"}[(lg.settings||{}).type] || "", sf = (lg.roster_positions||[]).includes("SUPER_FLEX") ? "SF" : "1QB";
    return {r, id, name:lg.name, b, cs, rs, sug, dir: set || sug || "none", userSet: !!set, rec,
      meta:[r.bestBall ? "Best ball" : rec, typ, sf, lg.total_rosters ? lg.total_rosters+"T" : ""].filter(Boolean).join(" · "),
      alert: r.sev === "crit" ? "crit" : r.sev === "warn" ? "warn" : null};
  });
}

/* ---------- must fix: every unplayable starter, grouped by player ---------- */
function statusLabel(f){ if(!f) return "Empty"; if(f.reason) return f.reason === "Bye week" ? "Bye" : f.reason === "Game canceled" ? "No game" : "FA"; return f.status === "Doubtful" ? "Doubt" : f.status; }
function outGroups(){
  const groups = {};
  for(const r of S.results){
    if(!r.slots || r.sev === "off") continue;
    const info = p => p && p !== "0" ? (r._c[p] ||= pinfo(p, r.league)) : null;
    const swap = {}; if(r.moves) r.moves.outs.forEach((o,i)=>{ if(o && r.moves.ins[i]) swap[o.pid] = r.moves.ins[i]; });
    const used = new Set(Object.values(swap).map(x=>x.pid));
    const spare = r.moves ? r.moves.ins.filter(x=>!used.has(x.pid)) : [];
    r.current.forEach((pid,i)=>{
      const f = info(pid);
      let key;
      if(!f) key = "empty";
      else { if(f.locked || !(f.reason || OUT_STATUSES.has(f.status) || f.status === "Doubtful")) return; key = pid; }
      const sub = f ? swap[pid] : spare.shift();
      // you have to act before the earlier of the two games locks: his (if he plays) or the replacement's
      const ks = [f && kickoff(f.team), sub && kickoff(sub.team)].filter(Boolean).sort((a,b)=>a.ts-b.ts);
      const g = groups[key] ||= {key, f, k: f ? kickoff(f.team) : null, rows:[]};
      g.rows.push({r, slot: SLOT_LABEL[r.slots[i]] || r.slots[i], sub, subK: sub ? kickoff(sub.team) : null, dl: ks[0] || null, gain: sub ? sub.eff - (f ? f.eff : 0) : 0});
    });
  }
  const out = Object.values(groups);
  for(const g of out){ g.rows.sort((a,b)=>((a.dl||{}).ts||9e15) - ((b.dl||{}).ts||9e15) || a.r.league.name.localeCompare(b.r.league.name)); g.dl = g.rows[0].dl; }
  return out.sort((a,b)=>((a.dl||{}).ts||9e15) - ((b.dl||{}).ts||9e15) || b.rows.length - a.rows.length);
}
function fixCounts(){
  const live = S.results.filter(r=>r.sev !== "off");
  return {fix: live.filter(r=>r.sev === "crit").length, monitor: live.filter(r=>r.issues.some(x=>x.sev === "warn")).length, startsit: live.filter(r=>r.moves && r.gain > 0).length};
}

/* ---------- the ask bar: plain words in, the right tool out ---------- */
const STOP = new Set(["start","sit","should","i","in","my","the","who","whom","do","or","vs","versus","and","for","trade","compare","better","is","a","an","to","this","week","leagues","league","all","give","get","player","players","who's","whos","what","play","over","than","with","dynasty","value","sf","superflex"]);
function nameIndex(){
  if(S.nameIdx && S.nameIdxN === Object.keys(S.proj).length) return S.nameIdx;
  const mine = new Set(cbLeagues().flatMap(x=>x.mine.players||[]));
  S.nameIdx = Object.values(S.proj).filter(e=>e.player && e.player.first_name && e.player.team && ["QB","RB","WR","TE","K"].includes(e.player.position))
    .map(e=>{ const full = (e.player.first_name+" "+(e.player.last_name||"")).toLowerCase(); return {id:e.player_id, full, last:(e.player.last_name||"").toLowerCase(), first:e.player.first_name.toLowerCase(), pts:(e.stats&&e.stats.pts_ppr)||0, mine:mine.has(e.player_id)}; });
  S.nameIdxN = Object.keys(S.proj).length;
  return S.nameIdx;
}
function findPlayers(text){
  const idx = nameIndex(), out = [];
  for(const chunk of text.toLowerCase().split(/\s+(?:or|vs\.?|versus|and|over|for)\s+|[,/|?]+/)){
    const words = chunk.replace(/[^a-z.' -]/g," ").split(/\s+/).filter(w=>w && !STOP.has(w));
    if(!words.length) continue;
    const q = words.join(" ");
    let best = null, bs = 0;
    for(const p of idx){
      let s = 0;
      if(p.full === q) s = 100; else if(p.full.includes(q)) s = 60;
      else if(words.includes(p.last)) s = 40 + (words.includes(p.first) ? 30 : 0);
      else if(words.some(w=>w.length >= 4 && p.last.startsWith(w))) s = 20;
      if(!s) continue;
      s += (p.mine ? 15 : 0) + Math.min(10, p.pts/2);
      if(s > bs){ bs = s; best = p; }
    }
    if(best && !out.some(o=>o.id === best.id)) out.push({id:best.id, name:pname(best.id)});
  }
  return out;
}
function askFromText(text){
  const t = (text||"").trim(), low = t.toLowerCase();
  if(!t){ go("ask"); return; }
  if(/brief|week ahead|summary|recap/.test(low)){ go("brief"); return; }
  if(/waiver|pick ?up|free agent|\bfaab\b/.test(low)){ go("waivers"); return; }
  const names = findPlayers(t);
  if(!names.length && /\b(out|injur|hurt|bye|inactive|ruled|questionable)\b/.test(low)){ go("fix", {tab: /questionable/.test(low) ? "monitor" : "fix"}); return; }
  CB.answers = CB.answers || []; CB.qa = ""; CB.qb = "";
  if(/trade|\bfor\b|give/.test(low)){
    const lg = names.length ? cbLeagues().find(x=>(x.mine.players||[]).includes(names[0].id)) : null;
    TOOL.mode = "trade"; CB.mode = "trade";
    if(lg && names.length >= 2){ cbPrefillTrade({lid: lg.lg.league_id, give:[names[0]], get:names.slice(1, 3)}); return; }
    if(lg) TR.lid = lg.lg.league_id;
    go("ask"); return;
  }
  TOOL.mode = /compare|better|dynasty|value|long term/.test(low) ? "compare" : "start"; CB.mode = TOOL.mode; CB.league = "all"; CB.b = []; TOOL.sub = "matchup";
  CB.a = names.slice(0, 2); if(!names.length) CB.qa = t;
  go("ask");
  if(CB.a.length === 2) setTimeout(reveal, 300);
}
function promptIdeas(){
  if(S._ideas && S._ideasAt === S.loadedAt) return S._ideas;
  const ideas = ["Who's out in my lineups?", "Best waiver adds this week", "Give me my weekly brief"];
  try{ const ex = exposure().filter(e=>["WR","RB"].includes(e.f.pos) && !e.f.status && !e.f.reason).sort((a,b)=>b.leagues.length-a.leagues.length);
    if(ex.length >= 2) ideas.unshift(`Start ${ex[0].f.full} or ${ex[1].f.full}?`);
    if(ex.length >= 4) ideas.splice(2, 0, `${ex[2].f.full} or ${ex[3].f.full}, dynasty value?`); }catch(e){}
  S._ideasAt = S.loadedAt; S._ideas = ideas;
  return ideas;
}

/* ---------- weekly brief ---------- */
function makeBrief(){
  const groups = outGroups().filter(g=>g.key !== "empty"), live = S.results.filter(r=>r.sev !== "off");
  const matches = live.filter(r=>r.match), proj = r => r.moves ? r.match.meOpt : r.match.me, wins = matches.filter(r=>proj(r) > r.match.opp).length, flips = matches.filter(r=>Math.abs(proj(r) - r.match.opp) <= 5).length;
  const fixes = live.filter(r=>r.sev === "crit").length, bench = live.reduce((s,r)=>s + (r.moves && r.gain > 0 ? r.gain : 0), 0);
  const q = {}; for(const r of live){ if(!r.current) continue; for(const pid of r.current){ const f = r._c[pid]; if(f && !f.locked && f.status === "Questionable"){ (q[pid] ||= {f, n:0, subs:0}).n++; if((r.league.settings||{}).max_subs) q[pid].subs++; } } }
  const qTop = Object.values(q).sort((a,b)=>b.n-a.n)[0], top = groups.slice().sort((a,b)=>b.rows.length-a.rows.length)[0];
  const rate = matches.length ? wins/matches.length : 0;
  let title, story;
  if(top && top.rows.length >= 3){ title = `The ${top.f.full.split(" ").slice(-1)[0]} fallout`; story = `${top.f.full} is ${statusLabel(top.f).toLowerCase()} and he starts in ${top.rows.length} of your lineups. That one name is the story of your week.`; }
  else if(fixes >= 4){ title = "Crunch-time cleanup"; story = `${fixes} lineups have a starter who can't play. None of it is hard, but all of it has a clock on it.`; }
  else if(matches.length && flips >= matches.length/3){ title = "Coin-flip week"; story = `${flips} of your ${matches.length} matchups are projected within 5 points. Small edges on your benches decide this one.`; }
  else if(rate >= .6){ title = "Favored and focused"; story = `You're projected to outscore your opponent in ${wins} of ${matches.length} matchups. Protect the leads: clean up the few problem lineups and let the favorites play.`; }
  else { title = "Grind week"; story = `You're projected to outscore your opponent in ${wins} of ${matches.length} matchups. Every bench point you move into a lineup matters this week.`; }
  story += ` ${fmt(bench)} projected points are sitting on your benches.`;
  const items = [];
  if(top) items.push({title:`${top.f.full} is ${statusLabel(top.f) === "Bye" ? "on bye" : statusLabel(top.f).toLowerCase()}`, body:(()=>{ const n = top.rows.length, ok = top.rows.filter(x=>x.sub).length, no = n - ok; return `He starts in ${n} lineup${n>1?"s":""}. ` + (n === 1 ? (ok ? "There's a clean swap on your bench." : "There's no healthy swap on your bench, so it needs a waiver add.") : `${ok} ha${ok===1?"s":"ve"} a clean swap on the bench${no?`, ${no} need${no===1?"s":""} a waiver add`:""}.`); })(), cta:`Fix ${fixes} lineup${fixes===1?"":"s"}`, go:"fix", tab:"fix"});
  if(qTop) items.push({title:`${qTop.f.full} is a game-time call`, body:`Questionable in ${qTop.n} league${qTop.n>1?"s":""}. ${qTop.subs ? `${qTop.subs} allow auto-subs, so set them now; the rest need a check before kickoff.` : "None of those leagues allow auto-subs, so check before kickoff."}`, cta:"See every Questionable starter", go:"fix", tab:"monitor"});
  if(bench >= 1) items.push({title:`${fmt(bench)} points on your benches`, body:`Better lineups are available in ${live.filter(r=>r.moves && r.gain>0).length} leagues, scored with each league's own settings.`, cta:"See the swaps", go:"fix", tab:"startsit"});
  if(items.length < 3 && S.bp){ const weak = {}; for(const b of S.bp) for(const p of ["QB","RB","WR","TE"]) if(["D","F"].includes(b.me.grades[p])) weak[p] = (weak[p]||0)+1;
    const w = Object.entries(weak).sort((a,b)=>b[1]-a[1])[0]; if(w) items.push({title:`${w[0]} is your thinnest spot`, body:`Graded D or F in ${w[1]} leagues. It's the position to target in trades and on waivers.`, cta:"Open waivers", go:"waivers"}); }
  let long = null;
  const tl = teamList().filter(x=>x.b);
  if(tl.length){ const undecided = tl.filter(x=>x.dir === "none").length, rb = tl.filter(x=>x.dir === "rebuild").length, ct = tl.filter(x=>x.dir === "contend").length;
    long = `${ct} teams are set up to contend, ${rb} to rebuild, and ${undecided} are undecided. Undecided teams lose value every season, so give each one a direction.`; }
  return {title, story, wins, n:matches.length, fixes, flips, items:items.slice(0,3), long, at:new Date()};
}

/* ---------- trade recs for one league ---------- */
async function ensureSim(lid){
  const st = S.sim[lid] ||= {};
  if(st.busy || st.detail || st.error) return;
  st.busy = true; st.phase = "Loading team values"; render();
  try{
    while(S.bpLoading) await sleep(250);
    if(!S.bp) await loadBlueprints();
    const b = (S.bp||[]).find(z=>z.lg.league_id === lid);
    if(!b) throw new Error("This league doesn't have enough roster data for trade recs yet.");
    if(b.lg.status !== "in_season") throw new Error("Trade recs run once the season is underway.");
    st.phase = "Reading next week's projections and league trades"; render();
    if(!S.proj2){ const p2 = S.week < 18 ? await getJSON(`${API}/projections/nfl/${S.season}/${S.week+1}?season_type=regular&${PROJ_POS}`).catch(()=>[]) : []; S.proj2 = {}; for(const e of p2||[]) S.proj2[e.player_id] = e; }
    await loadTx().catch(()=>null);
    st.phase = "Simulating the rest of the season"; render();
    const L = await seasonFor(b);
    diagnoseLeague(L); st.L = L;
    st.phase = `Testing trades against ${L.N-1} league mates`; render();
    await sleep(30);
    st.detail = buildDetail(L);
  }catch(e){ st.error = e.message || String(e); }
  st.busy = false; render();
}
function recsFor(D, dir){
  if(dir === "contend") return D.buy.slice(0,3).map(e=>[e,"buy"]);
  if(dir === "rebuild") return D.sell.slice(0,3).map(e=>[e,"sell"]);
  return [[D.buy[0],"buy"],[D.sell[0],"sell"],[D.buy[1],"buy"],[D.sell[1],"sell"]].filter(x=>x[0]).slice(0,3);
}
function recHTML(L, ev, mode, i){
  const t = ev.them, b = t.bp, id = L.lg.league_id, diff = (ev.getV - ev.giveV)/Math.max(ev.giveV, ev.getV, 1);
  const fair = Math.abs(diff) < .05 ? "Fair" : diff > 0 ? `You win +${Math.round(diff*100)}%` : `Overpay ${Math.round(-diff*100)}%`;
  const line = x => `${esc(x.name)} <span class="sub">${x.pos === "PICK" ? "pick" : x.pos}${x.age ? " · "+Math.floor(x.age) : ""}</span>`;
  const title = mode === "buy" ? `Upgrade: get ${ev.get[0].name}` : `Sell ${ev.give[0].name} for the future`;
  const imp = mode === "buy"
    ? [`Playoffs <b>${pct(ev.me.po0)} → ${pct(ev.me.po1)}</b>`, `Title <b>${pct(ev.me.t0)} → ${pct(ev.me.t1)}</b>`, `Lineup <b>${sgn(ev.dMe)}</b> pts/wk`]
    : [`Future value <b>${sgn((ev.me.y1-ev.me.y0)/Math.max(ev.me.y0,1)*100,0)}%</b>`, `Future rank <b>${ord(ev.me.f0)} → ${ord(ev.me.f1)}</b>`, `Playoffs <b>${pct(ev.me.po0)} → ${pct(ev.me.po1)}</b>`];
  const a = ev.act || {}, activity = a.moves ? `${a.trades} trade${a.trades===1?"":"s"} this season, last move ${ago(a.last)}` : "no trades or moves this season";
  const why = BUYERS.has(t.dir) ? `${b.name} is ${b.rec} and chasing a title${ev.dTh >= 0.5 ? `: this adds ${fmt(ev.dTh)} pts a week to their lineup` : ", and values what you're sending"}.` : `${b.name} is building for next year, so young players and picks fit their plan.`;
  const mk = marketLines(ev, mode).map(x=>`<div class="mline ${/down/.test(x) ? (mode==="buy"?"down":"up") : /up \d/.test(x) ? (mode==="sell"?"down":"up") : ""}">${esc(x)}</div>`).join("");
  const pitch = pitchText(ev, mode), cbOk = ev.give.concat(ev.get).every(x=>x.cb);
  const cbData = esc(JSON.stringify({lid:id, give:ev.give.map(x=>({id:x.id, name:x.name.replace(" (via trade)","")})), get:ev.get.map(x=>({id:x.id, name:x.name.replace(" (via trade)","")}))}));
  return `<article class="rec glass rise" style="animation-delay:${i*.08}s"><div class="rh"><span class="n">0${i+1}</span><b>${esc(title)}</b><span class="fair">${fair}</span></div>
    <div class="gs"><span class="k in">Get</span><span>${ev.get.map(line).join("<br>")}</span><span class="v">${Math.round(sumV(ev.get)).toLocaleString()}</span>
      <span class="k out">Send</span><span>${ev.give.map(line).join("<br>")}</span><span class="v">${Math.round(sumV(ev.give)).toLocaleString()}</span></div>
    ${mk}<div class="imp">${imp.map(x=>`<span>${x}</span>`).join("")}</div><div class="sub">${esc(why)} ${esc(b.name)}: ${b.rec}, ${esc(activity)}.</div>
    <details class="pitch"><summary>Message to send ${esc(b.name)}</summary><p>${esc(pitch)}</p></details>
    <div class="cfoot" style="padding:0">${cbOk?`<button class="ghost tint" data-cbt="${cbData}">Check with the crystal ball</button>`:""}<button class="ghost" data-copy="${esc(pitch)}">Copy message</button><a class="ghost" href="${leagueLink(id)}" target="_blank" rel="noopener">Sleeper ↗</a></div></article>`;
}

/* ---------- screens ---------- */
const ICON = {
  arrow:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l6 6-6 6"/><path d="M13 6l6 6-6 6" opacity=".55"/></svg>`,
  back:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>`,
  ext:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><path d="M9 7h8v8"/></svg>`,
  tick:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>`,
  brief:`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z" stroke="#C9B8FF" stroke-width="1.7"/><path d="M14 3v5h5" stroke="#C9B8FF" stroke-width="1.7"/><path d="M9 13h7M9 17h5" stroke="#8FEAF5" stroke-width="1.7"/></svg>`
};
const LOGO = `<svg width="38" height="38" viewBox="0 0 32 32" aria-hidden="true"><g class="ring-spin"><ellipse cx="16" cy="16" rx="15" ry="5.5" fill="none" stroke="url(#lgR)" stroke-width="1.4" stroke-dasharray="3 2.2" transform="rotate(-24 16 16)"/></g><circle cx="16" cy="16" r="9.5" fill="url(#lgO)"/><path d="M11.2 18.8L20.8 13.2" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><path d="M13.6 15.9l1 1.7M15.7 14.7l1 1.7M17.8 13.5l1 1.7" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/><circle cx="12.8" cy="11.8" r="1.6" fill="#fff" opacity=".85"/></svg>`;
const brandRow = () => `<div class="brandrow">${LOGO}<span class="wm"><span class="a">Command</span> <span class="b">Center</span></span></div>`;

function viewConnect(){
  return `<section class="connect">${brandRow()}
    <div class="orbwrap">${orbCanvas(300)}</div>
    <h1 class="h1">Every league.<br>One screen.</h1>
    <p class="lead">Type your Sleeper username. In about ten seconds every lineup, roster and trade question you have is in one place.</p>
    <form id="setupform" style="display:flex;flex-direction:column;gap:10px">
      <label for="uname" class="lab">Sleeper username</label>
      <div class="unamebox"><span class="at" aria-hidden="true">@</span><input id="uname" value="${esc(S.username)}" placeholder="your username" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" required><button class="cbtn" id="connectBtn" type="submit"${S.username ? "" : " disabled"}>Connect<span class="arr"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13"/><path d="M13 6l6 6-6 6"/></svg></span></button></div>
      <div class="trust"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>No password. Read-only. Your data stays on your phone.</div>
      ${S.error ? `<div class="err">${esc(S.error)}</div>` : ""}
    </form>${accountsOn() && !ACC.session ? `<button class="acsign" data-acopen="signin">Have an account? <b>Sign in</b></button>` : ""}
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px"><div class="lab">What you get</div><div class="feat">
      <div class="glass"><span class="badge red"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 19.5C4.5 11 11 4.5 19.5 4.5c0 8.5-6.5 15-15 15z" stroke="#FFB4B6" stroke-width="1.7"/><path d="M8.5 15.5l7-7" stroke="#fff" stroke-width="1.5"/><path d="M10 12.6l1.4 1.4M11.9 10.7l1.4 1.4M13.8 8.8l1.4 1.4" stroke="#fff" stroke-width="1.2"/><circle cx="19" cy="17.5" r="3" fill="#F26468" stroke="#141C26" stroke-width="1.4"/></svg></span>Every OUT starter, with a one-tap fix</div>
      <div class="glass"><span class="badge cy"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5" stroke="#8FEAF5" stroke-width="1.6"/><path d="M6.8 7l2.6 2.6M9.4 7L6.8 9.6" stroke="#fff" stroke-width="1.6"/><circle cx="16.2" cy="16.2" r="2" stroke="#fff" stroke-width="1.6"/><path d="M9.5 11.5c0 4 2 5 4.2 4.8" stroke="#B9A6FF" stroke-width="1.6" stroke-dasharray="1.6 1.8"/></svg></span>Trade recs built for each team</div>
      <div class="glass"><span class="badge"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10.5" r="6.5" stroke="#C9B8FF" stroke-width="1.6"/><path d="M7.5 20.5h9l-1.6-3.2H9.1z" stroke="#8FEAF5" stroke-width="1.6"/><path d="M12 7.2v6.6M8.7 10.5h6.6" stroke="#fff" stroke-width="1.3"/></svg></span>Ask start/sit or trades</div>
    </div></div></section>`;
}
function viewLoading(){
  return `<section class="connect scan">${brandRow()}
    <div class="orbwrap${S.arrive ? " arrive" : ""}">${orbCanvas(220)}</div>
    <div><div class="sub">Welcome${S.displayName ? ", <b style=\"color:var(--ink)\">"+esc(S.displayName)+"</b>" : ""}</div><h1 class="h1" style="text-align:left;font-size:40px">Building your command center…</h1></div>
    <div style="display:flex;align-items:baseline;gap:10px"><span class="bignum" id="scanN">0</span><span class="sub">of <span id="scanT">your</span> leagues scanned</span></div>
    <div class="bar" id="scanBar"><i></i></div>
    <div class="lab">Just scanned</div><div class="log" id="scanLog"></div></section>`;
}
function viewHome(){
  const c = fixCounts(), ideas = promptIdeas(), crit = c.fix;
  let h = `<section style="display:flex;flex-direction:column;gap:4px"><div class="sub">${S.displayName ? esc(S.displayName)+" · " : ""}${S.season} · week ${S.week}${S.week !== S.nflWeek ? " (next)" : ""}</div>
    <h1 class="h1">${crit ? `${crit} lineup${crit>1?"s":""} need${crit>1?"":"s"} you` : "Every lineup is set"}</h1></section>
    ${bulletinHTML()}
    <section style="display:flex;flex-direction:column;gap:10px"><form class="askbar" id="askform"><span class="miniorb" aria-hidden="true"></span>
      <input id="askq" placeholder="${esc(ideas[0])}" autocomplete="off" enterkeyhint="go" aria-label="Ask your command center"><button class="go" type="submit" aria-label="Ask">${ICON.arrow}</button></form>
      <div class="qchips">${ideas.map(q=>`<button class="chip" data-ask="${esc(q)}">${esc(q)}</button>`).join("")}</div></section>
    <section class="tiles">
      <button class="tile glass crit" data-go="fix" data-tab="fix"><b data-count="${c.fix}">${S.counted ? c.fix : 0}</b><span>Must fix</span></button>
      <button class="tile glass warn" data-go="fix" data-tab="monitor"><b data-count="${c.monitor}">${S.counted ? c.monitor : 0}</b><span>Monitor</span></button>
      <button class="tile glass up" data-go="fix" data-tab="startsit"><b data-count="${c.startsit}">${S.counted ? c.startsit : 0}</b><span>Start / sit</span></button></section>
    ${toolsGridHTML()}
    <button class="brief-entry glass" data-go="brief">${ICON.brief}<span class="t"><b>Week ${S.week} brief</b><small>The story of your week, before kickoff</small></span><span class="cta">${S.brief[S.week] ? "Open" : "Generate"}</span></button>
    ${accountCardHTML()}
    <div class="statusline" id="statusline"></div>`;
  // my teams
  let list = teamList();
  const counts = {all:list.length, contend:0, rebuild:0, none:0}; list.forEach(x=>counts[x.dir]++);
  if(S.dirF !== "all") list = list.filter(x=>x.dir === S.dirF);
  if(S.sort === "az") list.sort((a,b)=>a.name.localeCompare(b.name));
  if(S.sort === "cs") list.sort((a,b)=>(b.cs ?? -1) - (a.cs ?? -1));
  if(S.sort === "rs") list.sort((a,b)=>(b.rs ?? -1) - (a.rs ?? -1));
  const sorts = [["az","A–Z"],["cs","Contending"],["rs","Rebuilding"]], si = sorts.findIndex(s=>s[0] === S.sort);
  h += `<section style="display:flex;flex-direction:column;gap:10px"><div class="sec"><h2 class="h2">My teams</h2><span class="sub">${S.bpLoading ? "Scoring teams…" : list.length + " shown"}</span></div>
    <div class="seg" role="tablist" aria-label="Sort teams" style="--n:3;--i:${si}">${sorts.map(([k,l])=>`<button role="tab" data-sort="${k}" aria-selected="${S.sort===k}">${l}</button>`).join("")}<i aria-hidden="true"></i></div>
    <div class="chips">${[["all","All"],["contend","Contend"],["rebuild","Rebuild"],["none","Undecided"]].map(([k,l])=>`<button class="chip" data-dirf="${k}" aria-pressed="${S.dirF===k}">${l} · ${counts[k]}</button>`).join("")}</div>
    <div class="teamrow-list">${list.map(x=>{
      const sc = S.sort === "cs" ? x.cs : S.sort === "rs" ? x.rs : null;
      const right = S.sort === "az" ? `<span class="dtag d-${x.dir}">${DIR3[x.dir]}</span>`
        : sc == null ? `<span class="sub">…</span>` : `<span class="sbar"><i><b style="width:${sc}%;background:${S.sort==="cs"?"var(--ok)":"var(--violet-2)"}"></b></i><span>${sc}</span></span>`;
      return `<button class="trow" data-team="${x.id}"><span class="dotx" style="background:${x.alert==="crit"?"var(--crit)":x.alert==="warn"?"var(--warn)":"transparent"};box-shadow:${x.alert?"0 0 8px currentColor":"none"}"></span><span class="t"><span class="nm">${esc(x.name)}</span><span class="mt">${esc(x.meta)}${S.sort!=="az"?" · "+DIR3[x.dir]:""}</span></span>${right}</button>`;
    }).join("") || `<div class="empty" style="margin:0">No teams in this group.</div>`}</div></section>`;
  h += renderSettings();
  h += `<p class="src">Sources: Sleeper (leagues, rosters, injuries, Rotowire projections rescored with each league's settings) · ESPN schedule (kickoff times and venues) · FantasyCalc (dynasty values built from real trades). Playoff and title odds are simulations built on that data and are labeled as such.</p>`;
  return h;
}
function viewFix(){
  const c = fixCounts(), tabs = [["fix","Must fix",c.fix],["monitor","Monitor",c.monitor],["startsit","Start / sit",c.startsit]], ti = tabs.findIndex(t=>t[0] === S.fixTab);
  const K = S.kick[S.week], exact = K && K.ok;
  let h = `<section style="display:flex;flex-direction:column;gap:6px"><h1 class="h1">${{fix:"Out in your lineups", monitor:"Game-time calls", startsit:"Better lineups"}[S.fixTab]}</h1>
    <div class="sub">${{fix:"Every starter who can't play, soonest lock first. Open jumps straight to your team in Sleeper.", monitor:"Questionable starters and healthy players stuck in IR slots, soonest lock first.", startsit:"Leagues where a bench player outscores a starter in that league's scoring, soonest lock first."}[S.fixTab]}</div></section>
    <div class="seg" role="tablist" style="--n:3;--i:${ti}">${tabs.map(([k,l,n])=>`<button role="tab" data-fixtab="${k}" aria-selected="${S.fixTab===k}">${l}<span class="ct">${n}</span></button>`).join("")}<i aria-hidden="true"></i></div>
    <div class="statusline" id="statusline"></div>`;
  if(S.fixTab === "fix"){
    const groups = outGroups(), lids = [...new Set(groups.flatMap(g=>g.rows.map(x=>x.r.league.league_id)))], left = lids.filter(id=>!isDone(id)).length;
    if(!groups.length) return h + `<div class="empty">No starter is out, on bye or empty. Every lineup can play.</div>`;
    h += `<section class="progress"><div class="sub"><span class="livedot"></span><b style="color:var(--ink)">${left} of ${lids.length}</b> leagues still need a swap${S.loadedAt ? ` · checked ${S.loadedAt.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})}` : ""}</div><div class="bar"><i style="width:${lids.length ? (lids.length-left)/lids.length*100 : 0}%;background:linear-gradient(90deg,var(--ok),#7BE0A2)"></i></div></section>`;
    bySlot(groups.map(g=>({k:g.dl, g}))).forEach((s, si)=>{
      h += slotHead(s.k, si === 0);
      for(const {g} of s.items){
        const f = g.f;
        h += `<section class="fixgroup glass"><div class="fixhead"><span class="st">${esc(statusLabel(f))}</span><span class="t"><b>${f ? esc(f.full) : "Empty lineup slot"}</b><small>${f ? `${f.pos} · ${f.team || "No team"}${g.k ? " · plays " + esc(kickLabel(g.k)) : f.reason ? " · " + esc(f.reason) : ""}` : "A starting slot has nobody in it"}</small></span>${g.k ? `<span class="day">${esc(kickLabel(g.k).split(" ")[0].toUpperCase())}</span>` : ""}</div>
          ${g.rows.map(x=>{ const id = x.r.league.league_id, d = isDone(id);
            return `<div class="fixrow${d?" done":""}"><button class="check" data-done="${id}" aria-pressed="${d}" aria-label="Mark ${esc(x.r.league.name)} done">${d?ICON.tick:""}</button>
              <span class="t"><span class="nm">${esc(x.r.league.name)}</span><span class="fx${x.sub?"":" w"}">${x.sub ? `Start ${esc(x.sub.full)} at ${x.slot} · ${x.gain >= 0 ? "+" : ""}${fmt(x.gain)} pts <span class="when">· plays ${esc(kickLabel(x.subK))}</span>` : "No healthy bench option · check waivers"}</span></span>
              <a class="openbtn" href="${leagueLink(id)}" target="_blank" rel="noopener">Open ${ICON.ext}</a></div>`; }).join("")}</section>`;
      }
    });
    return h + `<p class="src">Ordered by when each decision locks: the earlier kickoff of the player who's out and his replacement. ${exact ? "Kickoff times from ESPN's NFL schedule." : "Exact kickoff times weren't available, so games are ordered by date with Thursday first."} Injury status from Sleeper.</p>`;
  }
  const kind = S.fixTab;
  let list = S.results.filter(r=>r.sev !== "off");
  list = kind === "monitor" ? list.filter(r=>r.issues.some(x=>x.sev === "warn")) : list.filter(r=>r.moves && r.gain > 0);
  if(S.hideDone) list = list.filter(r=>!isDone(r.league.league_id));
  if(!list.length) return h + `<div class="empty">${kind === "monitor" ? "No game-time decisions right now." : "Every lineup is already optimal."}</div>`;
  bySlot(list.map(r=>({k:resDeadline(r, kind), r}))).forEach((s, si)=>{
    h += slotHead(s.k, si === 0);
    h += s.items.sort((a,b)=>(b.r.gain||0)-(a.r.gain||0)).map(x=>cardHTML(x.r, false)).join("");
  });
  return h;
}
function viewTeam(){
  const x = teamList().find(z=>z.id === S.teamLid);
  if(!x) return `<button class="ghost back" data-go="home">${ICON.back} My teams</button><div class="empty">That league isn't loaded.</div>`;
  const b = x.b, id = x.id, st = S.sim[id];
  let h = `<button class="ghost back" data-go="home">${ICON.back} My teams</button>
    <section style="display:flex;flex-direction:column;gap:4px"><h1 class="h1" style="font-size:34px">${esc(x.name)}</h1><div class="sub">${esc(x.meta)}</div></section>`;
  if(!b){ h += S.bpLoading ? `<div class="statusline" id="statusline"></div><div class="skel" aria-hidden="true"><i style="height:90px"></i><i style="height:60px"></i></div>` : `<div class="empty">${S.bpError ? esc(S.bpError) : "Not enough roster data to score this team."}</div>`; return h + cardHTML(x.r, false); }
  const me = b.me, N = b.N;
  h += `<section class="scores"><div class="score-t glass"><span class="lab">Contending</span><span style="display:flex;align-items:baseline;gap:6px"><b>${x.cs}</b><span class="sub">${ord(me.nowRank)} of ${N}</span></span><div class="bar"><i style="width:${x.cs}%;background:linear-gradient(90deg,#4CC27A,#7BE0A2)"></i></div></div>
    <div class="score-t glass"><span class="lab">Rebuilding</span><span style="display:flex;align-items:baseline;gap:6px"><b>${x.rs}</b><span class="sub">${ord(me.futRank)} of ${N}</span></span><div class="bar"><i style="width:${x.rs}%"></i></div></div></section>
    <section style="display:flex;flex-direction:column;gap:8px"><div class="lab">Your direction</div>
      <div class="dirsel" role="radiogroup" aria-label="Team direction">${["contend","none","rebuild"].map(k=>`<button class="${k}" role="radio" data-setdir="${k}" aria-checked="${x.dir===k}">${DIR3[k]}${x.sug===k?"<small>Suggested</small>":""}</button>`).join("")}</div>
      <div class="sub">${esc(ARCH[me.arch].label)}: ${esc(ARCH[me.arch].desc.toLowerCase())}. ${x.dir === "contend" ? "Recs below buy points now with bench pieces and picks." : x.dir === "rebuild" ? "Recs below sell veterans to contenders for youth and picks." : "Recs below show the best move each way. Pick a lane to focus them."}</div></section>
    <div class="grades">${["QB","RB","WR","TE"].map(p=>`<span class="gchip" title="${ord(me.posRank[p])} of ${N}">${p}<b class="g-${me.grades[p]}">${me.grades[p]}</b></span>`).join("")}<span class="gchip">Age<b class="g-C">${me.age.toFixed(1)}</b></span></div>
    <p class="src" style="margin:0">Contending = your best starting lineup's FantasyCalc redraft value as a share of the league's best. Rebuilding = your young players' and picks' FantasyCalc dynasty value as a share of the league's best. Grades rank your starters' value at each position against the other ${N-1} teams.</p>`;
  // trade recs
  h += `<section style="display:flex;flex-direction:column;gap:10px"><div class="sec"><h2 class="h2">Trade recs</h2><span class="sub">Built for this league's scoring</span></div>`;
  if(!st || st.busy){ if(!st) setTimeout(()=>ensureSim(id), 0);
    h += `<div class="statusline"><span class="livedot" style="background:var(--violet)"></span>${esc((st && st.phase) || "Starting")}…</div><div class="skel" aria-hidden="true"><i style="height:150px"></i><i style="height:150px"></i></div>`; }
  else if(st.error) h += `<div class="empty">${esc(st.error)}</div>`;
  else {
    const L = st.L, t = L.me, recs = recsFor(st.detail, x.dir);
    h += `<div class="oddsrow"><span><b>${ord(t.stand)}</b> of ${L.N} in standings</span><span><b>${pct(t.odds.po)}</b> playoff odds</span><span><b>${pct(t.odds.title)}</b> title odds</span></div><p class="src" style="margin:0">Odds are simulated: 1,000 runs of the rest of the season from real records, the remaining schedule and every team's Sleeper projections in this league's scoring. Values are FantasyCalc. Recs are ranked by how far they move you in your chosen direction at a fair price, and by how active the other manager is.</p>`;
    h += recs.length ? recs.map(([ev,mode],i)=>recHTML(L, ev, mode, i)).join("") : `<div class="empty">No clean ${x.dir === "rebuild" ? "sell" : x.dir === "contend" ? "buy" : ""} trades found in this league right now.</div>`;
  }
  h += `</section>`;
  // move off / currency
  const chips = x.dir === "contend"
    ? me.pl.filter(p=>!me.nowStarters.has(p.id) && p.v >= 300).sort((a,b)=>b.v-a.v).slice(0,4).map(p=>`${p.name} (${p.pos})`).concat(me.picks.filter(p=>p.round <= 2).slice(0,3).map(pickLabel))
    : me.pl.filter(p=>isOld(p) && p.r >= 500).sort((a,b)=>b.r-a.r).slice(0,5).map(p=>`${p.name} (${p.pos}, ${p.age ? Math.floor(p.age) : "?"})`);
  if(chips.length) h += `<section style="display:flex;flex-direction:column;gap:8px"><div class="lab">${x.dir === "contend" ? "Trade chips that don't score for you" : "Move off your roster before they lose value"}</div><div class="pchips">${chips.map(c=>`<span>${esc(c)}</span>`).join("")}</div></section>`;
  h += `<section style="display:flex;flex-direction:column;gap:8px"><div class="lab">This week</div>${cardHTML(x.r, false)}</section>`;
  return h;
}
function viewAsk(){
  if(!cbLeagues().length) return `<div class="askhead">${orbCanvas(300)}</div><div class="empty">The crystal ball needs at least one in-season league to read.</div>`;
  return `<div class="askhead">${orbCanvas(Math.min(250, window.innerWidth - 60))}<div class="sub" id="orbline">${S.thinking ? "Reading your leagues…" : "Pick a tool. Drag the ball to spin it."}</div></div><div id="askBody"></div>`;
}
function viewBrief(){
  const B = S.brief[S.week];
  let h = `<button class="ghost back" data-go="home">${ICON.back} Home</button>`;
  if(S.briefPhase === "loading") return h + `<section class="skel" aria-hidden="true"><i style="height:16px;width:40%"></i><i style="height:40px;width:85%"></i><i style="height:80px"></i><i style="height:110px"></i><i style="height:90px"></i></section><p class="sub">Reading ${S.results.filter(r=>r.sev!=="off").length} lineups and this week's injury report…</p>`;
  if(!B) return h + `<section class="brief-hero"><h1 class="h1" style="font-size:44px">Your week,<br>in two minutes.</h1><p class="sub" style="font-size:15px">One read before kickoff: the story of your week across every team, the problems that matter, and what to do about each.</p>
    <button class="primary" data-brief="1">Generate my week ${S.week} brief</button><p class="note">Built from your rosters, this week's projections and injury news. Regenerate any time news breaks.</p></section>`;
  h += `<section style="display:flex;flex-direction:column;gap:6px"><div class="sub">Week ${S.week} · generated ${B.at.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})}</div><h1 class="h1" style="font-size:42px">${esc(B.title)}</h1></section>
    <p style="margin:0;color:#C9D2DB">${esc(B.story)}</p>
    <section class="stats"><div><b>${B.wins}/${B.n}</b><span>projected to outscore your opponent</span></div><div><b style="color:var(--crit)">${B.fixes}</b><span>lineups with a starter who can't play</span></div><div><b style="color:var(--warn)">${B.flips}</b><span>matchups projected within 5 pts</span></div></section>
    <section style="display:flex;flex-direction:column;gap:10px"><h2 class="h2">What decides your week</h2>
    ${B.items.map((it,i)=>`<div class="brief-item"><span class="n">0${i+1}</span><span style="flex:1;min-width:0"><b>${esc(it.title)}</b><p>${esc(it.body)}</p><button class="ghost tint" style="margin-top:8px" data-go="${it.go}"${it.tab?` data-tab="${it.tab}"`:""}>${esc(it.cta)} →</button></span></div>`).join("")}</section>
    ${B.long ? `<section class="summary"><h3>The long game</h3><p>${esc(B.long)}</p><div><button class="ghost" data-go="home" data-dirf2="none">See undecided teams →</button></div></section>` : ""}
    <p class="src">Projections are Sleeper's (Rotowire), rescored with each league's settings and your best available lineup. Injury status from Sleeper, kickoff times from ESPN.</p><div><button class="ghost" data-brief="1">Regenerate</button></div>`;
  return h;
}
function viewWaivers(){
  return `<section style="display:flex;flex-direction:column;gap:6px"><h1 class="h1">Waivers</h1><div class="sub">Holes you can fill, stashes worth adding, and what to bid based on how your leagues actually bid.</div></section><div class="statusline" id="statusline"></div>${renderWaivers()}${S.wvLoading ? `<div class="skel" aria-hidden="true"><i style="height:130px"></i><i style="height:110px"></i><i style="height:140px"></i></div>` : ""}`;
}
function viewPlayers(){
  const tabs = [["exposure","Exposure"],["reviews","Team reviews"]], i = tabs.findIndex(t=>t[0] === S.ptab);
  let h = `<section style="display:flex;flex-direction:column;gap:6px"><h1 class="h1">Players</h1><div class="sub">Who you own everywhere, and a full review of every dynasty team.</div></section>
    <div class="seg" role="tablist" style="--n:2;--i:${i}">${tabs.map(([k,l])=>`<button role="tab" data-ptab="${k}" aria-selected="${S.ptab===k}">${l}</button>`).join("")}<i aria-hidden="true"></i></div><div class="statusline" id="statusline"></div>`;
  if(S.ptab === "exposure") h += renderPlayers();
  else { h += renderBlueprints(); if(S.bpLoading) h += `<div class="skel" aria-hidden="true"><i style="height:130px"></i><i style="height:110px"></i></div>`; }
  return h;
}

/* ---------- ask screen body (the crystal ball tools) ---------- */
function renderCB(){
  const body = $("askBody"); if(!body) return;
  const focus = document.activeElement && ["cbqa","cbqb"].includes(document.activeElement.id) ? document.activeElement.id : null;
  const caret = focus ? document.activeElement.selectionStart : null;
  const lgs = cbLeagues();
  if(CB.mode === "trade" && CB.league === "all" && lgs.length) CB.league = lgs[0].lg.league_id;
  const labA = {start:"Who are you choosing between?", trade:"You give", compare:"Player A"}[CB.mode], labB = {trade:"You get", compare:"Player B"}[CB.mode];
  const modes = [["start","Start / sit"],["trade","Trade check"],["compare","Compare"]], mi = modes.findIndex(m=>m[0] === CB.mode);
  const box = (side, lab) => { const sel = side === "a" ? CB.a : CB.b, opts = cbOptions(side);
    return `<div class="cbbox"><span class="cblab">${lab}</span>
      ${sel.length ? `<div class="sel">${sel.map(o=>`<button class="chip" data-rm="${side}:${esc(o.id)}" aria-label="Remove ${esc(o.name)}">${esc(o.name)} ✕</button>`).join("")}</div>` : ""}
      <input class="search" id="cbq${side}" type="search" placeholder="${CB.mode==="trade"&&side==="b"?"Search their players or a pick (2027 1st)":"Search a player"}" value="${esc(side==="a"?CB.qa:CB.qb)}" autocomplete="off">
      <div class="pick">${opts.map(o=>`<button class="chip" data-add="${side}:${esc(o.id)}">${esc(o.name)}<small>${esc(o.sub)}</small></button>`).join("") || `<span class="note">No matches.</span>`}</div></div>`; };
  body.innerHTML = `<div class="seg" role="tablist" style="--n:3;--i:${mi}">${modes.map(([k,l])=>`<button role="tab" data-mode="${k}" aria-selected="${CB.mode===k}">${l}</button>`).join("")}<i aria-hidden="true"></i></div>
    <div class="cbbox"><label for="cbLeague">League</label><select id="cbLeague">${CB.mode!=="trade"?`<option value="all" ${CB.league==="all"?"selected":""}>All my leagues</option>`:""}${lgs.map(x=>`<option value="${x.lg.league_id}" ${CB.league===x.lg.league_id?"selected":""}>${esc(x.lg.name)}</option>`).join("")}</select></div>
    ${box("a", labA)}${labB ? box("b", labB) : ""}
    <button class="askbtn" id="cbAsk" ${cbReady() && !S.thinking ? "" : "disabled"}>${S.thinking ? "Reading your leagues…" : cbAskLabel()}</button>
    ${CB.answers.map(answerHTML).join("")}`;
  if(focus && $(focus)){ const el = $(focus); el.focus(); try{ el.setSelectionRange(caret, caret); }catch(e){} }
}
function bindCB(){}
async function cbAsk(){
  if(!cbReady() || S.thinking) return;
  const reduce = reduceMotion(), t0 = Date.now();
  S.thinking = true; ORB.mode = "think"; const line = $("orbline"); if(line) line.textContent = FOG_LINES[Math.floor(Math.random()*FOG_LINES.length)];
  renderCB(); window.scrollTo({top:0, behavior: reduce ? "auto" : "smooth"});
  let ans;
  try{ ans = await (CB.mode === "start" ? answerStart() : CB.mode === "trade" ? answerTrade() : answerCompare()); }
  catch(e){ ans = {q:cbAskLabel(), v:"The ball is cloudy", conf:null, reasons:["Couldn't load the data for this question: "+(e.message||e)], flip:null}; }
  if(!reduce){ await sleep(Math.max(0, 1300 - (Date.now()-t0))); ORB.mode = "out"; await sleep(700); }
  CB.answers.unshift(ans); CB.answers = CB.answers.slice(0, 6); S.thinking = false;
  renderCB(); const l2 = $("orbline"); if(l2) l2.textContent = "Ask a follow-up, or drag the ball to spin it";
  const first = document.querySelector(".answer"); if(first) first.scrollIntoView({behavior: reduce ? "auto" : "smooth", block:"start"});
  setTimeout(()=>{ if(!S.thinking) ORB.mode = "in"; }, 900);
}

/* ---------- render ---------- */
function currentView(){
  if(S.loading && !S.results.length) return "loading";
  if(!S.results.length) return "connect";
  return S.view;
}
function renderStatus(){
  const n = $("scanN");
  if(n){ const tot = (S.leagues||[]).length; n.textContent = Math.round((S.progress||0)*tot); $("scanT").textContent = tot || "your";
    const bar = $("scanBar"); if(bar) bar.firstElementChild.style.width = (S.progress||0)*100 + "%";
    const log = $("scanLog"); if(log){ const names = (S.scanLog||[]).slice(0,5); if(log.dataset.k !== names.join("|")){ log.dataset.k = names.join("|"); log.innerHTML = names.map(x=>`<div>${esc(x)}</div>`).join(""); } } }
  const el = $("statusline"); if(!el) return;
  let s = "";
  if(S.refreshing) s = `<span class="livedot" style="background:var(--cyan)"></span>Refreshing from Sleeper…`;
  else if(S.bpLoading) s = `<span>Scoring every team… ${Math.round((S.bpProgress||0)*100)}%</span><div class="bar"><i style="width:${(S.bpProgress||0)*100}%"></i></div>`;
  else if(S.wvLoading) s = `<span>Reading this season's waiver claims… ${Math.round((S.txProgress||0)*100)}%</span><div class="bar"><i style="width:${(S.txProgress||0)*100}%"></i></div>`;
  else if(S.fromCache && S.loadedAt) s = `<span>Saved data from ${S.loadedAt.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})}</span>`;
  el.innerHTML = s;
}
function render(){
  if(S.warping || S.dragging){ renderStatus(); return; }
  const v = currentView(), main = $("main");
  const key = v + (v === "team" ? ":" + S.teamLid : "");
  const changed = key !== S.lastKey; S.lastKey = key;
  const ready = !!S.results.length && v !== "loading";
  $("top").hidden = !ready; $("dock").hidden = !ready;
  $("refresh").classList.toggle("spin", !!(S.loading || S.refreshing));
  if(S.week) $("wklabel").textContent = "WK " + S.week;
  const acs = $("acslot"); if(acs){ const ah = accountChipHTML(); if(acs.innerHTML !== ah) acs.innerHTML = ah; }
  document.querySelectorAll("[data-go]").forEach(b=>{ if(!b.classList.contains("navb") && b.id !== "orbBtn") return;
    const on = b.dataset.go === v || (b.dataset.go === "home" && ["team","brief"].includes(v)); if(on) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });
  const c = ready ? fixCounts().fix : 0, bd = $("fixBadge"); bd.hidden = !c; bd.textContent = c;
  SPACE.target = v === "connect" || v === "loading" || v === "ask" ? .95 : .7;
  SPACE.warpTarget = v === "loading" ? .22 : 0;
  if(v === "connect" || v === "loading") ORB.mode = v === "loading" ? "think" : (ORB.mode === "out" ? "in" : ORB.mode === "think" ? "in" : ORB.mode);
  else if(v === "ask" && !S.thinking && ORB.mode !== "out") ORB.mode = "in";
  // keep typing focus across renders
  const ae = document.activeElement, fid = ae && ae.id && main.contains(ae) ? ae.id : null, caret = fid && ae.selectionStart != null ? ae.selectionStart : null, sy = window.scrollY;
  let body = "";
  if(v === "connect") body = viewConnect();
  else if(v === "loading") body = viewLoading();
  else {
    if(S.error) body += `<div class="err">${esc(S.error)}</div>`;
    body += {home:viewHome, fix:viewFix, team:viewTeam, ask:viewAsk, brief:viewBrief, waivers:viewWaivers, players:viewPlayers, rankings:viewRankings}[v]();
  }
  main.className = (changed ? "flow " : "") + (ready ? "" : "bare");
  main.innerHTML = body;
  if(v === "ask") renderCB();
  renderStatus();
  if(fid && $(fid)){ const el = $(fid); el.focus({preventScroll:true}); try{ if(caret != null) el.setSelectionRange(caret, caret); }catch(e){} }
  if(!changed) window.scrollTo(0, sy);
  // count the home tiles up once
  if(v === "home" && !S.counted && !reduceMotion()){ S.counted = true; const els = [...document.querySelectorAll("[data-count]")], t0 = performance.now();
    const step = now => { const k = Math.min(1, (now-t0)/900), e = 1 - Math.pow(1-k, 3); els.forEach(el=>{ el.textContent = Math.round(+el.dataset.count * e); }); if(k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step); }
  else if(v === "home"){ S.counted = true; document.querySelectorAll("[data-count]").forEach(el=>el.textContent = el.dataset.count); }
  S.arrive = false;
  // background work the home screen needs
  if(S.results.length && S.week && !S.kick[S.week]) loadKick();
  if(S.results.length && !S.loading && !S.bp && !S.bpLoading && !S.bpError) setTimeout(loadBlueprints, 60);
}

/* ---------- events: one listener for every screen ---------- */
document.addEventListener("click", async e=>{
  const el = e.target.closest("button, a, [data-go]"); if(!el) return;
  const d = el.dataset;
  if(d.go){ if(d.dirf2) S.dirF = d.dirf2; go(d.go, {tab: d.tab}); return; }
  if(d.team){ go("team", {lid: d.team}); return; }
  if(d.sort){ S.sort = d.sort; store.set("sort", S.sort); render(); return; }
  if(d.dirf){ S.dirF = d.dirf; render(); return; }
  if(d.fixtab){ S.fixTab = d.fixtab; render(); return; }
  if(d.ptab){ S.ptab = d.ptab; render(); return; }
  if(d.setdir){ store.set("dir:"+S.teamLid, d.setdir); render(); return; }
  if(d.ask){ askFromText(d.ask); return; }
  if(d.brief){ S.briefPhase = "loading"; render(); await sleep(reduceMotion() ? 0 : 1200); S.brief[S.week] = makeBrief(); S.briefPhase = "idle"; S.lastKey = null; render(); return; }
  if(d.done){ toggleDone(d.done); return; }
  if(d.expand){ const id = d.expand; S.expanded.has(id) ? S.expanded.delete(id) : S.expanded.add(id); render(); return; }
  if(d.arch){ S.bpArch = S.bpArch === d.arch ? null : d.arch; render(); return; }
  if(d.pf){ S.playerFilter = d.pf; render(); return; }
  if(d.wf){ S.wvFilter = d.wf; render(); return; }
  if(d.cbt){ try{ cbPrefillTrade(JSON.parse(d.cbt)); }catch(_){} return; }
  if(d.copy != null){ const txt = d.copy; try{ await navigator.clipboard.writeText(txt); }catch(_){ const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try{ document.execCommand("copy"); }catch(__){} ta.remove(); }
    el.textContent = "Copied ✓"; setTimeout(()=>{ el.textContent = "Copy message"; }, 1800); return; }
  if(d.mode){ CB.mode = d.mode; CB.a = []; CB.b = []; CB.qa = ""; CB.qb = ""; renderCB(); return; }
  if(d.add){ const i = d.add.indexOf(":"), side = d.add.slice(0,i), id = d.add.slice(i+1); (side === "a" ? CB.a : CB.b).push({id, name: id.startsWith("PICK:") ? id.slice(5) : pname(id)}); if(side === "a") CB.qa = ""; else CB.qb = ""; renderCB(); return; }
  if(d.rm){ const i = d.rm.indexOf(":"), side = d.rm.slice(0,i), id = d.rm.slice(i+1); if(side === "a") CB.a = CB.a.filter(o=>o.id !== id); else CB.b = CB.b.filter(o=>o.id !== id); renderCB(); return; }
  if(el.id === "cbAsk"){ cbAsk(); return; }
  if(el.id === "switch"){ S.userId = null; S.results = []; S.displayName = ""; S.error = null; S.bp = null; S.sim = {}; S.brief = {}; S.lastKey = null; render(); return; }
  if(el.id === "markBtn"){ go("home"); return; }
});
document.addEventListener("submit", e=>{
  e.preventDefault();
  if(e.target.id === "setupform"){ if(S.warping) return; S.username = $("uname").value.trim(); if(!S.username) return; store.set("username", S.username); S.userId = null; S.error = null; S.scanLog = []; S.view = "home"; warpIn(); }
  if(e.target.id === "askform"){ const q = $("askq"); askFromText(q.value); }
});
document.addEventListener("input", e=>{
  const id = e.target.id;
  if(id === "cbqa"){ CB.qa = e.target.value; renderCB(); }
  if(id === "cbqb"){ CB.qb = e.target.value; renderCB(); }
  if(id === "q"){ S.query = e.target.value; render(); }
  if(id === "uname"){ const b = $("connectBtn"); if(b) b.disabled = !e.target.value.trim(); }
});
document.addEventListener("change", e=>{
  const id = e.target.id;
  if(id === "cbLeague"){ CB.league = e.target.value; CB.a = []; CB.b = []; renderCB(); if(CB.mode === "trade") prefetchFC(); }
  if(id === "thr"){ S.threshold = +e.target.value; store.set("threshold", S.threshold); reanalyze(); }
  if(id === "hd"){ S.hideDone = e.target.checked; store.set("hideDone", S.hideDone); render(); }
});
document.addEventListener("focusin", e=>{ if(e.target.id === "uname") ORB.mode = "think"; });
document.addEventListener("focusout", e=>{ if(e.target.id === "uname" && currentView() === "connect") ORB.mode = "in"; });
// rotate the ask bar's suggestion
setInterval(()=>{ const q = $("askq"); if(!q || q.value || document.activeElement === q) return; const ideas = promptIdeas(); S.pi = ((S.pi||0) + 1) % ideas.length;
  q.style.setProperty("--x", 0); q.placeholder = ideas[S.pi]; }, 3200);
function reanalyze(){ runAnalysis(); render(); }
window.addEventListener("scroll", ()=>$("top").classList.toggle("scrolled", window.scrollY > 8), {passive:true});
$("refresh").onclick = ()=>{ S.sim = {}; loadAll(S.week, {quiet: S.results.length > 0}); };
$("wkprev").onclick = ()=>{ if(S.week > 1){ S.sim = {}; loadAll(S.week-1); } };
$("wknext").onclick = ()=>{ if(S.week < 18){ S.sim = {}; loadAll(S.week+1); } };

SPACE.init();
ORB.init();
if(S.username) S.loading = true;
render();
startup();
accInit();
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});

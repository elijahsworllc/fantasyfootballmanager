/* =====================================================================
   V2.3 · offers inbox, game-day run, Sleeper links that land
   ===================================================================== */

/* ---------- Sleeper links ----------
   Sleeper's app links (sleeper.com/.well-known/apple-app-site-association)
   only cover /topics, /channels, /topic and /message. League pages open the
   website, which asks you to log in on a phone. "App" mode links the league's
   chat channel, which the app claims; "Website" keeps the team page. */
const LINK = { mode(){ return store.get("linkMode", "web"); }, tested(){ return store.get("linkTested", false); } };
function leagueLink(id){ return LINK.mode() === "app" ? `https://sleeper.com/channels/${id}` : `https://sleeper.com/leagues/${id}/team`; }
function linkTestHTML(){
  if(LINK.tested()) return "";
  const r = S.results.find(x=>x.league && x.sev !== "off"); if(!r) return "";
  const id = r.league.league_id;
  return `<section class="linktest glass"><div class="t"><b>Make Open land in the right place</b><span>On this phone, try both links for ${esc(r.league.name)}, then keep the one that opened your league.</span></div>
    <div class="row"><a class="ghost" href="https://sleeper.com/channels/${id}" target="_blank" rel="noopener" data-nolog="1">Try app link ${ICON.ext}</a><a class="ghost" href="https://sleeper.com/leagues/${id}/team" target="_blank" rel="noopener" data-nolog="1">Try website ${ICON.ext}</a></div>
    <div class="row"><span class="sub">Which worked?</span><button class="ghost tint" data-linkmode="app">App link</button><button class="ghost tint" data-linkmode="web">Website</button><button class="ghost" data-linkmode="none">Neither</button></div></section>`;
}

/* ---------- the exact moves for one league, slot by slot ---------- */
function movesFor(r){
  // only real changes: who goes into the lineup, who comes out, and the slot he lands in
  if(!r.moves || !r.slots || !r.opt) return [];
  const info = p => p && p !== "0" ? (r._c[p] ||= pinfo(p, r.league)) : null, out = [];
  const ins = r.moves.ins || [], outs = r.moves.outs || [];
  ins.forEach((x, i)=>{ const a = info(x.pid) || x, b = outs[i] ? (info(outs[i].pid) || outs[i]) : null, k = r.opt.indexOf(x.pid);
    out.push({slot: k >= 0 ? (SLOT_LABEL[r.slots[k]] || r.slots[k]) : "", a, b}); });
  outs.slice(ins.length).forEach(x=>{ const b = info(x.pid) || x; out.push({slot:"Bench", a:null, b}); });
  return out;
}
function moveLine(m){
  const tag = f => f ? (f.reason ? (f.reason === "Bye week" ? "BYE" : f.reason) : f.status ? f.status.toUpperCase() : "") : "";
  return `<div class="mvr"><span class="mslot">${esc(m.slot)}</span><span class="t">${m.a ? `<b>Start ${esc(m.a.full)}</b> <small>${m.a.pos} · ${esc(m.a.team || "FA")} · ${fmt(m.a.eff)}</small>` : `<b>Bench ${esc(m.b ? m.b.full : "")}</b>`}
    ${m.b ? `<span class="out">for ${esc(m.b.full)}${tag(m.b) ? ` <i>${esc(tag(m.b))}</i>` : ""} · ${fmt(m.b.eff)}</span>` : `<span class="out">empty slot</span>`}</span></div>`;
}
function movesText(r){ return `${r.league.name}: ` + movesFor(r).map(m=>`${m.slot} ${m.a ? m.a.full : "empty"}${m.b ? ` (for ${m.b.full})` : ""}`).join("; "); }

/* ---------- coming back from Sleeper: was it done? ---------- */
const BACK = {lid:null, ts:0};
document.addEventListener("click", e=>{ const a = e.target.closest('a[href*="sleeper.com/"]'); if(!a || a.dataset.nolog) return;
  const m = a.href.match(/(?:leagues|channels)\/(\d+)/); if(m){ BACK.lid = m[1]; BACK.ts = Date.now(); } }, true);
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState !== "visible" || !BACK.lid) return;
  if(Date.now() - BACK.ts > 30*6e4){ BACK.lid = null; return; }
  if(RUN.on){ RUN.back = true; renderRun(); return; }
  if(!isDone(BACK.lid)) showBackBar(BACK.lid); });
function showBackBar(lid){
  const r = S.results.find(x=>x.league && x.league.league_id === lid); if(!r) return;
  let bar = $("backbar"); if(!bar){ bar = document.createElement("div"); bar.id = "backbar"; bar.className = "backbar glass"; bar.setAttribute("role", "status"); document.body.appendChild(bar); }
  bar.innerHTML = `<span class="t"><b>Back from ${esc(r.league.name)}</b><small>Lineup set the way it should be?</small></span><button class="ghost tint" data-backdone="${lid}">Done ✓</button><button class="ghost" data-backx="1" aria-label="Not yet">Not yet</button>`;
  bar.hidden = false;
}
function hideBackBar(){ const b = $("backbar"); if(b) b.hidden = true; BACK.lid = null; }

/* ---------- game-day run: one league at a time, exact moves, open, done, next ---------- */
const RUN = {on:false, ids:[], i:0, done:0, skipped:0, back:false};
function runQueue(){
  const locks = lockMap();
  return Object.keys(locks).filter(id=>!isDone(id)).sort((a,b)=>locks[a].k.ts - locks[b].k.ts || (locks[a].kind === "fix" ? 0 : 1) - (locks[b].kind === "fix" ? 0 : 1));
}
function runEntryHTML(){
  const q = runQueue(); if(!q.length) return "";
  const nl = lockMap()[q[0]];
  return `<button class="runbtn" data-runstart="1"><span class="t"><b>Game-day run · ${q.length} league${q.length>1?"s":""}</b><small>Exact moves for each, one at a time. First lock ${esc(kickLabel(nl.k))}</small></span><span class="go">Start →</span></button>`;
}
function startRun(){ RUN.ids = runQueue(); RUN.i = 0; RUN.done = 0; RUN.skipped = 0; RUN.back = false; RUN.on = true; renderRun(); document.body.style.overflow = "hidden"; }
function endRun(){ RUN.on = false; const el = $("runner"); if(el) el.hidden = true; document.body.style.overflow = ""; render(); }
function renderRun(){
  let el = $("runner"); if(!el){ el = document.createElement("div"); el.id = "runner"; el.className = "runner"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Game-day run"); document.body.appendChild(el); }
  el.hidden = !RUN.on; if(!RUN.on) return;
  const n = RUN.ids.length;
  if(RUN.i >= n){
    el.innerHTML = `<div class="rwrap"><div class="rtop"><span class="lab">Game-day run</span><button class="iconbtn" data-runx="1" aria-label="Close">✕</button></div>
      <div class="rdone"><h2 class="h1">All set</h2><p class="sub">${RUN.done} league${RUN.done===1?"":"s"} marked done${RUN.skipped ? `, ${RUN.skipped} skipped. Skipped leagues stay on your Lineups list` : ""}.</p><button class="primary" data-runx="1">Back to the app</button></div></div>`;
    return;
  }
  const id = RUN.ids[RUN.i], r = S.results.find(x=>x.league && x.league.league_id === id), lk = lockMap()[id];
  if(!r){ RUN.i++; renderRun(); return; }
  const mv = movesFor(r), checks = r.issues.filter(x=>x.sev === "warn"), m = r.match;
  el.innerHTML = `<div class="rwrap">
    <div class="rtop"><span class="lab">League ${RUN.i+1} of ${n}</span><button class="iconbtn" data-runx="1" aria-label="End the run">✕</button></div>
    <div class="bar"><i style="width:${RUN.i/n*100}%"></i></div>
    <div class="rhead"><span class="lock${lk && hoursTo(lk.k.ts) < 3 ? " hot" : ""}">${lk ? `Locks ${esc(kickLabel(lk.k))} · ${esc(untilText(lk.k.ts))}` : "No lock time"}</span>
      <h2 class="h1">${esc(r.league.name)}</h2>
      ${m ? `<div class="sub">Projected ${fmt(m.me)}${r.moves ? ` → <b style="color:var(--ok)">${fmt(m.meOpt)}</b>` : ""} vs ${fmt(m.opp)}</div>` : ""}</div>
    ${mv.length ? `<section class="mvlist glass"><div class="lab">Make these moves</div>${mv.map(moveLine).join("")}</section>` : ""}
    ${checks.length ? `<section class="mvlist glass"><div class="lab">Check before kickoff</div>${checks.map(x=>`<div class="mvr"><span class="mslot w">!</span><span class="t">${esc(x.text)}</span></div>`).join("")}</section>` : ""}
    ${!mv.length && !checks.length ? `<div class="empty">Nothing to change here anymore.</div>` : ""}
    <div class="ractions">
      ${RUN.back ? `<div class="backq">Back from Sleeper. Is this one set?</div>` : ""}
      <a class="primary open" href="${leagueLink(id)}" target="_blank" rel="noopener">Open in Sleeper ${ICON.ext}</a>
      <div class="row"><button class="ghost tint${RUN.back ? " pulse2" : ""}" data-rundone="1">Done ✓ · next</button><button class="ghost" data-runskip="1">Skip</button>${mv.length ? `<button class="ghost" data-copy="${esc(movesText(r))}" data-label="Copy moves">Copy moves</button>` : ""}</div>
    </div>
    <p class="src">Moves use this league's scoring and each player's injury status. Questionable counts at 85%.</p></div>`;
}

/* ---------- offers inbox: offers you received, graded, with counters ---------- */
const INBOX = { all(){ return store.get("inbox", []); }, save(a){ store.set("inbox", a.slice(0, 80)); } };
const BAND = {lowball:{label:"Lowball", cls:"p-crit"}, close:{label:"Close", cls:"p-warn"}, smash:{label:"Smash accept", cls:"p-ok"}};
function offerAssets(team, fc){ return trAssets(team, fc); }
const evenness = (G, R) => (tradeValue(R) - tradeValue(G))/Math.max(tradeValue(G), tradeValue(R), 1);
function countersFor(b, partner, give, get, band, fc){
  if(band === "smash") return [];
  const me = b.me, out = [];
  const g0 = trPick(me, give), r0 = trPick(partner, get), used = new Set(g0.concat(r0).map(a=>a.uid));
  const mine = offerAssets(me, fc).filter(a=>!used.has(a.uid) && a.v > 0), theirs = offerAssets(partner, fc).filter(a=>!used.has(a.uid) && a.v > 0);
  const weak = ["QB","RB","WR","TE"].filter(p=>["D","F"].includes(me.grades[p]));
  const best = list => list.filter(z=>z.d >= -0.04).sort((x,y)=>Math.abs(x.d) - Math.abs(y.d))[0];
  // 1. ask for a player, ideally at a weak spot
  const pc = theirs.filter(a=>!a.pk).map(a=>({a, d:evenness(give, get.concat(a))}));
  const pw = best(pc.filter(z=>weak.includes(z.a.pos))) || best(pc);
  if(pw) out.push({kind:"ask", label:`Ask for ${pw.a.name} too`, why: weak.includes(pw.a.pos) ? `Fills your ${pw.a.pos}, graded ${me.grades[pw.a.pos]} in this league` : "Closes the value gap", give, get:get.concat(pw.a), d:pw.d});
  // 2. ask for a pick
  const kk = best(theirs.filter(a=>a.pk).map(a=>({a, d:evenness(give, get.concat(a))})));
  if(kk) out.push({kind:"pick", label:`Add their ${kk.a.name}`, why:"Picks are the easiest add for them to say yes to", give, get:get.concat(kk.a), d:kk.d});
  // 3. send less: drop a piece, or swap your main piece down
  if(give.length >= 2){ const dl = best(give.map(g=>({a:g, d:evenness(give.filter(x=>x.id !== g.id), get)})));
    if(dl) out.push({kind:"less", label:`Keep ${dl.a.name}`, why:"Same deal without that piece", give:give.filter(x=>x.id !== dl.a.id), get, d:dl.d}); }
  else if(give.length === 1){ const g = give[0], sw = best(mine.filter(a=>a.v < g.v && (a.pos === g.pos || a.pk)).map(a=>({a, d:evenness([a], get)})));
    if(sw) out.push({kind:"swap", label:`Offer ${sw.a.name} instead of ${g.name}`, why: sw.a.pk ? "A pick instead of the player" : `Same position, less value out the door`, give:[sw.a], get, d:sw.d}); }
  return out.slice(0, 3);
}
async function reviewOffer(lid, rid, give, get){
  while(S.bpLoading) await sleep(200);
  if(!S.bp) await loadBlueprints();
  const b = (S.bp||[]).find(z=>z.lg.league_id === lid); if(!b) throw new Error("No roster values for this league yet");
  const partner = b.teams.find(t=>t.rid === rid); if(!partner) throw new Error("That team isn't in this league");
  const fc = await fcValues(fcKey(b.lg));
  const prev = {mode:CB.mode, league:CB.league, a:CB.a, b:CB.b};
  CB.mode = "trade"; CB.league = lid; CB.a = give.map(a=>({id:a.id, name:a.name, v:a.v})); CB.b = get.map(a=>({id:a.id, name:a.name, v:a.v}));
  let ans; try{ ans = await answerTrade(); } finally { Object.assign(CB, prev); }
  const m = ans.m || {};
  const band = m.score > 0.06 || (m.diff >= 0.10 && m.fit > -0.02) ? "smash" : m.score < -0.06 || m.diff <= -0.15 ? "lowball" : "close";
  return {v:ans.v, conf:ans.conf, m, flip:ans.flip, band, counters:countersFor(b, partner, give, get, band, fc), at:Date.now()};
}
async function saveOffer(){
  if(TR.saving || !TR.lid || TR.partner == null || !TR.give.length || !TR.get.length) return;
  TR.saving = true; renderCB();
  try{
    const b = trBp(), partner = b.teams.find(t=>t.rid === TR.partner);
    const slim = a => ({uid:a.uid, id:a.id, name:a.name, pos:a.pos, v:Math.round(a.v||0), pk:!!a.pk});
    const give = TR.give.map(slim), get = TR.get.map(slim);
    const rev = await reviewOffer(TR.lid, TR.partner, give, get);
    const a = INBOX.all(), key = TR.lid + "|" + give.map(x=>x.id).join("+") + ">" + get.map(x=>x.id).join("+");
    const o = {key, lid:TR.lid, league:b.lg.name, rid:TR.partner, partner:partner.name, give, get, ts:Date.now(), status:"open", rev};
    INBOX.save([o].concat(a.filter(z=>z.key !== key)));
    TR.saving = false; TR.inbox = false; S.oftab = "recv"; S.ofI = 0;
    showToast(`Saved: ${BAND[rev.band].label}`); go("offers");
  }catch(e){ TR.saving = false; renderCB(); showToast("Couldn't grade it: " + (e.message || e)); }
}
function inboxStats(){ const a = INBOX.all(); return {all:a, open:a.filter(o=>o.status === "open")}; }
function offerCardHTML(o, step){
  const r = o.rev || {}, m = r.m || {}, band = BAND[r.band] || BAND.close;
  const list = xs => xs.map(a=>`<span class="oa"><b>${esc(a.name)}</b><small>${a.pk ? "pick" : a.pos} · ${Number(a.v||0).toLocaleString()}</small></span>`).join("");
  const rk = (a, b2) => a == null || b2 == null ? "–" : `${ord(a)} → ${ord(b2)}`;
  const cell = (k, v, tone) => `<div class="icell${tone ? " "+tone : ""}"><span>${k}</span><b>${v}</b></div>`;
  const valTone = m.diff >= 0.03 ? "up" : m.diff <= -0.05 ? "down" : "";
  const nowTone = m.nowR < m.now0 ? "up" : m.nowR > m.now0 ? "down" : "", futTone = m.futR < m.fut0 ? "up" : m.futR > m.fut0 ? "down" : "";
  const fitTxt = m.fit > 0.01 ? "Fits" : m.fit < -0.01 ? "Cuts against" : "Neutral";
  const msg = c => `Hey ${o.partner}, thanks for the offer. I'd do ${c.give.map(a=>a.name.replace(" (via trade)","")).join(" + ")} for ${c.get.map(a=>a.name.replace(" (via trade)","")).join(" + ")}. Let me know.`;
  const cb = c => esc(JSON.stringify({lid:o.lid, rid:o.rid, give:c.give, get:c.get}));
  return `<article class="offer inbox glass" data-ofkey="${esc(o.key)}">
    <div class="oh"><span class="t"><b>${esc(o.partner)}</b><small>${esc(o.league)} · logged ${esc(ago(o.ts))}${o.status !== "open" ? ` · ${o.status}` : ""}</small></span><span class="pill ${band.cls}">${band.label}</span></div>
    <div class="og"><div><span class="k out">You send</span>${list(o.give)}</div><div><span class="k in">You get</span>${list(o.get)}</div></div>
    <div class="impact">${cell("Value", m.diff == null ? "–" : `${m.diff >= 0 ? "+" : ""}${Math.round(m.diff*100)}%`, valTone)}${cell("Win-now", rk(m.now0, m.nowR), nowTone)}${cell("Future", rk(m.fut0, m.futR), futTone)}${cell("Plan fit", fitTxt, m.fit > 0.01 ? "up" : m.fit < -0.01 ? "down" : "")}</div>
    <div class="ov"><b>${esc(r.v || "")}</b>${m.gradeMoves && m.gradeMoves.length ? ` · ${esc(m.gradeMoves.join(", "))}` : ""}${r.flip ? `<small>${esc(r.flip)}</small>` : ""}</div>
    ${r.band === "smash" ? `<div class="cnote">Don't counter: it's a win for you and fits the plan. Accept before they rethink it.</div>`
      : r.counters && r.counters.length ? `<div class="counters"><div class="lab">${r.band === "lowball" ? "Counter to make it fair" : "Small asks that tip it your way"}</div>${r.counters.map(c=>`<div class="ctr"><span class="t"><b>${esc(c.label)}</b><small>${esc(c.why)} · new gap ${c.d >= 0 ? "+" : ""}${Math.round(c.d*100)}%</small></span>
        <span class="cbtns"><button class="ghost tint" data-copy="${esc(msg(c))}" data-label="Copy" data-ofcounter="${esc(o.key)}">Copy</button><button class="ghost" data-ofcheck="${cb(c)}">Check</button></span></div>`).join("")}</div>`
      : `<div class="cnote">No clean counter in their roster. Decline, or ask what else they'd add.</div>`}
    <div class="cfoot" style="padding:0">${o.status === "open" ? `<button class="ghost tint" data-ofset="${esc(o.key)}|accepted">Accept ✓</button><button class="ghost" data-ofset="${esc(o.key)}|declined">Decline</button>` : `<button class="ghost" data-ofset="${esc(o.key)}|open">Reopen</button>`}<button class="ghost" data-ofrecheck="${esc(o.key)}">Re-grade</button><a class="ghost" href="${leagueLink(o.lid)}" target="_blank" rel="noopener">Sleeper ${ICON.ext}</a><button class="ghost" data-ofdel="${esc(o.key)}" aria-label="Remove">Remove</button></div>
  </article>`;
}
function receivedHTML(){
  const {all, open} = inboxStats();
  let h = `<div class="inboxbar"><button class="primary" data-oflog="1">+ Log an offer</button><span class="sub">Sleeper doesn't share pending offers with other apps yet, so log each one here. It takes about 20 seconds.</span></div>`;
  if(!all.length) return h + `<div class="empty">No offers logged. When one lands in Sleeper, tap <b>Log an offer</b>, pick the league and the sender, and tap the players on each side. You'll get a lowball, close or smash grade, what it does to your team now and later, and counters ready to copy.</div>`;
  const step = S.ofView !== "list" && open.length > 1;
  h += `<div class="seg sm" role="tablist" style="--n:2;--i:${step ? 0 : 1}"><button role="tab" data-ofview="step" aria-selected="${step}">One at a time</button><button role="tab" data-ofview="list" aria-selected="${!step}">List</button><i aria-hidden="true"></i></div>`;
  if(step){ S.ofI = Math.min(Math.max(0, S.ofI||0), open.length - 1);
    h += `<div class="ofstep"><button class="ghost" data-ofi="-1"${S.ofI ? "" : " disabled"}>‹ Prev</button><span class="sub">Offer ${S.ofI+1} of ${open.length} to answer</span><button class="ghost" data-ofi="1"${S.ofI < open.length-1 ? "" : " disabled"}>Next ›</button></div>` + offerCardHTML(open[S.ofI], true);
    const doneN = all.length - open.length; if(doneN) h += `<p class="note">${doneN} answered offer${doneN>1?"s":""} in the List view.</p>`;
    return h; }
  const order = all.slice().sort((a,b)=>(a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || b.ts - a.ts);
  return h + order.map(o=>offerCardHTML(o)).join("");
}
function viewOffers(){
  const o = offerStats(), ib = inboxStats();
  if(!["recv","sent"].includes(S.oftab)) S.oftab = "recv";
  let h = `<section class="pagehead">${backBtn("trades","Trades")}<h1 class="h1">Offers</h1><div class="sub">${S.oftab === "recv" ? "Offers you received: graded on value, your win-now and future rank, and your plan, with counters ready to send." : "Every trade message you copy is saved here. Mark the answer when it comes back so you know who to nudge."}</div></section>
    <div class="seg" role="tablist" style="--n:2;--i:${S.oftab === "recv" ? 0 : 1}"><button role="tab" data-oftab="recv" aria-selected="${S.oftab==="recv"}">Received${ib.open.length ? `<span class="ct">${ib.open.length}</span>` : ""}</button><button role="tab" data-oftab="sent" aria-selected="${S.oftab==="sent"}">Sent${o.waiting ? `<span class="ct">${o.waiting}</span>` : ""}</button><i aria-hidden="true"></i></div>`;
  if(S.oftab === "recv") return h + receivedHTML();
  if(!o.all.length) return h + `<div class="empty">No sent offers yet. Open a team's trade recs and tap <b>Copy message</b>: the offer lands here.<div style="margin-top:12px"><button class="ghost go" data-go="trades">Find trades →</button></div></div>`;
  h += `<section class="stats"><div><b>${o.waiting}</b><span>waiting on an answer</span></div><div><b style="color:var(--warn)">${o.nudge}</b><span>need a nudge (2+ days)</span></div><div><b style="color:var(--ok)">${o.rate == null ? "—" : pct(o.rate)}</b><span>accepted, of answered</span></div></section>`;
  for(const [st, label] of OF_STATUS){
    const list = o.all.filter(x=>x.status === st); if(!list.length) continue;
    h += `<section style="display:flex;flex-direction:column;gap:10px"><div class="sec"><h2 class="h2">${label}</h2><span class="sub">${list.length}</span></div>${list.map(x=>{
      const old = st === "sent" && Date.now() - x.ts > 2*864e5;
      const nudge = `Hey ${x.partner}, circling back on ${x.give.join(" + ")} for ${x.get.join(" + ")}. Still open to it, and happy to hear a counter.`;
      return `<article class="offer glass${old ? " old" : ""}"><div class="oh"><span class="t"><b>${esc(x.partner)}</b><small>${esc(x.league)} · ${st === "sent" ? "sent" : "updated"} ${esc(ago(x.ts))}</small></span>${old ? `<span class="pill p-warn">Nudge</span>` : ""}</div>
        <div class="gs"><span class="k in">Get</span><span>${x.get.map(esc).join("<br>")}</span><span class="k out">Send</span><span>${x.give.map(esc).join("<br>")}</span></div>
        <div class="seg sm" role="radiogroup" aria-label="Answer" style="--n:4;--i:${OF_STATUS.findIndex(s=>s[0] === st)}">${OF_STATUS.map(([k,l])=>`<button role="radio" aria-checked="${k === st}" data-ofs="${esc(x.key)}|${k}">${l}</button>`).join("")}<i aria-hidden="true"></i></div>
        <div class="cfoot" style="padding:0">${old ? `<button class="ghost tint" data-copy="${esc(nudge)}" data-label="Copy nudge">Copy nudge</button>` : ""}${x.cb ? `<button class="ghost" data-cbt="${esc(JSON.stringify(x.cb))}">Re-check</button>` : ""}<a class="ghost" href="${leagueLink(x.lid)}" target="_blank" rel="noopener">Sleeper ${ICON.ext}</a><button class="ghost" data-ofrm="${esc(x.key)}" aria-label="Remove this offer">Remove</button></div></article>`; }).join("")}</section>`;
  }
  return h;
}
function loadIntoBuilder(d, run){
  TR.lid = d.lid; TR.partner = d.rid; TR.give = []; TR.get = []; TR.answer = null; TR.side = "get"; TOOL.mode = "trade"; CB.mode = "trade";
  go("ask");
  trEnsure().then(()=>{ const b = trBp(); if(!b) return; const p = b.teams.find(t=>t.rid === d.rid);
    const pick = (team, list) => trPick(team, list);
    TR.give = pick(b.me, d.give); TR.get = p ? pick(p, d.get) : []; renderCB(); if(run && TR.give.length && TR.get.length) trCheck(); });
}

/* ---------- wiring ---------- */
document.addEventListener("click", e=>{
  const el = e.target.closest("[data-linkmode],[data-backdone],[data-backx],[data-runstart],[data-runx],[data-rundone],[data-runskip],#trSave,[data-oftab],[data-oflog],[data-ofview],[data-ofi],[data-ofset],[data-ofdel],[data-ofrecheck],[data-ofcheck],[data-ofcounter]"); if(!el) return;
  const d = el.dataset;
  if(d.linkmode){ if(d.linkmode !== "none") store.set("linkMode", d.linkmode); store.set("linkTested", true); showToast(d.linkmode === "app" ? "Open buttons now use the app link" : d.linkmode === "web" ? "Open buttons use the website" : "Kept the website link. Tell us what happened"); render(); return; }
  if(d.backdone){ store.set(doneKey(d.backdone), true); hideBackBar(); showToast("Marked done"); render(); return; }
  if(d.backx){ hideBackBar(); return; }
  if(d.runstart){ startRun(); return; }
  if(d.runx){ endRun(); return; }
  if(d.rundone){ const id = RUN.ids[RUN.i]; if(id) store.set(doneKey(id), true); RUN.done++; RUN.i++; RUN.back = false; BACK.lid = null; haptic(); renderRun(); const w = $("runner"); if(w) w.scrollTop = 0; return; }
  if(d.runskip){ RUN.skipped++; RUN.i++; RUN.back = false; BACK.lid = null; renderRun(); const w = $("runner"); if(w) w.scrollTop = 0; return; }
  if(el.id === "trSave"){ saveOffer(); return; }
  if(d.oftab){ S.oftab = d.oftab; render(); return; }
  if(d.oflog){ TR.inbox = true; TR.give = []; TR.get = []; TR.partner = null; TR.answer = null; TR.side = "give"; TOOL.mode = "trade"; CB.mode = "trade"; go("ask"); return; }
  if(d.ofview){ S.ofView = d.ofview; render(); return; }
  if(d.ofi){ S.ofI = (S.ofI||0) + (+d.ofi); render(); return; }
  if(d.ofset){ const i = d.ofset.lastIndexOf("|"), key = d.ofset.slice(0,i), st = d.ofset.slice(i+1), a = INBOX.all(), o = a.find(z=>z.key === key);
    if(o){ o.status = st; INBOX.save(a); if(st !== "open") showToast(st === "accepted" ? "Accepted: make it official in Sleeper" : "Declined"); } render(); return; }
  if(d.ofdel){ INBOX.save(INBOX.all().filter(z=>z.key !== d.ofdel)); render(); return; }
  if(d.ofrecheck){ const a = INBOX.all(), o = a.find(z=>z.key === d.ofrecheck); if(!o) return; el.textContent = "Grading…";
    reviewOffer(o.lid, o.rid, o.give, o.get).then(rev=>{ o.rev = rev; INBOX.save(a); render(); }).catch(err=>{ showToast("Couldn't re-grade: " + (err.message||err)); render(); }); return; }
  if(d.ofcheck){ try{ loadIntoBuilder(JSON.parse(d.ofcheck), true); }catch(_){} return; }
  if(d.ofcounter){ setTimeout(()=>{ const a = INBOX.all(), o = a.find(z=>z.key === d.ofcounter); if(o && o.status === "open"){ o.status = "countered"; INBOX.save(a); showToast("Counter copied · offer marked countered"); render(); } }, 700); return; }
});
document.addEventListener("change", e=>{ if(e.target.id === "lkm"){ store.set("linkMode", e.target.value); store.set("linkTested", true); render(); } });
document.addEventListener("click", e=>{ if(e.target.closest("[data-linkretest]")){ store.set("linkTested", false); go("fix"); } });

/* ---------- recent trades across every league, and what each one did ----------
   Rosters today already include the trade, so "after" is the current state and
   "before" is rebuilt by undoing the swap: lineup points, playoff odds (same
   simulation as the Teams screen), rest-of-season rank and future-value rank. */
const RT = {f:"all", cache:{}};
function recentTrades(days = 21){
  if(!S.tx) return null;
  const lgName = {}; for(const r of S.results) if(r.league) lgName[r.league.league_id] = r.league.name;
  const out = [];
  for(const [lid, arr] of Object.entries(S.tx.byLeague)) for(const t of arr)
    if(t.type === "trade" && t.status === "complete" && Date.now() - t.ts < days*864e5 && lgName[lid]) out.push({...t, lid, league:lgName[lid]});
  return out.sort((a,b)=>b.ts - a.ts);
}
function tradeImpact(t){
  if(RT.cache[t.id]) return RT.cache[t.id];
  const L = S.dir && S.dir.leagues && S.dir.leagues[t.lid]; if(!L) return null;
  const T = t.rids.map(rid=>L.teams.find(x=>x.rid === rid)).filter(Boolean); if(T.length < 2) return null;
  const plOf = id => { for(const x of L.teams){ const p = x.bp.pl.find(q=>q.id === id); if(p) return p; } return null; };
  const pkVal = k => { for(const x of L.teams){ const p = x.bp.picks.find(q=>q.season === k.season && q.round === k.round && q.orig === k.orig); if(p) return p.val || 0; } return 0; };
  const yv = ids => ids.reduce((s,id)=>{ const p = plOf(id); return s + (p && isYoung(p) ? p.v : 0); }, 0);
  const proj = {}, young = {}, adj = {};
  for(const x of L.teams){ proj[x.rid] = x.proj; young[x.rid] = x.bp.young; }
  const side = {};
  for(const x of T){
    const recv = Object.keys(t.adds).filter(id=>t.adds[id] === x.rid), sent = Object.keys(t.drops).filter(id=>t.drops[id] === x.rid);
    const pIn = t.picks.filter(p=>p.to === x.rid), pOut = t.picks.filter(p=>p.from === x.rid);
    const before = x.ids.filter(id=>!recv.includes(id)).concat(sent);
    const pb = lineupPts(L.lg, before, L.cache).pts;
    adj[x.i] = pb - x.proj; proj[x.rid] = pb;
    young[x.rid] = x.bp.young - yv(recv) + yv(sent) - pIn.reduce((s,k)=>s+pkVal(k),0) + pOut.reduce((s,k)=>s+pkVal(k),0);
    side[x.rid] = {recv, pIn};
  }
  const base = L.base800 ||= simulate(L, null, 800, 11), bef = simulate(L, adj, 800, 11);
  const clamp = v => Math.max(0, Math.min(1, v));
  const rankIn = (map, rid) => 1 + Object.entries(map).filter(([k,v])=>+k !== rid && v > map[rid]).length;
  const nowProj = {}, nowYoung = {}; for(const x of L.teams){ nowProj[x.rid] = x.proj; nowYoung[x.rid] = x.bp.young; }
  const res = T.map(x=>({rid:x.rid, name:x.bp.name, mine:x.bp.rid === L.me.bp.rid, recv:side[x.rid].recv, pIn:side[x.rid].pIn,
    po0:clamp(x.odds.po + bef[x.i].po - base[x.i].po), po1:x.odds.po,
    r0:rankIn(proj, x.rid), r1:rankIn(nowProj, x.rid), f0:rankIn(young, x.rid), f1:rankIn(nowYoung, x.rid), N:L.teams.length,
    dPts:x.proj - proj[x.rid]}));
  return RT.cache[t.id] = res;
}
function recentTradesHTML(){
  let h = `<section id="recenttrades" style="display:flex;flex-direction:column;gap:10px;scroll-margin-top:120px"><div class="sec"><h2 class="h2">Recent trades</h2><span class="sub">Last 3 weeks, every league</span></div>`;
  if(!S.tx){ if(!S.txP) loadTx().then(()=>render()).catch(()=>{}); return h + `<div class="statusline"><span class="livedot" style="background:var(--violet)"></span>Reading this season's trades…</div></section>`; }
  let list = recentTrades() || [];
  const mineLids = new Set(), myRid = {}; for(const b of S.bp||[]) if(b.me){ myRid[b.lg.league_id] = b.me.rid; }
  const isMine = t => t.rids.includes(myRid[t.lid]);
  const nMine = list.filter(isMine).length;
  h += `<div class="chips"><button class="chip" data-rtf="all" aria-pressed="${RT.f==="all"}">All · ${list.length}</button><button class="chip" data-rtf="mine" aria-pressed="${RT.f==="mine"}">My trades · ${nMine}</button></div>`;
  if(RT.f === "mine") list = list.filter(isMine);
  if(!list.length) return h + `<div class="empty">No completed trades in the last 3 weeks${RT.f === "mine" ? " involving you" : ""}.</div></section>`;
  const sim = !!S.dir;
  if(!sim) h += `<div class="inboxnote glass"><b>See what each trade did.</b> Playoff odds and ranks before and after need the season simulation (the same one as Teams → Playoff odds). <button class="ghost tint" data-rtsim="1" style="margin-top:8px"${S.dirLoading ? " disabled" : ""}>${S.dirLoading ? "Simulating…" : "Run it"}</button></div>`;
  const nameOf = (lid, rid) => { const b = (S.bp||[]).find(z=>z.lg.league_id === lid); const t = b && b.teams.find(z=>z.rid === rid); return t ? t.name : `Team ${rid}`; };
  const pk = p => `${p.season} ${["1st","2nd","3rd","4th","5th"][p.round-1] || "R"+p.round}${p.orig !== p.to ? ` (${nameOf(currentLid, p.orig)})` : ""}`;
  let currentLid = null;
  const show = list.slice(0, RT.more ? 40 : 12);
  h += show.map(t=>{ currentLid = t.lid; const imp = sim ? tradeImpact(t) : null;
    const sides = t.rids.map(rid=>({rid, name:nameOf(t.lid, rid), recv:Object.keys(t.adds).filter(id=>t.adds[id] === rid), pIn:t.picks.filter(p=>p.to === rid)}));
    const dl = (a, b, f, better) => a == null ? "–" : f(a) === f(b) ? `<span>${f(a)} → ${f(b)}</span>` : `<span class="${better(b, a) ? "up" : "down"}">${f(a)} → ${f(b)}</span>`;
    return `<article class="rtrade glass${isMine(t) ? " mine" : ""}"><div class="oh"><span class="t"><b>${esc(t.league)}</b><small>${new Date(t.ts).toLocaleDateString([], {month:"short", day:"numeric"})}${isMine(t) ? " · your trade" : ""}</small></span><button class="ghost" data-team="${t.lid}" data-from="trades">Team ›</button></div>
      ${sides.map(s=>{ const z = imp && imp.find(q=>q.rid === s.rid);
        return `<div class="rtside${z && z.mine ? " me" : ""}"><div class="rtname"><b>${esc(s.name)}${z && z.mine ? " (you)" : ""}</b> gets <span>${s.recv.map(id=>esc(pname(id))).concat(s.pIn.map(p=>esc(pk(p)))).join(", ") || "nothing listed"}</span></div>
          ${z ? `<div class="rtimp"><span>Playoffs ${dl(z.po0, z.po1, pct, (b,a)=>b>a)}</span><span>Rest of season ${dl(z.r0, z.r1, ord, (b,a)=>b<a)}</span><span>Future ${dl(z.f0, z.f1, ord, (b,a)=>b<a)}</span><span>Lineup <b class="${z.dPts >= 0.05 ? "up" : z.dPts <= -0.05 ? "down" : ""}">${sgn(z.dPts)}</b> pts/wk</span></div>` : ""}</div>`; }).join("")}
    </article>`; }).join("");
  if(list.length > show.length) h += `<button class="ghost" data-rtmore="1" style="align-self:flex-start">Show ${Math.min(40, list.length) - show.length} more</button>`;
  return h + `<p class="src">Ranks are among the ${"teams"} in that league: rest of season by projected weekly lineup in that league's scoring, future by young players and picks (FantasyCalc). "Before" undoes the trade on today's rosters, so later moves by either team are counted on both sides. Playoff odds from 1,000 simulated seasons.</p></section>`;
}
document.addEventListener("click", e=>{
  const el = e.target.closest("[data-rtf],[data-rtsim],[data-rtmore]"); if(!el) return;
  if(el.dataset.rtf){ RT.f = el.dataset.rtf; render(); return; }
  if(el.dataset.rtsim){ loadDirection(); render(); return; }
  if(el.dataset.rtmore){ RT.more = true; render(); return; }
});

/* ---------- show the math: every value in the trade calculator, taken apart ----------
   Nothing here is a new number: it reads the same inputs the calculator uses and
   says where each came from, so any value can be defended or challenged. */
function settingsGaps(lg, meta){
  const ss = lg.scoring_settings || {}, rp = lg.roster_positions || [], out = [];
  const N = lg.total_rosters || 12, rec = ss.rec || 0;
  if(meta){
    if(meta.teams !== N) out.push(`${N} teams, priced as ${meta.teams}`);
    if(Math.abs(meta.ppr - rec) > 0.01) out.push(`${rec} per catch, priced as ${meta.ppr} PPR`);
  }
  if(ss.bonus_rec_te) out.push(`TE premium +${ss.bonus_rec_te} per catch`);
  if(ss.bonus_rec_rb) out.push(`RB catch bonus +${ss.bonus_rec_rb}`);
  if(ss.bonus_rec_wr) out.push(`WR catch bonus +${ss.bonus_rec_wr}`);
  if(ss.pass_td != null && ss.pass_td !== 4) out.push(`${ss.pass_td}-point passing TDs`);
  if(ss.pass_cmp) out.push(`+${ss.pass_cmp} per completion`);
  if(ss.rush_fd || ss.rec_fd) out.push(`first-down points`);
  if(ss.rush_att) out.push(`+${ss.rush_att} per carry`);
  const c = k => rp.filter(p=>p === k).length;
  if(c("WR") >= 3) out.push(`${c("WR")} WR starters`);
  if(c("FLEX") + c("WRRB_FLEX") + c("REC_FLEX") >= 3) out.push(`${c("FLEX") + c("WRRB_FLEX") + c("REC_FLEX")} flex spots`);
  if(c("TE") >= 2) out.push(`${c("TE")} TE starters`);
  if(rp.some(p=>["DL","LB","DB","IDP_FLEX"].includes(p))) out.push("IDP starters (no market value)");
  return out;
}
function whyRows(rows){ return `<div class="ledger">${rows.map(r=>`<div class="lrow${r.total ? " tot" : ""}"><span class="k">${r.k}</span><span class="v">${r.v}</span>${r.n ? `<span class="n">${r.n}</span>` : ""}</div>`).join("")}</div>`; }
const n0 = v => Math.round(v || 0).toLocaleString();
function whyPlayer(a, b){
  const fc = TR.fc, f = fc.players[a.id] || {}, meta = fc.meta || {}, lg = b.lg;
  const fmtName = `${meta.q === 2 ? "Superflex" : "1-QB"} · ${meta.teams} teams · ${meta.ppr} PPR · ${meta.dyn ? "dynasty" : "redraft"}`;
  const rows = [{k:"Market value", v:n0(f.v), n:`FantasyCalc ${meta.dyn ? "dynasty" : "redraft"} value for ${fmtName}. FantasyCalc builds it from real trades made in fantasy leagues, then fits every player to one scale.${f.rank ? ` Overall #${f.rank}${f.prank ? `, ${f.pos} #${f.prank}` : ""}.` : ""}`}];
  if(f.sd) rows.push({k:"How settled it is", v:`±${Math.round(f.sd)}%`, n:`How much this value has moved lately. A fair range today is ${n0(f.v*(1-f.sd/100))} to ${n0(f.v*(1+f.sd/100))}.${f.tf ? ` Traded often enough to trust (${typeof f.tf === "number" ? f.tf.toFixed(2) : f.tf} trade frequency).` : ""}`});
  if(f.trend) rows.push({k:"Last 30 days", v:`${f.trend > 0 ? "+" : ""}${n0(f.trend)}`, n: f.trend > 0 ? "Rising: the market is paying more for him than a month ago." : "Falling: the market is paying less than a month ago."});
  rows.push({k:"Redraft value", v:n0(f.r), n:"FantasyCalc's this-season value. The full trade check uses it to rebuild your best lineup (win-now rank)."});
  const wk = ppw(a.id, lg, {});
  rows.push({k:"In this league", v: wk ? `${fmt(wk)} pts/wk` : "–", n: wk ? "Projected weekly points with this league's own scoring (Sleeper projections, this week and next, adjusted for injury status). Used for lineups and playoff odds, not for the trade value." : "No projection this week (bye, injury or no team)."});
  if(f.age) rows.push({k:"Age", v:Math.floor(f.age), n: isYoung({pos:f.pos, age:f.age}) ? `Counts toward future value (a ${f.pos} ${f.pos === "RB" ? "24" : f.pos === "QB" ? "27" : "25"} or younger).` : isOld({pos:f.pos, age:f.age}) ? "Past this position's usual peak: counts as a win-now piece only." : "Prime years: counts toward win-now, not future value."});
  if(a.slot) rows.push({k:"Roster spot", v:a.slot, n: a.slot === "Taxi" ? "On a taxi squad: no effect on this week's lineup, full value in the trade." : "On injured reserve: full market value, no effect on this week's lineup."});
  const ad = a.adj;
  if(ad){ const e = Math.round((ad.rel - 1)*100), sa = scoringAdj(lg, fc);
    rows.push({k:"League scoring edge", v:`${e >= 0 ? "+" : ""}${e}%`, n: (ad.src === "player"
      ? `His projected stat line scores ${fmt(ad.L)} in ${esc(lg.name)}'s rules vs ${fmt(ad.B)} in the standard ${sa.ppr} PPR scoring the market assumes: ${e >= 0 ? "+" : ""}${e}% against the typical starter.`
      : `No projection for him right now, so this is the typical ${f.pos} difference under these rules.`)
      + (ad.priced ? ` You've chosen to price trades by league scoring (Settings), so it's applied to his trade value.`
      : ` Not added to his trade value: across ${CAL.n} trades in your leagues, managers paid market prices regardless of scoring rules (pricing it in made the fit worse). ${e >= 5 ? "So he's worth more to your lineup than he costs: a buy signal." : e <= -5 ? "So he's worth less to your lineup than the market pays: a sell signal." : ""} It does count toward your win-now lineup strength.`)}); }
  rows.push({k:"Used in the calculator", v:n0(a.v), total:true, n: ad && ad.priced && Math.abs(ad.mult - 1) >= 0.005 ? `Market value ${n0(f.v)} × ${ad.mult.toFixed(2)} for this league's scoring.` : "The market value, unchanged."});
  return rows;
}
function whyPick(a, b){
  const p = a.p || {}, src = p.src || {}, fc = TR.fc, nm = a.origName || "its original team";
  const rows = [];
  if(p.tier) rows.push({k:"Where it may land", v:p.tier, n:`${p.season} picks are slotted by how strong ${esc(nm)} is today: ${ord(p.origNowRank)} of ${p.N} in win-now lineup value. Bottom third = Early, middle = Mid, top third = Late.`});
  else rows.push({k:"Where it may land", v:"Unknown", n:`Too far out to slot. Priced as an average ${["1st","2nd","3rd","4th","5th","6th"][p.round-1] || "R"+p.round}.`});
  const how = {tier:`FantasyCalc price for "${src.key}"`, plain:`FantasyCalc price for "${src.key}" (no tiered price available)`, prev:src.note, deep:src.note, none:src.note}[src.how] || "FantasyCalc pick price";
  rows.push({k:"Market value", v:n0(p.val), n:how});
  rows.push({k:"Used in the calculator", v:n0(a.v), total:true, n:"The same number in the bar and in the full trade check."});
  return rows;
}
function whyPackage(){
  const pm = list => tradeValue(list), raw = list => list.reduce((s,a)=>s+(a.v||0),0);
  const sv = pm(TR.give), gv = pm(TR.get), diff = (gv - sv)/Math.max(sv, gv, 1);
  const side = (lab, list) => `<div class="lab">${lab}</div>` + whyRows(list.map(a=>({k:esc(a.name), v:n0(a.v)})).concat([{k:"Added up", v:n0(raw(list))}, {k:"After the stud premium", v:n0(pm(list)), total:true}]));
  return side("You send", TR.give) + side("You get", TR.get) +
    `<div class="lab">How the stud premium works</div><p class="whyp">Each value is raised to the ${STUD_P} power, the results are added, then the ${STUD_P}th root is taken. One great player keeps his full value; several good ones lose some, because a roster spot and a starting slot are worth something. Example: two 3,000 players add up to 6,000 but count as ${n0(pm([{v:3000},{v:3000}]))}; one 6,000 player counts as 6,000. The ${STUD_P} was fit to ${CAL.n} real trades in your leagues (${CAL.built}): it's the setting where the side giving more pieces neither wins nor loses on average.</p>
    <div class="lab">The gap</div>${whyRows([{k:"You get − you send", v:n0(gv - sv)}, {k:"As a share of the bigger side", v:`${diff >= 0 ? "+" : ""}${Math.round(diff*100)}%`, total:true, n:`Within ±5% reads as even. For context, the median trade in your leagues this season had a ${Math.round(CAL.q[10]*100)}% gap; this one is closer to even than ${Math.round(fairerThan(Math.abs(diff))*100)}% of them.`}])}
    <div class="lab">What the full check adds</div><p class="whyp">The verdict is half this value gap and half plan fit: how the trade moves your win-now lineup (redraft values) and future value (young players and picks), weighted by your team's lane (contenders 70/30 now/future, rebuilders 20/80, everyone else 50/50).</p>`;
}
function openWhy(spec){
  const i = spec.indexOf("|"), where = spec.slice(0, i), uid = spec.slice(i+1), b = trBp(); if(!b || !TR.fc) return;
  let title = "Show the math", sub = "", body = "";
  if(where === "pkg"){ title = "How this trade is scored"; body = whyPackage(); }
  else {
    const partner = b.teams.find(t=>t.rid === TR.partner);
    const pools = where === "give" ? TR.give : where === "get" ? TR.get : trAssets(TR.side === "give" ? b.me : partner);
    const a = pools.find(z=>(z.uid || z.id) === uid); if(!a) return;
    title = a.name; sub = a.pk ? "Draft pick" : `${a.pos}${a.age ? " · " + Math.floor(a.age) : ""}`;
    body = whyRows(a.pk ? whyPick(a, b) : whyPlayer(a, b));
  }
  const gaps = settingsGaps(b.lg, TR.fc.meta);
  body += gaps.length ? `<div class="lab">${esc(b.lg.name)}'s settings</div><p class="whyp">Scoring rules (TE premium, completions, TD points, first downs, catch points) show up in each player's league scoring edge and in lineup strength, but not in trade prices, because your leagues don't trade on them. Rules the model doesn't measure yet: ${gaps.filter(g=>/teams|starters|flex|IDP/.test(g)).map(esc).join(" · ") || "none"}.</p>` : "";
  let el = $("whysheet"); if(!el){ el = document.createElement("div"); el.id = "whysheet"; el.className = "runner"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); document.body.appendChild(el); }
  el.innerHTML = `<div class="rwrap"><div class="rtop"><span class="lab">Show the math</span><button class="iconbtn" data-whyx="1" aria-label="Close">✕</button></div><div class="rhead"><h2 class="h1">${esc(title)}</h2>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>${body}</div>`;
  el.hidden = false; el.setAttribute("aria-label", title); document.body.style.overflow = "hidden";
}
document.addEventListener("click", e=>{ if(e.target.closest("[data-whyx]")){ const el = $("whysheet"); if(el) el.hidden = true; document.body.style.overflow = ""; } });
document.addEventListener("keydown", e=>{ if(e.key === "Escape"){ const el = $("whysheet"); if(el && !el.hidden){ el.hidden = true; document.body.style.overflow = ""; } } });
document.addEventListener("change", e=>{ if(e.target.id === "adjOn"){ store.set("adjPrice", e.target.checked); S.adjC = {}; S.bp = null; TR.fc = null; for(const b of S.results||[]) if(b.league) delete b._bp; showToast(e.target.checked ? "Values now follow each league's scoring" : "Showing raw market values"); loadBlueprints && loadBlueprints().then(()=>render()); render(); } });

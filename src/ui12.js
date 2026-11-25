/* =====================================================================
   Sign in with Sleeper (beta, Nov 25, 2026)
   Make lineup, waiver and trade moves from the Command Center. Requests go through /api/sleeper, a
   pass-through to Sleeper's own GraphQL (the same calls sleeper.com makes). The Sleeper session stays
   on this device only (localStorage "ffu:slp*", never synced to an FFU account). Every move:
   preview → confirm → send → read back from Sleeper → marked done only when the read-back matches.
   ===================================================================== */
const SLP = {
  tok(){ try{ return localStorage.getItem("ffu:slpTok") || ""; }catch(e){ return ""; } },
  user(){ try{ return JSON.parse(localStorage.getItem("ffu:slpUser") || "null"); }catch(e){ return null; } },
  save(tok, user){ try{ localStorage.setItem("ffu:slpTok", tok); localStorage.setItem("ffu:slpUser", JSON.stringify(user)); }catch(e){} },
  clear(){ try{ localStorage.removeItem("ffu:slpTok"); localStorage.removeItem("ffu:slpUser"); }catch(e){} },
  sheet:null, busy:false, msg:null, msgKind:"err", plan:null, results:null
};
// moves only go out for the Sleeper account this screen is showing
function slpOn(){ const u = SLP.user(); return !!(SLP.tok() && u && S.userId && String(u.user_id) === String(S.userId)); }
async function slp(op, variables){
  const r = await fetch(FFU_API + "/api/sleeper", {method:"POST", headers:{"Content-Type":"application/json", "x-sleeper-token":SLP.tok()}, body:JSON.stringify({op, variables})});
  const j = await r.json().catch(()=>({}));
  if(r.status === 401 && op !== "login"){ SLP.clear(); render(); }
  if(!r.ok) throw Object.assign(new Error(j.error || `Sleeper request failed (${r.status})`), {code:j.code, status:r.status});
  return j.data;
}
const norm = a => (a || []).map(x => x == null || x === "" ? "0" : String(x));
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

/* ---------- plans: what would be sent, in words and as the exact request ---------- */
function lineupPlan(r){
  if(!r || !r.moves || !r.opt || !r.roster) return null;
  const mv = movesFor(r); if(!mv.length) return null;
  return {kind:"lineup", lid:r.league.league_id, name:r.league.name, rid:r.roster.roster_id, round:S.week, current:r.current.slice(), starters:norm(r.opt),
    lines:mv.map(m => m.a ? `${m.slot}: start ${m.a.full}${m.b ? ` for ${m.b.full}` : ""}` : `Bench ${m.b ? m.b.full : ""}`)};
}
function waiverPlan(lid, add, drop, bid){
  const x = (S.raw || []).find(z => z.lg && z.lg.league_id === lid); if(!x || !x.mine) return null;
  const faab = (x.lg.settings || {}).waiver_type === 2;
  return {kind:"waiver", lid, name:x.lg.name, rid:x.mine.roster_id, add, drop:drop || null, bid:faab && bid != null ? Math.max(0, Math.round(+bid)) : null,
    lines:[`Claim ${pname(add)}`].concat(drop ? [`Drop ${pname(drop)}`] : []).concat(faab && bid != null ? [`Bid $${Math.round(+bid)}`] : faab ? ["Bid $0"] : ["Uses your waiver priority"])};
}
function tradePlan(){
  const b = (S.bp || []).find(z => z.lg.league_id === TR.lid); if(!b || TR.partner == null) return null;
  const them = b.teams.find(t => t.rid === TR.partner); if(!them) return null;
  if(TR.give.concat(TR.get).some(a => a.pk)) return {kind:"trade", blocked:"Trades with draft picks can't be sent from here yet. Open the league in Sleeper to send this one.", lid:TR.lid, name:b.lg.name, lines:[]};
  return {kind:"trade", lid:TR.lid, name:b.lg.name, rid:b.me.rid, them:TR.partner, themName:them.name, give:TR.give.map(a => String(a.id)), get:TR.get.map(a => String(a.id)),
    lines:[`You send: ${TR.give.map(a => a.name).join(", ")}`, `You get: ${TR.get.map(a => a.name).join(", ")}`, `To: ${them.name}`]};
}
function planVars(p){
  if(p.kind === "waiver"){ const v = {league_id:p.lid, k_adds:[p.add], v_adds:[p.rid]};
    if(p.drop){ v.k_drops = [p.drop]; v.v_drops = [p.rid]; }
    if(p.bid != null){ v.k_settings = ["waiver_bid"]; v.v_settings = [p.bid]; }
    return v; }
  if(p.kind === "trade"){ const adds = {}, drops = {};
    for(const id of p.get){ adds[id] = p.rid; drops[id] = p.them; }      // add: where it goes · drop: where it leaves from
    for(const id of p.give){ adds[id] = p.them; drops[id] = p.rid; }
    return {league_id:p.lid, k_adds:Object.keys(adds), v_adds:Object.values(adds), k_drops:Object.keys(drops), v_drops:Object.values(drops), draft_picks:null, waiver_budget:null}; }
  return null;
}

/* ---------- running a plan ---------- */
async function runLineup(p){
  const legs = await slp("matchup_legs", {league_id:p.lid, round:p.round});
  const mine = (legs || []).find(l => l.roster_id === p.rid);
  if(!mine) throw new Error("No matchup this week in this league.");
  if(same(mine.starters, p.starters)) return "Already set in Sleeper.";
  if(!same(mine.starters, p.current)) throw new Error("Your lineup changed in Sleeper since this screen loaded. Refresh, then try again.");
  await slp("update_matchup_leg", {league_id:p.lid, roster_id:p.rid, round:p.round, leg:mine.leg || p.round, starters:p.starters});
  const back = ((await slp("matchup_legs", {league_id:p.lid, round:p.round})) || []).find(l => l.roster_id === p.rid);
  if(!back || !same(back.starters, p.starters)) throw new Error("Sleeper accepted the change but shows a different lineup. Open the league in Sleeper to check.");
  store.set(doneKey(p.lid), true);
  return "Set and confirmed in Sleeper.";
}
async function runPlan(p){
  if(p.kind === "lineup") return runLineup(p);
  if(p.kind === "waiver"){ const t = await slp("submit_waiver_claim", planVars(p)); if(!t || !t.transaction_id) throw new Error("Sleeper didn't return the claim."); return `Claim submitted (${(t.status || "pending").replace(/_/g, " ")}).`; }
  if(p.kind === "trade"){ const t = await slp("propose_trade", planVars(p)); if(!t || !t.transaction_id) throw new Error("Sleeper didn't return the offer."); return "Offer sent in Sleeper."; }
  throw new Error("Unknown move.");
}
async function confirmPlans(){
  const plans = SLP.plan || []; SLP.busy = true; SLP.results = plans.map(() => ({state:"wait"})); renderSlp();
  for(let i = 0; i < plans.length; i++){
    SLP.results[i] = {state:"run"}; renderSlp();
    try{ SLP.results[i] = {state:"ok", msg:await runPlan(plans[i])}; if(navigator.vibrate && !reduceMotion()) try{ navigator.vibrate(12); }catch(_){} }
    catch(e){ SLP.results[i] = {state:"err", msg:e.message}; if(e.status === 401) break; }
    renderSlp();
  }
  SLP.busy = false; renderSlp();
  const ok = SLP.results.filter(r => r.state === "ok").length;
  if(ok){ showToast(ok === plans.length ? (plans.length > 1 ? `All ${ok} done in Sleeper` : "Done in Sleeper") : `${ok} of ${plans.length} done in Sleeper`); SKY.pulse(false);
    if(plans.some(p => p.kind === "lineup")) setTimeout(() => { try{ loadAll(S.week, {quiet:true}); }catch(_){} }, 1500); }
  render();
}

/* ---------- the sheet: connect, preview, results ---------- */
function openSlp(mode, plans){ SLP.sheet = mode; SLP.msg = null; SLP.plan = plans || null; SLP.results = null; renderSlp(); setTimeout(() => { const f = $("slpWho"); if(f) f.focus(); }, 380); }
function closeSlp(){ if(SLP.busy) return; SLP.sheet = null; renderSlp(); }
function renderSlp(){
  const el = $("sheet"); if(!el) return;
  if(!SLP.sheet){ if(!el.hidden && el.dataset.who === "slp"){ el.classList.add("closing"); setTimeout(() => { el.hidden = true; el.classList.remove("closing"); el.innerHTML = ""; el.dataset.who = ""; }, 260); } return; }
  const keepWho = $("slpWho") ? $("slpWho").value : (SLP.user() || {}).username || S.username || "";
  const msg = SLP.msg ? `<div class="acmsg ${SLP.msgKind}" role="${SLP.msgKind === "err" ? "alert" : "status"}">${esc(SLP.msg)}</div>` : "";
  let h = `<div class="sheet-bg" data-slpx="1"></div><section class="sheet-card slpcard" role="dialog" aria-modal="true" aria-labelledby="slpTitle"><button class="sheet-x" data-slpx="1" aria-label="Close">✕</button>`;
  if(SLP.sheet === "connect"){
    h += `<div class="slphead"><span class="slpbeta">Beta</span><h2 id="slpTitle" class="h2" style="font-size:24px">Make moves from here</h2>
        <p class="sub">Connect your Sleeper account to set lineups, claim players and send trades without leaving the Command Center. Every move shows you a preview first.</p></div>
      ${msg}
      <form id="slpForm" class="slpform" autocomplete="on">
        <label class="lab" for="slpWho">Sleeper username, email or phone</label><input class="acin" id="slpWho" name="username" autocomplete="username" value="${esc(keepWho)}" required>
        <label class="lab" for="slpPw">Sleeper password</label><input class="acin" id="slpPw" name="password" type="password" autocomplete="current-password" required>
        <button class="cbtn wide" type="submit" ${SLP.busy ? "disabled" : ""}>${SLP.busy ? "Connecting…" : "Connect Sleeper"}</button>
      </form>
      <ul class="acperks slpfine">
        <li>Your password goes straight to Sleeper. We never store it.</li>
        <li>Sleeper's sign-in stays on this device only. Disconnect any time in Settings.</li>
        <li>Sleeper doesn't officially support outside apps making moves, so this can stop working without notice. If it does, the Open in Sleeper buttons still work.</li>
      </ul>`;
  } else if(SLP.sheet === "plan"){
    const plans = SLP.plan || [], R = SLP.results, done = R && !SLP.busy;
    const kinds = new Set(plans.map(p => p.kind)), trade = kinds.has("trade");
    const title = trade ? "Send this trade offer?" : kinds.has("waiver") ? "Submit this claim?" : plans.length > 1 ? `Set ${plans.length} lineups?` : "Set this lineup?";
    h += `<div class="slphead"><span class="slpbeta">Beta</span><h2 id="slpTitle" class="h2" style="font-size:24px">${done ? "Done" : title}</h2>
      <p class="sub">${done ? "Here's what Sleeper confirmed." : `As <b style="color:var(--ink)">@${esc((SLP.user() || {}).username || "")}</b> in Sleeper. ${trade ? "They'll see it right away." : "Nothing changes until you confirm."}`}</p></div>${msg}
      <div class="slplist">${plans.map((p, i) => { const r = R && R[i];
        const st = !r ? "" : r.state === "ok" ? `<span class="slpst ok">✓</span>` : r.state === "err" ? `<span class="slpst err">!</span>` : r.state === "run" ? `<span class="slpst run" aria-label="Working"></span>` : `<span class="slpst wait"></span>`;
        return `<div class="slpitem">${st}<div class="t"><b>${esc(p.name)}</b>${p.lines.map(l => `<small>${esc(l)}</small>`).join("")}${r && r.msg ? `<small class="${r.state === "err" ? "e" : "o"}">${esc(r.msg)}</small>` : ""}${r && r.state === "err" ? `<a class="linkb" href="${leagueLink(p.lid)}" target="_blank" rel="noopener">Open in Sleeper ${ICON.ext}</a>` : ""}</div></div>`; }).join("")}</div>
      ${done ? `<button class="cbtn wide" data-slpx="1">Close</button>` : `<button class="cbtn wide" data-slpgo="1" ${SLP.busy ? "disabled" : ""}>${SLP.busy ? "Working…" : trade ? "Send offer in Sleeper" : "Confirm in Sleeper"}</button>
      <button class="ghost wide" data-slpx="1" ${SLP.busy ? "disabled" : ""}>Cancel</button>`}`;
  }
  h += `</section>`;
  el.dataset.who = "slp"; el.innerHTML = h; el.hidden = false;
}
async function slpConnect(who, pw){
  SLP.busy = true; SLP.msg = null; renderSlp();
  try{
    const u = await slp("login", {who:who.trim(), password:pw});
    if(!u || !u.token){ SLP.msg = u && u.verification ? "Sleeper wants extra verification for this sign-in (a code or a captcha). Sign in once in the Sleeper app or at sleeper.com, then try again here." : "Sleeper didn't accept that sign-in. Check the username and password."; SLP.msgKind = "err"; return; }
    if(S.userId && String(u.user_id) !== String(S.userId)){ SLP.msg = `That's @${u.username || u.display_name}, but this screen shows @${S.username}. Sign in with the account whose leagues you're looking at.`; SLP.msgKind = "err"; return; }
    SLP.save(u.token, {user_id:String(u.user_id), username:u.username, display_name:u.display_name});
    SLP.sheet = null; showToast(`Connected to Sleeper as @${u.username || u.display_name}`); render();
  }catch(e){ SLP.msg = e.message; SLP.msgKind = "err"; }
  finally{ SLP.busy = false; renderSlp(); }
}
document.addEventListener("submit", e => { if(e.target.id !== "slpForm") return; e.preventDefault(); slpConnect($("slpWho").value, $("slpPw").value); });

/* ---------- entry points ---------- */
document.addEventListener("click", e => {
  const el = e.target.closest("[data-slpx],[data-slpgo],[data-slpconnect],[data-slpout],[data-slplineup],[data-slpall],[data-slpclaim],[data-slptrade],[data-slphide]"); if(!el) return;
  const d = el.dataset;
  if(d.slpx){ closeSlp(); return; }
  if(d.slpgo){ confirmPlans(); return; }
  if(d.slpconnect){ openSlp("connect"); return; }
  if(d.slpout){ SLP.clear(); showToast("Disconnected from Sleeper"); render(); return; }
  if(d.slphide){ store.set("slpNudge", false); render(); return; }
  if(!slpOn()){ openSlp("connect"); return; }
  if(d.slplineup){ const p = lineupPlan(S.results.find(r => r.league && r.league.league_id === d.slplineup)); if(p) openSlp("plan", [p]); else showToast("Nothing to change in this lineup"); return; }
  if(d.slpall){ const plans = slpLineupQueue().map(lineupPlan).filter(Boolean); if(plans.length) openSlp("plan", plans); return; }
  if(d.slpclaim){ const [lid, add, drop, bid] = d.slpclaim.split("|"); const p = waiverPlan(lid, add, drop || null, bid === "" ? null : bid); if(p) openSlp("plan", [p]); return; }
  if(d.slptrade){ const p = tradePlan(); if(!p) return; if(p.blocked){ showToast(p.blocked); return; } openSlp("plan", [p]); return; }
});
// leagues whose lineup still has a real change to make, most urgent first
function slpLineupQueue(){ return S.results.filter(r => r.league && r.moves && movesFor(r).length && !isDone(r.league.league_id) && (r.sev === "crit" || r.sev === "up")).sort((a, b) => (a.sev === "crit" ? 0 : 1) - (b.sev === "crit" ? 0 : 1)); }
function slpBar(){
  if(slpOn()){ const q = slpLineupQueue(); return q.length ? `<section class="slpbar glass"><div class="t"><b>Set ${q.length === 1 ? "this lineup" : `all ${q.length} lineups`} from here</b><small>Preview every change, then confirm once. Sleeper confirms each one.</small></div><button class="primary sm" data-slpall="1">Review ${q.length} →</button></section>` : ""; }
  if(store.get("slpNudge", true) === false) return "";
  return `<section class="slpbar glass"><div class="t"><b>Skip the trip to Sleeper</b><small>Connect your Sleeper account (beta) to set lineups, claim players and send trades right here.</small></div><button class="ghost tint sm" data-slpconnect="1">Connect</button><button class="iconbtn sm" data-slphide="1" aria-label="Hide this">✕</button></section>`;
}
function slpSettingsRow(){
  const u = SLP.user();
  return `<div class="srow"><span>Sleeper moves <small class="slpbeta">Beta</small><small style="display:block;color:var(--ink-3)">${slpOn() ? `Connected as @${esc(u.username || u.display_name || "")} on this device` : "Set lineups, claim players and send trades from here"}</small></span>${slpOn() ? `<button class="ghost sm" data-slpout="1">Disconnect</button>` : `<button class="ghost tint sm" data-slpconnect="1">Connect</button>`}</div>`;
}
{ const _rs = renderSettings; renderSettings = function(){ return _rs().replace('<div class="srow"><label for="homeSel">', slpSettingsRow() + '<div class="srow"><label for="homeSel">'); }; }
function slpClaimBtn(lid, add, drop, bid, faab){
  if(!slpOn() || !add) return "";
  return ` <button class="ghost tint sm slpclaim" data-slpclaim="${esc(lid)}|${esc(add)}|${esc(drop || "")}|${faab && bid != null ? Math.round(bid) : ""}">Claim${faab && bid != null ? ` $${Math.round(bid)}` : ""}</button>`;
}

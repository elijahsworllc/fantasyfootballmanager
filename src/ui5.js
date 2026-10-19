
/* =====================================================================
   Accounts: "take control of your command center"
   Supabase auth (email or phone + password) and one private row of saved settings per user,
   spoken to directly over its REST endpoints. Hidden until the project key is set.
   ===================================================================== */
const SB_URL = "https://uxqevvuqibqvypwpccjz.supabase.co";
const SB_KEY = window.CC_SB_KEY ?? "sb_publishable_wclXgOusrUUgopfTF_K-NQ_enryoOh8";   // publishable (client-safe) key
const ACC = {session:null, sheet:null, msg:null, msgKind:"", busy:false, remember: store.get("auth:remember", true), show:false, pendingPhone:null, delArm:false, syncedAt:null};
const accountsOn = () => !!SB_KEY;
const SYNC_KEY = /^(username|threshold|hideDone|sort|dir:|done:|rk:)/;

/* ---------- session storage: "stay signed in" keeps it in localStorage, otherwise only for this visit ---------- */
function authLoad(){ for(const s of [localStorage, sessionStorage]){ try{ const v = s.getItem("cc:auth"); if(v) return JSON.parse(v); }catch(_){} } return null; }
function authSave(sess){
  try{ localStorage.removeItem("cc:auth"); sessionStorage.removeItem("cc:auth"); }catch(_){}
  if(!sess) return;
  try{ (ACC.remember ? localStorage : sessionStorage).setItem("cc:auth", JSON.stringify(sess)); }catch(_){}
}
function setSession(j){
  if(!j || !j.access_token){ ACC.session = null; authSave(null); return; }
  ACC.session = {access_token:j.access_token, refresh_token:j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now()/1000) + (j.expires_in || 3600), user: j.user || (ACC.session && ACC.session.user)};
  authSave(ACC.session);
}
const accName = () => { const u = ACC.session && ACC.session.user; return u ? (u.email || (u.phone ? "+" + String(u.phone).replace(/^\+/,"") : "your account")) : ""; };

/* ---------- REST ---------- */
async function sb(path, {method="GET", body, auth=true, headers={}} = {}){
  if(auth && ACC.session && ACC.session.expires_at - 60 < Date.now()/1000) await sbRefresh();
  const h = {apikey: SB_KEY, "Content-Type":"application/json", ...headers};
  if(auth && ACC.session) h.Authorization = "Bearer " + ACC.session.access_token;   // publishable keys are not JWTs: only send a user token
  const r = await fetch(SB_URL + path, {method, headers:h, body: body == null ? undefined : JSON.stringify(body)});
  const text = await r.text(); let j = null; try{ j = text ? JSON.parse(text) : null; }catch(_){}
  if(!r.ok){ const m = j && (j.error_description || j.msg || j.message || j.error) || ("Error " + r.status); const e = new Error(m); e.status = r.status; e.code = j && (j.error_code || j.code); throw e; }
  return j;
}
async function sbRefresh(){
  if(!ACC.session || !ACC.session.refresh_token) return;
  try{ const j = await fetch(SB_URL + "/auth/v1/token?grant_type=refresh_token", {method:"POST", headers:{apikey:SB_KEY, "Content-Type":"application/json"}, body: JSON.stringify({refresh_token: ACC.session.refresh_token})}).then(r=>r.ok ? r.json() : Promise.reject(r.status));
    setSession(j); }
  catch(e){ if(e === 400 || e === 401){ setSession(null); } }
}
function friendly(e){
  const m = String(e && e.message || e || "");
  if(/invalid login credentials/i.test(m)) return "That login and password don't match.";
  if(/already registered|already exists/i.test(m)) return "There's already an account with that. Sign in instead.";
  if(/phone.*(provider|disabled|not.*enabled)|sms|unsupported phone/i.test(m)) return "Phone sign-in isn't switched on yet. Use your email for now.";
  if(/email not confirmed/i.test(m)) return "Confirm your email first: open the link we sent you.";
  if(/rate limit|too many/i.test(m)) return "Too many tries. Wait a minute and try again.";
  if(/password.*(short|least|weak)/i.test(m)) return "That password is too short. Use at least 8 characters.";
  if(/failed to fetch|network/i.test(m)) return "Couldn't reach the account service. Check your connection.";
  if(/token.*(expired|invalid)|otp/i.test(m)) return "That code didn't work. Check it, or send a new one.";
  return m;
}
function loginId(raw){
  const v = (raw||"").trim();
  if(v.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? {email: v.toLowerCase()} : null;
  const d = v.replace(/[^\d+]/g, ""), digits = d.replace(/\D/g, "");
  if(digits.length < 10) return null;
  return {phone: d.startsWith("+") ? "+" + digits : digits.length === 10 ? "+1" + digits : "+" + digits};
}
function pwScore(p){ let s = 0; if(p.length >= 8) s++; if(p.length >= 12) s++; if(/[a-z]/.test(p) && /[A-Z]/.test(p)) s++; if(/\d/.test(p)) s++; if(/[^A-Za-z0-9]/.test(p)) s++; return s; }

/* ---------- sync: your saved settings follow you ---------- */
function localSyncData(){ const out = {}; try{ for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if(!k || !k.startsWith("cc:")) continue; const kk = k.slice(3); if(SYNC_KEY.test(kk)) out[kk] = JSON.parse(localStorage.getItem(k)); } }catch(_){} return out; }
let pushTimer = null;
function schedulePush(){ clearTimeout(pushTimer); pushTimer = setTimeout(pushState, 1500); }
async function pushState(){
  if(!ACC.session) return;
  try{ await sb("/rest/v1/user_state", {method:"POST", headers:{Prefer:"resolution=merge-duplicates,return=minimal"}, body:{user_id: ACC.session.user.id, data: localSyncData(), updated_at: new Date().toISOString()}});
    ACC.syncedAt = new Date(); if(ACC.sheet === "account") renderSheet(); }
  catch(e){ if(e.status === 401) setSession(null); }
}
async function pullState(){
  if(!ACC.session) return;
  const rows = await sb("/rest/v1/user_state?select=data,updated_at&user_id=eq." + ACC.session.user.id);
  const row = rows && rows[0], before = S.username;
  if(row && row.data) for(const [k,v] of Object.entries(row.data)) if(SYNC_KEY.test(k)) try{ localStorage.setItem("cc:" + k, JSON.stringify(v)); }catch(_){}
  S.username = store.get("username", S.username); S.threshold = store.get("threshold", S.threshold); S.hideDone = store.get("hideDone", S.hideDone); S.sort = store.get("sort", S.sort);
  RK.mode = store.get("rk:mode", RK.mode); RK.qb = store.get("rk:qb", RK.qb);
  await pushState();
  if(S.username && (S.username !== before || !S.results.length) && !S.loading){ S.userId = null; S.lastKey = null; loadAll(null); }
  else render();
}
const _set = store.set.bind(store);
store.set = (k, v) => { _set(k, v); if(ACC.session && SYNC_KEY.test(k)) schedulePush(); };

/* ---------- actions ---------- */
async function accSubmit(kind){
  if(ACC.busy) return;
  const idEl = $("acId"), pwEl = $("acPw"), rm = $("acRemember");
  if(rm){ ACC.remember = rm.checked; _set("auth:remember", ACC.remember); }
  ACC.msg = null; ACC.busy = true; renderSheet();
  try{
    if(kind === "create" || kind === "signin"){
      const who = loginId(idEl.value), pw = pwEl.value;
      if(!who) throw new Error("Enter an email address or a phone number with area code.");
      if(kind === "create" && pw.length < 8) throw new Error("Use at least 8 characters for your password.");
      if(kind === "create"){
        const j = await sb("/auth/v1/signup?redirect_to=" + encodeURIComponent(location.origin + location.pathname), {method:"POST", auth:false, body:{...who, password:pw}});
        if(j && j.access_token){ setSession(j); await accSignedIn("Account created. Your command center now follows you."); return; }
        if(who.phone){ ACC.pendingPhone = who.phone; ACC.sheet = "verify"; ACC.msg = `We texted a 6-digit code to ${who.phone}.`; ACC.msgKind = "info"; }
        else { ACC.sheet = "signin"; ACC.msg = `Almost there: open the link we sent to ${who.email} to confirm, then sign in.`; ACC.msgKind = "info"; }
      } else {
        const j = await sb("/auth/v1/token?grant_type=password", {method:"POST", auth:false, body:{...who, password:pw}});
        setSession(j); await accSignedIn("Signed in. Your command center is synced."); return;
      }
    } else if(kind === "verify"){
      const j = await sb("/auth/v1/verify", {method:"POST", auth:false, body:{type:"sms", phone: ACC.pendingPhone, token: $("acCode").value.trim()}});
      setSession(j); await accSignedIn("Phone verified. Your command center now follows you."); return;
    } else if(kind === "reset"){
      const who = loginId(idEl.value); if(!who || !who.email) throw new Error("Enter the email on your account.");
      await sb("/auth/v1/recover?redirect_to=" + encodeURIComponent(location.origin + location.pathname), {method:"POST", auth:false, body:{email: who.email}});
      ACC.msg = `If there's an account for ${who.email}, a reset link is on its way.`; ACC.msgKind = "info";
    } else if(kind === "newpw"){
      const pw = pwEl.value; if(pw.length < 8) throw new Error("Use at least 8 characters.");
      await sb("/auth/v1/user", {method:"PUT", body:{password: pw}});
      ACC.sheet = null; toast("Password updated.");
    }
  }catch(e){ ACC.msg = friendly(e); ACC.msgKind = "err"; }
  ACC.busy = false; renderSheet();
}
async function accSignedIn(msg){
  ACC.busy = false; ACC.sheet = null; ACC.msg = null; renderSheet();
  try{ const u = await sb("/auth/v1/user"); if(u) ACC.session.user = u, authSave(ACC.session); }catch(_){}
  toast(msg);
  try{ await pullState(); }catch(_){ render(); }
}
async function accSignOut(){
  try{ await sb("/auth/v1/logout", {method:"POST"}); }catch(_){}
  setSession(null); ACC.sheet = null; renderSheet(); render(); toast("Signed out. Everything stays on this device.");
}
async function accDelete(){
  if(!ACC.delArm){ ACC.delArm = true; renderSheet(); setTimeout(()=>{ ACC.delArm = false; renderSheet(); }, 5000); return; }
  ACC.busy = true; renderSheet();
  try{ await sb("/rest/v1/rpc/delete_me", {method:"POST", body:{}}); setSession(null); ACC.sheet = null; toast("Account deleted. Your data on this device is untouched."); }
  catch(e){ ACC.msg = friendly(e); ACC.msgKind = "err"; }
  ACC.busy = false; ACC.delArm = false; renderSheet(); render();
}

/* ---------- the sheet ---------- */
const EYE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
function openAccount(mode){ if(!accountsOn()) return; ACC.sheet = mode || (ACC.session ? "account" : "create"); ACC.msg = null; renderSheet(); setTimeout(()=>{ const f = $("acId") || $("acCode") || $("acPw"); if(f) f.focus(); }, 380); }
function closeAccount(){ ACC.sheet = null; renderSheet(); }
function renderSheet(){
  const el = $("sheet"); if(!el) return;
  if(!ACC.sheet){ if(!el.hidden){ el.classList.add("closing"); setTimeout(()=>{ el.hidden = true; el.classList.remove("closing"); el.innerHTML = ""; }, 260); } return; }
  const ae = document.activeElement, fid = ae && el.contains(ae) ? ae.id : null, caret = fid && ae.selectionStart != null ? ae.selectionStart : null;
  const keep = {id: $("acId") ? $("acId").value : "", pw: $("acPw") ? $("acPw").value : "", code: $("acCode") ? $("acCode").value : ""};
  const m = ACC.sheet, busy = ACC.busy;
  const msg = ACC.msg ? `<div class="acmsg ${ACC.msgKind}" role="${ACC.msgKind === "err" ? "alert" : "status"}">${esc(ACC.msg)}</div>` : "";
  let h = `<div class="sheet-bg" data-acclose="1"></div><section class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="acTitle"><button class="sheet-x" data-acclose="1" aria-label="Close">✕</button>`;
  if(m === "account"){
    h += `<div class="achead">${LOGO}<div><h2 id="acTitle" class="h2" style="font-size:22px">Your command center</h2><div class="sub">Signed in as <b style="color:var(--ink)">${esc(accName())}</b></div></div></div>
      <ul class="acperks"><li>Rankings, team directions, done checks and settings sync to this account.</li><li>${ACC.syncedAt ? `Last synced ${ACC.syncedAt.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})}.` : "Syncs a moment after every change."}</li></ul>
      ${msg}<button class="cbtn wide" data-acsync="1" ${busy?"disabled":""}>Sync now</button>
      <div class="acrow"><button class="ghost" data-acout="1">Sign out</button><button class="ghost danger" data-acdel="1" ${busy?"disabled":""}>${ACC.delArm ? "Tap again to delete for good" : "Delete account"}</button></div>`;
  } else if(m === "verify"){
    h += `<h2 id="acTitle" class="h1" style="font-size:30px">Enter your code</h2>${msg}
      <label class="lab" for="acCode">6-digit code</label><input class="acin" id="acCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="${esc(keep.code)}">
      <button class="cbtn wide" data-acgo="verify" ${busy?"disabled":""}>${busy ? "Checking…" : "Verify"}</button>`;
  } else if(m === "reset"){
    h += `<h2 id="acTitle" class="h1" style="font-size:30px">Reset password</h2><p class="sub" style="margin:0">We'll email you a link to set a new one.</p>${msg}
      <label class="lab" for="acId">Email</label><input class="acin" id="acId" type="email" autocomplete="username" inputmode="email" value="${esc(keep.id)}">
      <button class="cbtn wide" data-acgo="reset" ${busy?"disabled":""}>${busy ? "Sending…" : "Send reset link"}</button>
      <button class="aclink" data-acmode="signin">Back to sign in</button>`;
  } else if(m === "newpw"){
    h += `<h2 id="acTitle" class="h1" style="font-size:30px">New password</h2>${msg}
      <label class="lab" for="acPw">Password</label><div class="pwbox"><input class="acin" id="acPw" type="password" autocomplete="new-password" value="${esc(keep.pw)}"><button class="eye" data-aceye="1" aria-label="Show password">${EYE}</button></div>
      <div class="pwm" id="pwm"></div>
      <button class="cbtn wide" data-acgo="newpw" ${busy?"disabled":""}>${busy ? "Saving…" : "Save password"}</button>`;
  } else {
    const create = m === "create";
    h += `<div class="achead">${LOGO}<div><h2 id="acTitle" class="h2" style="font-size:20px">${create ? "Take control of your command center" : "Welcome back"}</h2><div class="sub">${create ? "Free. Your rankings, team directions and settings on every device." : "Sign in to pick up where you left off."}</div></div></div>
      <div class="seg" role="tablist" style="--n:2;--i:${create?0:1}"><button role="tab" data-acmode="create" aria-selected="${create}">Create account</button><button role="tab" data-acmode="signin" aria-selected="${!create}">Sign in</button><i aria-hidden="true"></i></div>
      ${msg}
      <label class="lab" for="acId">Email or phone</label><input class="acin" id="acId" type="text" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="you@email.com or (555) 123-4567" value="${esc(keep.id)}">
      <label class="lab" for="acPw">Password</label><div class="pwbox"><input class="acin" id="acPw" type="password" autocomplete="${create ? "new-password" : "current-password"}" placeholder="${create ? "At least 8 characters" : ""}" value="${esc(keep.pw)}"><button class="eye" data-aceye="1" aria-label="Show password">${EYE}</button></div>
      ${create ? `<div class="pwm" id="pwm"></div>` : ""}
      <label class="remember"><input type="checkbox" id="acRemember" ${ACC.remember ? "checked" : ""}><span class="box" aria-hidden="true"></span><span>Stay signed in on this device</span></label>
      <button class="cbtn wide" data-acgo="${m}" ${busy?"disabled":""}>${busy ? (create ? "Creating…" : "Signing in…") : (create ? "Create account" : "Sign in")}<span class="arr"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13"/><path d="M13 6l6 6-6 6"/></svg></span></button>
      ${create ? `<p class="note" style="margin:0;text-align:center">We use your email or phone only to sign you in.</p>` : `<button class="aclink" data-acmode="reset">Forgot password?</button>`}`;
  }
  h += `</section>`;
  const opening = el.hidden; el.hidden = false; el.innerHTML = h; if(opening){ el.classList.remove("closing"); }
  pwMeter();
  if(fid && $(fid)){ const f = $(fid); f.focus({preventScroll:true}); try{ if(caret != null) f.setSelectionRange(caret, caret); }catch(_){} }
}
function pwMeter(){
  const m = $("pwm"), p = $("acPw"); if(!m || !p) return;
  const s = pwScore(p.value), lv = !p.value ? 0 : s < 3 ? 1 : s < 4 ? 2 : 3;
  m.innerHTML = `<span class="bars">${[1,2,3].map(i=>`<i class="${i<=lv?"on l"+lv:""}"></i>`).join("")}</span><span>${!p.value ? "Use 8+ characters. Mixing in numbers and symbols makes it stronger." : ["","Weak","Okay","Strong"][lv]}</span>`;
}
let toastT = null;
function toast(text){ const t = $("toast"); if(!t) return; t.textContent = text; t.hidden = false; t.classList.remove("out"); clearTimeout(toastT); toastT = setTimeout(()=>{ t.classList.add("out"); setTimeout(()=>{ t.hidden = true; }, 300); }, 3200); }

/* ---------- entry points in the app ---------- */
function accountCardHTML(){
  if(!accountsOn() || ACC.session || store.get("acct:dismissed", false)) return "";
  return `<section class="acline glass"><span class="t"><b>Use it on every device.</b> A free account saves your rankings, team lanes and settings.</span><button class="ghost tint" data-acopen="create">Create</button><button class="tc-x" data-acdismiss="1" aria-label="Not now">✕</button></section>`;
}
function accountChipHTML(){
  if(!accountsOn()) return "";
  return ACC.session ? `<button class="acchip on" data-acopen="account" aria-label="Your account">${esc((accName()[0]||"•").toUpperCase())}</button>` : "";
}
document.addEventListener("click", e=>{
  const el = e.target.closest("[data-acopen],[data-acclose],[data-acmode],[data-acgo],[data-aceye],[data-acout],[data-acdel],[data-acsync],[data-acdismiss]"); if(!el) return;
  const d = el.dataset;
  if(d.acopen){ openAccount(d.acopen); return; }
  if(d.acclose){ closeAccount(); return; }
  if(d.acmode){ ACC.sheet = d.acmode; ACC.msg = null; renderSheet(); return; }
  if(d.acgo){ accSubmit(d.acgo); return; }
  if(d.aceye){ const p = $("acPw"); if(p){ p.type = p.type === "password" ? "text" : "password"; el.setAttribute("aria-label", p.type === "password" ? "Show password" : "Hide password"); el.classList.toggle("on", p.type === "text"); p.focus(); } return; }
  if(d.acout){ accSignOut(); return; }
  if(d.acdel){ accDelete(); return; }
  if(d.acsync){ ACC.busy = true; renderSheet(); pullState().catch(()=>{}).finally(()=>{ ACC.busy = false; renderSheet(); }); return; }
  if(d.acdismiss){ store.set("acct:dismissed", true); render(); return; }
});
document.addEventListener("input", e=>{ if(e.target.id === "acPw") pwMeter(); });
document.addEventListener("keydown", e=>{
  if(!ACC.sheet) return;
  if(e.key === "Escape") closeAccount();
  if(e.key === "Enter" && ["acId","acPw","acCode"].includes(e.target.id)){ e.preventDefault(); const g = document.querySelector("[data-acgo]"); if(g) accSubmit(g.dataset.acgo); }
});

/* ---------- startup: restore a saved session, or finish an email link (confirm / reset) ---------- */
async function accInit(){
  if(!accountsOn()) return;
  const hash = new URLSearchParams(location.hash.slice(1));
  if(hash.get("access_token")){
    const type = hash.get("type");
    setSession({access_token: hash.get("access_token"), refresh_token: hash.get("refresh_token"), expires_in: +hash.get("expires_in") || 3600});
    history.replaceState(null, "", location.pathname + location.search);
    try{ ACC.session.user = await sb("/auth/v1/user"); authSave(ACC.session); }catch(_){}
    if(type === "recovery"){ ACC.sheet = "newpw"; ACC.msg = "Choose a new password for " + accName() + "."; ACC.msgKind = "info"; renderSheet(); }
    else toast("Email confirmed. Your command center now follows you.");
    try{ await pullState(); }catch(_){}
    return;
  }
  if(hash.get("error_description")){ history.replaceState(null, "", location.pathname + location.search); toast(hash.get("error_description").replace(/\+/g," ")); }
  const saved = authLoad();
  if(saved && saved.access_token){ ACC.session = saved; await sbRefresh(); if(ACC.session){ try{ await pullState(); }catch(_){} } render(); }
}

/* settings: Sleeper handle + account */
function renderSettings(){
  const acct = !accountsOn() ? "" : ACC.session
    ? `<div class="srow"><span>Account: <b>${esc(accName())}</b></span><button class="ghost" data-acopen="account">Manage</button></div>`
    : `<div class="srow"><span>Save your setup to an account</span><button class="ghost tint" data-acopen="create">Create account</button></div>`;
  return `<details class="settings"><summary>Settings</summary>
    <div class="srow"><label for="thr">Flag upgrades worth at least</label><select id="thr">${[0.5,1,1.5,2,3,5].map(v=>`<option value="${v}" ${+S.threshold===v?"selected":""}>${v} pts</option>`).join("")}</select></div>
    <div class="srow"><label for="hd">Hide leagues marked done</label><input type="checkbox" id="hd" ${S.hideDone?"checked":""}></div>
    <div class="srow"><label for="lkm">Open Sleeper links as</label><select id="lkm"><option value="web" ${LINK.mode()==="web"?"selected":""}>Website (team page)</option><option value="app" ${LINK.mode()==="app"?"selected":""}>App (league chat)</option></select></div>
    <div class="srow"><span>Not sure which works?</span><button class="ghost" data-linkretest="1">Test links again</button></div>
    <div class="srow"><span>Sleeper: <b>${esc(S.displayName||S.username)}</b></span><button class="ghost" id="switch">Switch user</button></div>
    ${acct}
    <p class="note">Projections come from Sleeper (Rotowire) and are rescored with each league's settings. Questionable players count at 85% and Doubtful at 20% when comparing options. Sleeper doesn't share whether you've set an auto-sub, so Questionable starters stay flagged until you swap them.</p></details>`;
}

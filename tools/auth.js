const { chromium } = require("/opt/npm-tools/node_modules/playwright");
const { route } = require("./mock.js");
const OUT = process.argv[2] || "/tmp/shots";
const users = {}, rows = {}; const log = [];
let tok = 0;
function sess(u){ const t = "tok" + (++tok); users[u.email||u.phone].tok = t; return { access_token: t, refresh_token: "r" + t, expires_in: 3600, user: { id: u.id, email: u.email, phone: u.phone } }; }
function who(h){ const t = (h.authorization||"").replace("Bearer ",""); return Object.values(users).find(u=>u.tok === t); }
function sb(url, req){
  const u = new URL(url), p = u.pathname, m = req.method(), b = req.postData() ? JSON.parse(req.postData()) : null, h = req.headers();
  log.push(`${m} ${p}${u.search} auth=${h.authorization ? "user" : "none"} apikey=${h.apikey ? h.apikey.slice(0,15) : "-"}`);
  if(p === "/auth/v1/signup"){ const k = b.email || b.phone; if(users[k]) return [422, {msg:"User already registered"}]; users[k] = {id:"uid-"+Object.keys(users).length, email:b.email, phone:b.phone, pw:b.password}; return [200, sess(users[k])]; }
  if(p === "/auth/v1/token" && u.searchParams.get("grant_type") === "password"){ const x = users[b.email || b.phone]; if(!x || x.pw !== b.password) return [400, {error:"invalid_grant", error_description:"Invalid login credentials"}]; return [200, sess(x)]; }
  if(p === "/auth/v1/token"){ const x = Object.values(users).find(x=>"r"+x.tok === b.refresh_token); return x ? [200, sess(x)] : [400, {error_description:"Invalid Refresh Token"}]; }
  if(p === "/auth/v1/user"){ const x = who(h); if(!x) return [401, {msg:"invalid JWT"}]; if(m === "PUT") x.pw = b.password; return [200, {id:x.id, email:x.email, phone:x.phone}]; }
  if(p === "/auth/v1/logout"){ const x = who(h); if(x) x.tok = null; return [204, null]; }
  if(p === "/auth/v1/recover") return [200, {}];
  if(p === "/rest/v1/user_state"){ const x = who(h); if(!x) return [401, {message:"JWT"}]; if(m === "POST"){ rows[x.id] = b; return [201, null]; } return [200, rows[x.id] ? [rows[x.id]] : []]; }
  if(p === "/rest/v1/rpc/delete_me"){ const x = who(h); delete rows[x.id]; delete users[x.email||x.phone]; return [200, null]; }
  return [404, {}];
}
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", e => errs.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/401|400|422|404/.test(m.text())) errs.push("console: " + m.text()); });
  await ctx.route("**/*", async r => {
    const url = r.request().url();
    if (url.startsWith("http://localhost")) return r.continue();
    if (url.includes("supabase.co")){ const [st, body] = sb(url, r.request()); return r.fulfill({status: st, contentType:"application/json", headers:{"access-control-allow-origin":"*"}, body: body == null ? "" : JSON.stringify(body)}); }
    const data = route(url);
    if (data) return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(data) });
    return r.fulfill({ status: 404, body: "", headers: { "access-control-allow-origin": "*" } });
  });
  const shot = async n => { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/${n}.png` }); };
  const step = async (n, fn) => { try { await fn(); } catch (e) { errs.push(`step ${n}: ${e.message.split("\n")[0]}`); } };
  await page.goto("http://localhost:8765/index.html"); await page.waitForTimeout(1500);
  await page.evaluate(()=>window.scrollTo(0, 400)); await shot("a01-connect-signin");
  await page.fill("#uname", "jahswor"); await page.click("#connectBtn");
  await page.waitForSelector(".teamrow-list", { timeout: 20000 }); await page.waitForTimeout(2500);
  await page.evaluate(()=>document.querySelector(".takecontrol").scrollIntoView({block:"center"})); await shot("a02-home-card");
  await step("open create", async()=>{ await page.click('.takecontrol [data-acopen="create"]'); }); await shot("a03-sheet-create");
  await step("bad id", async()=>{ await page.fill("#acId","notanemail"); await page.fill("#acPw","abc"); await page.click('[data-acgo]'); }); await shot("a04-error");
  await step("create", async()=>{ await page.fill("#acId","Elijah@Example.com"); await page.fill("#acPw","Touchdown#2026"); await page.click('[data-aceye]'); await shot("a05-filled"); await page.click('[data-acgo]'); });
  await page.waitForTimeout(800); await shot("a06-signed-in");
  await step("set dir to trigger sync", async()=>{ await page.evaluate(()=>{ store.set("dir:testleague","rebuild"); }); await page.waitForTimeout(2200); });
  const row = Object.values(rows)[0]; log.push("ROW keys: " + (row ? Object.keys(row.data).join(",") : "none"));
  await step("account sheet", async()=>{ await page.click('#acslot .acchip'); }); await shot("a07-account");
  await step("delete arm", async()=>{ await page.click('[data-acdel]'); }); await shot("a07b-delete-armed");
  await step("signout", async()=>{ await page.click('[data-acout]'); }); await page.waitForTimeout(600); await shot("a08-signed-out");
  // wipe local, sign in, see data return
  await page.evaluate(()=>{ localStorage.removeItem("cc:dir:testleague"); });
  await step("signin", async()=>{ await page.click('#acslot .acchip'); await page.waitForTimeout(300); await page.fill("#acId","elijah@example.com"); await page.fill("#acPw","wrong"); await page.click('[data-acgo]'); await page.waitForTimeout(400); await shot("a09-bad-pw");
    await page.fill("#acPw","Touchdown#2026"); await page.uncheck("#acRemember", {force:true}).catch(async()=>{ await page.click(".remember"); }); await page.click('[data-acgo]'); });
  await page.waitForTimeout(1500);
  log.push("restored dir: " + await page.evaluate(()=>localStorage.getItem("cc:dir:testleague")));
  log.push("auth in session only: " + await page.evaluate(()=>!!sessionStorage.getItem("cc:auth") && !localStorage.getItem("cc:auth")));
  await step("forgot", async()=>{ await page.evaluate(()=>openAccount("signin")); await page.waitForTimeout(300); await page.click('[data-acmode="reset"]'); await page.fill("#acId","elijah@example.com"); await page.click('[data-acgo]'); }); await shot("a10-reset");
  await page.goto("about:blank");
  await page.goto("http://localhost:8765/index.html#access_token=" + users["elijah@example.com"].tok + "&refresh_token=x&expires_in=3600&type=recovery");
  await page.waitForTimeout(3000); await shot("a11-newpw");
  log.push("hash cleared: " + await page.evaluate(()=>location.hash === ""));
  // dormant mode
  await page.addInitScript(()=>{ window.CC_SB_KEY = ""; });
  await page.goto("http://localhost:8765/index.html"); await page.waitForTimeout(3000);
  log.push("dormant: card=" + await page.evaluate(()=>!!document.querySelector(".takecontrol")) + " chip=" + await page.evaluate(()=>!!document.querySelector(".acchip")));
  console.log(log.filter(l=>!l.startsWith("GET /rest")).join("\n")); console.log(errs.length ? errs.join("\n") : "NO ERRORS");
  await browser.close();
})();

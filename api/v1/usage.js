// GET /api/v1/usage: your key's plan, today's calls and the last 30 days (this call counts too)
const { endpoint, send, sb } = require("../_lib/ffu.js");
module.exports = endpoint(async (req, res, ctx) => {
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const rows = await sb(`/rest/v1/api_usage?select=day,calls&key_hash=eq.${ctx.hash}&day=gte.${since}&order=day.desc`);
  send(res, 200, { data: { plan: ctx.plan, dailyLimit: ctx.dailyLimit, today: ctx.calls, remainingToday: Math.max(0, ctx.dailyLimit - ctx.calls), resets: "midnight UTC", last30Days: rows } }, { ...ctx.limits, "Cache-Control": "no-store" });
});

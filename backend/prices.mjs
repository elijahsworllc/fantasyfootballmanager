// Prediction-market price recorder. Runs on a schedule from .github/workflows/prices.yml.
// Snapshots every open NFL market on Kalshi and the fantasy-relevant NFL game markets on Polymarket,
// and writes only the prices that changed since the previous run, so a season of history stays small.
//
// Output (OUT_DIR, the `history` branch):
//   kalshi/YYYY-MM-DD/HHMM.ndjson.gz       first line {"ts":...}, then [ticker, yesBid, yesAsk, last, volume, openInterest]
//   kalshi/YYYY-MM-DD/HHMM.meta.ndjson.gz  one object per market seen for the first time (title, strike, game time, ...)
//   polymarket/YYYY-MM-DD/HHMM.ndjson.gz   first line {"ts":...}, then [marketId, bestBid, bestAsk, last, yesPrice, volume, liquidity]
//   polymarket/YYYY-MM-DD/HHMM.meta.ndjson.gz
// Kalshi prices are in cents (0-100). Polymarket prices are in tenths of a cent (0-1000).
// STATE_FILE holds the last price seen per market; it is kept in the Actions cache, not in git.
// If it is missing, the run simply writes a full snapshot.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const KALSHI = "https://api.elections.kalshi.com/trade-api/v2";
const GAMMA = "https://gamma-api.polymarket.com";
const POLY_NFL_SERIES = process.env.POLY_NFL_SERIES || "12185";
const OUT_DIR = process.env.OUT_DIR || "history";
const STATE_FILE = process.env.STATE_FILE || ".prices-state.json";

// Polymarket market types worth keeping for fantasy: game lines, team scoring and player props.
// Quarter and half markets (most of the ~16,000 open NFL markets) are skipped.
const POLY_KEEP = new Set([
  "moneyline", "spreads", "totals", "team_totals", "team_touchdowns", "team_offensive_yards",
  "anytime_touchdowns", "two_plus_touchdowns", "first_touchdowns", "team_first_touchdowns",
  "passing_yards", "passing_touchdowns", "passing_attempts", "passing_completions",
  "rushing_yards", "receiving_yards", "receptions", "longest_reception",
]);

const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function getJSON(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "ffu-price-recorder", accept: "application/json" } });
      if (r.status === 429 || r.status >= 500) {
        const wait = (+r.headers.get("retry-after") || 2 ** i) * 1000;
        if (i < tries - 1) { await sleep(wait); continue; }
      }
      if (!r.ok) throw new Error(`${r.status} for ${url}`);
      return await r.json();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await sleep(1000 * 2 ** i);
    }
  }
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  const worker = async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: String(e.message || e) }; } } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}
const num = v => (v === undefined || v === null || v === "" ? null : +v);
const cents = v => (num(v) === null ? null : Math.round(+v * 100));
const milli = v => (num(v) === null ? null : Math.round(+v * 1000));

// ---------- Kalshi ----------
export async function kalshiSeries() {
  const j = await getJSON(`${KALSHI}/series?category=Sports&tags=Football`);
  return (j.series || []).map(s => s.ticker).filter(t => /NFL/.test(t)).sort();
}
export async function kalshiMarkets(series) {
  const all = [];
  const got = await pool(series, 4, async s => {
    const list = [];
    let cursor = "";
    for (let page = 0; page < 50; page++) {
      const j = await getJSON(`${KALSHI}/markets?series_ticker=${encodeURIComponent(s)}&status=open&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      for (const m of j.markets || []) list.push({ ...m, _series: s });
      cursor = j.cursor;
      if (!cursor) break;
    }
    return list;
  });
  let failed = 0;
  for (const g of got) { if (Array.isArray(g)) all.push(...g); else failed++; }
  return { markets: all, failed };
}
export function kalshiRow(m) {
  return [m.ticker, cents(m.yes_bid_dollars), cents(m.yes_ask_dollars), cents(m.last_price_dollars), num(m.volume_fp), num(m.open_interest_fp)];
}
export function kalshiMeta(m) {
  return {
    ticker: m.ticker, series: m._series, event: m.event_ticker, title: m.title,
    yes: m.yes_sub_title, strike: num(m.floor_strike), cap: num(m.cap_strike), strike_type: m.strike_type,
    custom_strike: m.custom_strike || null, participant: m.primary_participant_key || null,
    game_time: m.occurrence_datetime || m.expected_expiration_time || null, close_time: m.close_time || null,
  };
}

// ---------- Polymarket ----------
const GAME_SLUG = /^nfl-[a-z]{2,4}-[a-z]{2,4}-\d{4}-\d{2}-\d{2}$/;
export async function polymarketEvents(nowMs) {
  const keep = [];
  for (let offset = 0, page = 0; page < 40; page++, offset += 10) {
    const arr = await getJSON(`${GAMMA}/events?series_id=${POLY_NFL_SERIES}&closed=false&limit=10&offset=${offset}`);
    const list = Array.isArray(arr) ? arr : arr.events || arr.data || [];
    for (const e of list) {
      if (!GAME_SLUG.test(e.slug || "")) continue;
      const start = Date.parse(e.startTime || e.endDate || "");
      // Upcoming games and games still in progress; skip stale events that were never closed.
      if (!(start > nowMs - 8 * 3600e3)) continue;
      keep.push(e);
    }
    if (list.length < 10) break;
  }
  return keep;
}
export function polymarketMarkets(events) {
  const out = [];
  for (const e of events) for (const m of e.markets || []) {
    if (!POLY_KEEP.has(m.sportsMarketType) || m.closed) continue;
    out.push({ ...m, _event: e.slug, _start: e.startTime });
  }
  return out;
}
function firstPrice(m) {
  try { const p = JSON.parse(m.outcomePrices || "[]"); return p.length ? p[0] : null; } catch { return null; }
}
export function polyRow(m) {
  return [String(m.id), milli(m.bestBid), milli(m.bestAsk), milli(m.lastTradePrice), milli(firstPrice(m)), num(m.volumeNum), num(m.liquidityNum)];
}
export function polyMeta(m) {
  let outcomes = null;
  try { outcomes = JSON.parse(m.outcomes || "null"); } catch {}
  return {
    id: String(m.id), slug: m.slug, event: m._event, question: m.question, type: m.sportsMarketType,
    line: num(m.line), item: m.groupItemTitle || null, outcomes, game_time: m.gameStartTime || m._start || null,
    condition_id: m.conditionId || null,
  };
}

// ---------- Change detection and output ----------
export function diff(rows, prev) {
  const next = {}, changed = [];
  for (const r of rows) {
    const sig = r.slice(1).join(",");
    next[r[0]] = sig;
    if (prev[r[0]] !== sig) changed.push(r);
  }
  return { next, changed };
}
function writeGz(file, lines) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, zlib.gzipSync(lines.map(l => JSON.stringify(l)).join("\n") + "\n", { level: 9 }));
}

export async function run({ now = new Date() } = {}) {
  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
  const day = now.toISOString().slice(0, 10), hhmm = now.toISOString().slice(11, 16).replace(":", "");
  const ts = Math.floor(now.getTime() / 1000);
  const summary = {};

  // Kalshi
  try {
    const series = await kalshiSeries();
    const { markets, failed } = await kalshiMarkets(series);
    const prev = state.kalshi || {};
    const { next, changed } = diff(markets.map(kalshiRow), prev);
    const fresh = markets.filter(m => !(m.ticker in prev)).map(kalshiMeta);
    if (changed.length) writeGz(path.join(OUT_DIR, "kalshi", day, `${hhmm}.ndjson.gz`), [{ ts }, ...changed]);
    if (fresh.length) writeGz(path.join(OUT_DIR, "kalshi", day, `${hhmm}.meta.ndjson.gz`), fresh);
    state.kalshi = next;
    summary.kalshi = { series: series.length, failedSeries: failed, open: markets.length, changed: changed.length, newMarkets: fresh.length };
  } catch (e) { summary.kalshi = { error: String(e.message || e) }; }

  // Polymarket
  try {
    const events = await polymarketEvents(now.getTime());
    const markets = polymarketMarkets(events);
    const prev = state.poly || {};
    const { next, changed } = diff(markets.map(polyRow), prev);
    const fresh = markets.filter(m => !(String(m.id) in prev)).map(polyMeta);
    if (changed.length) writeGz(path.join(OUT_DIR, "polymarket", day, `${hhmm}.ndjson.gz`), [{ ts }, ...changed]);
    if (fresh.length) writeGz(path.join(OUT_DIR, "polymarket", day, `${hhmm}.meta.ndjson.gz`), fresh);
    state.poly = next;
    summary.polymarket = { games: events.length, open: markets.length, changed: changed.length, newMarkets: fresh.length };
  } catch (e) { summary.polymarket = { error: String(e.message || e) }; }

  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  console.log(JSON.stringify(summary));
  if (summary.kalshi.error && summary.polymarket.error) process.exitCode = 1;
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) await run();

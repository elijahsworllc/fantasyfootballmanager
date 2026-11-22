// Second opinion: DynastyProcess expert values (github.com/dynastyprocess/data, built from FantasyPros
// expert consensus rankings), joined to Sleeper player ids. Free, updated about weekly upstream.
//
// Role in the app: shown next to the market value in each player's "Show the math", and used as the
// value for players the market doesn't price yet. NOT mixed into trade prices: on 2,890 dynasty trades
// in the FFU database (Oct 13 to Nov 22, 2026), blending it in made real trades look less fair, and
// expert-vs-market gaps didn't predict later market moves (tools/calibration/dp_eval.py).
//
// Output (data branch): dp.json { built, scraped, source, players: {sleeperId: [v1qb, vSF, ecr1qb, ecrSF, ecrPos, pos, name, age]} }
// Licensing note: the repo is GPL-3; the FantasyPros rankings underneath have their own terms.
// Fine for the free beta; revisit (or license FantasyPros) before charging.
import fs from "node:fs";
import path from "node:path";

const DIR = process.env.OUT_DIR || process.argv[2] || "data-branch";
const BASE = "https://raw.githubusercontent.com/dynastyprocess/data/master/files/";

function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.length > 1);
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
async function get(name) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(BASE + name);
    if (r.ok) return parseCSV(await r.text());
    await new Promise(s => setTimeout(s, 2000 * (i + 1)));
  }
  throw new Error("could not fetch " + name);
}
const num = x => (x === undefined || x === "" || x === "NA" ? null : +x);

try {
  const [vals, ids] = await Promise.all([get("values-players.csv"), get("db_playerids.csv")]);
  const fp2sl = new Map();
  for (const r of ids) if (num(r.fantasypros_id) && num(r.sleeper_id)) fp2sl.set(r.fantasypros_id, r.sleeper_id);
  const players = {}; let missing = 0, zero = 0, scraped = "";
  for (const r of vals) {
    const sid = fp2sl.get(r.fp_id); scraped = r.scrape_date > scraped ? r.scrape_date : scraped;
    if (!num(r.value_1qb) && !num(r.value_2qb)) { zero++; continue; }          // deep names valued at 0
    if (!sid) { missing++; continue; }
    players[sid] = [num(r.value_1qb), num(r.value_2qb), num(r.ecr_1qb), num(r.ecr_2qb), num(r.ecr_pos), r.pos, r.player, num(r.age)];
  }
  const out = { built: Date.now(), scraped, source: "DynastyProcess values (FantasyPros expert consensus), github.com/dynastyprocess/data", players };
  fs.writeFileSync(path.join(DIR, "dp.json"), JSON.stringify(out));
  console.log(`dp.json: ${Object.keys(players).length} players (scraped ${scraped}); ${missing} without a Sleeper id, ${zero} valued at 0`);
} catch (e) {
  console.log("DynastyProcess unavailable, keeping yesterday's dp.json:", e.message);   // never fail the nightly job
}

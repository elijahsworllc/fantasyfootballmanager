# Command Center — Build Notes & Roadmap

Owner: jahswor (Sleeper user_id 1064668485038567424) · Started Oct 12, 2026

## V1 shipped: Lineup Command Center (index.html)
Single-file mobile web app. Runs entirely in the browser against Sleeper's public API (CORS-enabled, no auth).

**Data sources (all verified live):**
- `GET /v1/user/{username}` → user_id
- `GET /v1/state/nfl` → season, week
- `GET /schedule/nfl/regular/{season}` → per-game status: `pre_game`, `in_game`, `complete`, `canceled` (used for byes, locks, canceled games)
- `GET /projections/nfl/{season}/{week}?season_type=regular&position[]=…` → Rotowire stat projections + player meta + injury status (~2 MB, one call)
- `GET /v1/user/{id}/leagues/nfl/{season}` → ~89 leagues (71 active, rest best ball / pre-draft)
- `GET /v1/league/{id}/rosters` and `/matchups/{week}` per league (6 concurrent)

**Logic:**
- Scoring: dot product of projected stats × each league's `scoring_settings` (matches Sleeper's own pts_ppr within ±0.05 on standard leagues; handles TEP, PPC, first downs, bonuses that are stat keys). Kicker 50+ bucket aliased to 50–59.
- Availability weights: Out/IR/PUP/Sus/NA/DNR/COV = 0, Doubtful = 0.2, Questionable = 0.85; bye/canceled/no-team = 0.
- Optimizer: locked players (game in_game/complete) stay put; open slots filled most-restrictive-first (QB → … → FLEX → SUPER_FLEX). Optimal for nested slot eligibility.
- Flags: Must fix (empty slot, Out/IR/Doubtful, bye, canceled, no team), Check (Questionable + league auto-sub count from `settings.max_subs`, healthy player stuck in IR slot), Upgrade (gain ≥ threshold, default 1.5), Note (open roster spots).
- Matchup: projected score vs opponent (actual points for finished games) + rough win %.
- Players tab: exposure across leagues, injured/bye filter, start/sit mismatch filter.

**Known limits:**
- Sleeper API is read-only: lineup changes still happen in Sleeper.
- API doesn't expose whether a user set an auto-sub on a player.
- Schedule has dates, not kickoff times; "locked" comes from game status.

## V1.1 shipped: Blueprints (Oct 12, 2026)
Automated version of Dynasty Domain's $79 team review / $97-a-year Blueprint, for every team at once.
- Dynasty + redraft values from FantasyCalc's public values feed (matched per league: QB count, team count, PPR). Commercial launch needs their permission or our own value model.
- Pick ownership from Sleeper `/league/{id}/traded_picks`; next year's picks tiered Early/Mid/Late by the original team's win-now rank.
- Per team: win-now rank (best lineup by redraft value), future rank (players RB<=24 / WR,TE<=25 / QB<=27 plus picks), archetype (Juggernaut, Win-now, Rising, Middle, Rebuilding, Full rebuild), A–F positional grades, value-weighted age, 2-season value outlook from age curves.
- Rule-based strategy with named trade partners (contenders weak at the position you sell; non-contenders strong where you need).
- League map scatter and team table per league.

## V1.2 shipped: Crystal Ball (Oct 12, 2026)
Floating orb on every screen. Data only, no AI calls. Smoke animation is 1.1s on the first ask, 0.45s on follow-ups within 2 minutes, tap to skip, off with reduced motion.
- Start/Sit: 2+ players, one league (that league's scoring, injury weighting) or all leagues (per-league table where scoring flips the call). Confidence = P(A outscores B) with sd = 45% of projection.
- Trade check: players and picks; value with a stud premium (power mean, exponent 1.3), win-now and future rank before/after, grade changes, weighted by the team's Blueprint archetype. Verdicts: Smash accept, Accept, Fair, Lean decline, Decline.
- Compare: dynasty value, 30-day trend, age, this week's points, your exposure.
- Each answer shows the data behind it and what would change the call.

## V1.3 shipped: speed, waivers, trades, backend (Oct 13, 2026)
- **Instant open:** every Sleeper/FantasyCalc response is saved in the browser's Cache Storage. The app paints from the saved copy, then refreshes quietly. `sw.js` keeps the app shell available offline (network-first, so updates still land).
- **Waivers tab:** per league, fills for lineup holes and real upgrades (league scoring), dynasty stashes worth more than your weakest bench piece, a drop suggestion, and a FAAB bid. Bids come from every winning FAAB claim in your leagues this season, bucketed by value tier (Depth <300, Useful <1000, Starter-level <2500, Impact) as a share of budget, then scaled by how that league bids. Shows league bid history and who has the most FAAB left. Cross-league "best adds" list with Sleeper's 24h trending adds.
- **Trades tab:** partners ranked by roster fit (their surplus vs your needs and vice versa, contender/rebuilder complement) and real activity (trades and moves this season, last move). Suggested 1-for-1 or 2-for-1 offer from your surplus and picks, priced with FantasyCalc and leaning slightly toward them; one tap sends it to Crystal Ball. Trade market search shows every real trade for a player across your leagues.
- **Today card:** day-aware nudge at the top of the Queue (waiver night, Thursday kickoff, trade window, game day).
- **Backend (GitHub Actions, free on a public repo):**
  - `alerts.yml` runs every 15 minutes on Thu/Sun/Mon (UTC) and sends one push per New York window (Thu 6:30pm, Sat 9pm, Sun 8:30am / 11:30am / 3pm / 7:15pm, Mon 6:30pm) via ntfy.sh. Needs the `NTFY_TOPIC` repo secret. State lives on the `data` branch.
  - `market.yml` runs nightly (~5:20am ET): writes `market.json` (all completed transactions in your leagues, no usernames) and a daily FantasyCalc value snapshot to the `data` branch. The app reads it from raw.githubusercontent.com and only fetches the last two weeks live.
  - Data on the `data` branch is public (league IDs, roster numbers, player IDs). Move to a private store before adding other users.

## V1.4 shipped: Direction + Trade Finder (Oct 13, 2026)
Replaces the Trades tab. First decides which way each team should go, then finds the trades that get it there.
- **Season simulator:** 1,000 simulated seasons per league from your real record and points (Sleeper roster settings), the actual remaining schedule (`/league/{id}/matchups/{week}` for future weeks, cached), and each team's weekly strength. Strength blends real points per game with the best lineup's projection (this week + next week, so byes don't zero a player; long-term injuries discounted), weighted toward real scoring as the season goes on. Handles median-scoring leagues. Then plays the playoff bracket (top seeds get byes).
- **Outputs per team:** playoff odds, bubble risk (chance to finish first team out), title odds vs league average, remaining schedule difficulty, games back, and leverage (what +6 pts/week does to your playoff odds).
- **Direction, 8 levels:** Stay the course, All-in, Contend, Push now, Retool, Sell, Rebuild, Teardown. Limbo = 20–60% playoff odds; Push if one upgrade gets you to 55%+, otherwise Retool (young core) or Sell. Every verdict shows the numbers behind it.
- **Trade Finder:** buy offers (players who raise your lineup, mostly from sellers, paid with bench pieces and picks) and sell offers (your veterans to teams whose lineup they improve, for youth and picks). Each offer is re-simulated for both sides: your playoff/title odds or future rank, their playoff odds or young value. Shows FantasyCalc value balance, accept odds (value, fit for them, how often they trade), market comps from your leagues, 30-day value trend (buy-low / sell-high), and a ready-to-send message for the other manager.
- **Paths compared:** Hold vs best Buy vs best Sell, run through the same simulated seasons, with a close-call warning when the other path is realistic.
- Known limits: playoff spots stand in for payout spots; divisions aren't modeled; FantasyCalc's public trade database isn't wired in yet (comps come from your own leagues via `market.json`).

## V2.0 shipped: redesign (Oct 13, 2026)
- **Design system:** night-stadium navy field (light theme too), violet signal color shared with the Crystal Ball, severity colors only where they carry meaning. Unbounded for titles and big numbers, Geist for everything else, sentence case throughout, tabular digits.
- **Navigation:** floating glass dock (Lineups, Waivers, Crystal Ball orb, Direction, Teams) with a sliding indicator; large title that tucks into a glass bar on scroll; segmented controls for Needs action / All leagues and Team reviews / Player exposure.
- **Lineups hero:** a lineup-health ring (must fix / to check / upgrades / set) that sweeps in once on open; the legend filters the list.
- **Motion:** View Transitions between sections, sliding indicators, shimmer skeletons while a section builds, Crystal Ball sheet rises in. All motion respects reduced-motion.
- Waivers opens with a stat strip; bid methodology moved into "How bids are set".

## V2 shipped: Space redesign (Oct 14, 2026)
Same data engine (lineups, Blueprints, Direction sims, trade finder, waivers, Crystal Ball); new interface on top.
- Look: live space background (nebulae, twinkling stars, random shooting stars, drifting footballs, helmets, trophies, goalposts and jerseys), film grain, frosted-glass surfaces, Barlow Condensed italic display type, cyan-to-violet gradient buttons. One motion language: sections rise and come into focus in sequence.
- Crystal ball: canvas particle engine (~2,000–2,600 points: glass shell, spiral core, orbit rings, stand, dust). Materializes bottom-up with a scan ring, dissolves into a vortex, thinks while answering. Particles have momentum: the cursor pushes them, swipes fling them, taps send a shockwave, and a spring that stiffens with distance pulls them back.
- Connect → live scan screen (league counter + names streaming) → Home.
- Home: ask bar with plain-words parser (player names → Start/sit, "for"/"trade" → Trade check, "better"/"value" → Compare, "out" → Must fix, "waiver", "brief"), Must fix / Monitor / Start-sit tiles, weekly brief, My teams (A–Z, Contending, Rebuilding sorts; Contend / Rebuild / Undecided filters). Scores = win-now and young-asset value relative to the best team in the league (0–100).
- Must fix: every Out/IR/Doubtful/bye/empty starter grouped by player, soonest kickoff first, the bench swap per league, Open ↗ to the Sleeper team page, done checks + progress. Monitor and Start/sit tabs reuse the lineup cards.
- Team: scores with league rank, direction switch (Contend / Undecided / Rebuild, suggestion from the Blueprint archetype, saved per league on the device), grades, trade recs from the trade finder filtered by direction (buy for contend, sell for rebuild, best of both when undecided) with market lines, accept odds, pitch text, Crystal Ball check; trade chips / move-off list; this week's lineup card.
- Weekly brief: generated on demand from the scan (theme, story, projected wins, fixes, coin flips, three items that link to the fix, long-game note on undecided teams).
- Nav: Home · Must fix (badge) · crystal ball · Waivers · Players (exposure + team reviews).

## V2.1 shipped: one flow (Oct 14, 2026)
Reorganized around the order you actually manage a team: diagnose, trades, offers, lineups, waivers. Time-sensitive lineup work always jumps the line.
- **Pinned crystal ball** on every screen. It reads what you type live (players by full name, last name, first name, nickname or typo; your leagues by name; NFL teams; positions; picks) and shows what it heard plus the best 3–5 actions. Enter runs the top one; arrows pick another. Examples: "start bijan or puka", "sell davante", "trade for waddle", "is the commish league a rebuild", "top 12 rb dynasty", "what did ceedee cost", "chiefs".
- **Spin or shake to ask:** flick the small ball in the bar (or the big ball on the Ask screen) to send; shake the phone to ask too (Settings toggle; iPhone asks for motion permission once).
- **Game plan rail** under the bar: 1 Diagnose · 2 Trades · 3 Offers · 4 Lineups · 5 Waivers, with live badges. The urgent step turns red and scrolls into view.
- **Top-left menu:** Right now (must fix, game-time, better lineups, brief) · the game plan with status lines · every tool · jump to any league (search, soonest lock first).
- **Home:** Thursday/early-game card condensed (counts, the most urgent fix, the rest behind "Show more"), or a Next-lock card; tiles; game plan; teams sorted by next lock by default.
- **New screens:** Diagnose (cross-league season sims, limbo first), Trades hub (trade finder per team, trade check, compare, trade market search), Offers (every copied trade message is tracked: waiting / countered / accepted / declined, nudge after 2 days, acceptance rate).
- **Dock:** Home · Lineups · ball · Trades · Rankings (Waivers lives in the rail and menu).
- **Rankings:** tiers that break where value drops off, 30-day risers/fallers, value bar, age, PPG, and per player a "why he's here" panel (tier spread and cliff, market rank, age curve, production rank, last-3 trend, target share/snaps/carries, 30-day value move, matchup in weekly mode, your exposure) with a weekly points sparkline.
- Known limits: offers are saved on this device only; FantasyCalc volatility/tier fields are used only when present.

## Trade market database (plan)
Goal: trade recs backed by real trades in identical league types, plus market deviation (who is selling above or below value right now), owned by us instead of depending on FantasyCalc.
- Collect: Sleeper `/v1/league/{id}/transactions/{week}` trades (adds, `draft_picks`, timestamps), snowball-crawled from our leagues → every manager in them → their leagues, under Sleeper's rate limits. Extends `backend/market.mjs`.
- Store per trade: league fingerprint (dynasty/redraft, SF/1QB, teams, PPR, TEP, starters), both sides' players and picks, each side's record and archetype at the time.
- Model: per league-type bucket, fit market values so each trade's sides balance (regularized, recency-weighted, outliers dropped), refreshed daily.
- Signals: market vs consensus value (deviation), 7/30-day trend, volume, cohort shifts (e.g. RBs 30+), what contenders vs rebuilders actually pay.
- Recs: real trade shapes from the same bucket, filtered to what a partner can supply, scored by fairness at market price + fit with the team's direction + positional need, shown with comps ("19 trades in SF 12-team, last 30 days").

## Idea board (future)
### Sleeper companion extension: make the moves where you play
Goal: no gap between the Command Center and the actual lineup. Suggested swaps, waiver claims and trade offers are applied in Sleeper with one tap, from inside Sleeper.
- **Why an extension:** Sleeper's public API is read-only and has no plugin system. The Sleeper mobile app can't load extensions; sleeper.com in a desktop or mobile browser can.
- **Form:** a browser extension for Chrome/Edge (desktop) and Safari on iPhone/Mac (Safari Web Extensions). It reads the Command Center's suggestions for the league you're viewing and overlays them on Sleeper's own pages: lineup swaps highlighted with an "Apply" button, waiver adds with the suggested bid, trade recs prefilled in Sleeper's trade screen.
- **How actions happen:** with the user's own signed-in Sleeper session in their own browser, either by driving Sleeper's web UI or by calling the same endpoints the web app uses. Always shown first, confirmed by the user, one league at a time. Never stores the Sleeper password.
- **Open questions to settle before building:** Sleeper's terms of service on automation; how often Sleeper's web app changes (maintenance cost); rate limits; whether to ask Sleeper about an official partnership or developer access instead.
- **Prerequisites:** accounts (so the extension and app share suggestions), hosted suggestions per league, then the extension.
- **Batch mode (the main reason to build this):** one review screen that applies every lineup fix across all leagues at once. Built for the late-news crunch: NFL inactives drop about 90 minutes before kickoff, and some game-time decisions come minutes before lock, which leaves managers with many leagues scrambling.
  - **Contingency plans set ahead of time:** for each Questionable starter, "if he's ruled out, start X" per league, defaulting to the Command Center's best healthy bench option. When the status flips to Out, the whole plan is ready to apply in one tap across every affected league.
  - **Pre-game watch window:** from ~2 hours before each kickoff slot, the alerts job checks Sleeper injury status every few minutes (today it runs every 15) and pushes "Player X is OUT: apply your plan in 6 leagues" with a link straight to the batch screen.
  - **Safety:** only swaps whose replacement hasn't locked yet; skips any league where you've already changed the lineup; shows a result per league (applied, skipped and why).

## Accounts shipped (Oct 14, 2026)
Supabase project `uxqevvuqibqvypwpccjz`, called directly over its REST endpoints (no SDK). The app holds only the publishable key; it works the same without an account.
- **Login with email or phone** plus password. Phone numbers are normalized (10 digits → +1) and verified by a 6-digit text; that needs an SMS provider (e.g. Twilio, about a cent per text) switched on under Authentication → Sign In / Providers → Phone. Until then the app says phone sign-in isn't on yet.
- **Stay signed in** checkbox (on by default): the session lives in the device's storage; unchecked, it's kept only until the app is closed. Sessions refresh automatically.
- Forgot password (email link → "New password" sheet), show/hide password, strength meter, plain-English errors.
- **Sync:** Sleeper username, rankings, team directions, done checks and settings go to one `user_state` row per user, 1.5 s after any change. Signing in on a new device pulls them down and rescans.
- Entry points: "Take control of your command center" card on Home (dismissible), "Have an account? Sign in" on Connect, account button in the header, account row in Settings. Account sheet: sync now, sign out, delete account (tap twice).
- Setup: `backend/supabase.sql` (table, row-level security so each user only sees their own row, `delete_me()` function). Site URL in Authentication → URL Configuration must be the app's address so email links come back to it.

## Fix: V2.1 restored (Oct 14, 2026)
The accounts build (05290fb) was made from the V2 code and dropped the whole V2.1 "one flow" release (pinned crystal ball, game plan rail, menu, Diagnose / Trades / Offers screens, spin and shake to ask, richer rankings). Restored by a three-way merge of V2 → V2.1 onto the accounts build; the three overlapping spots kept both sides, with the account button added to the V2.1 header. V2.1's code now lives in `src/ui6.js`; `tools/assemble.py` keeps engine lines 348–1774. Full app and account tests pass.
**Rule for every session:** pull `main` first, edit `src/`, run `python3 tools/assemble.py` and both tests before pushing.

## V2.2 · clarity pass (Oct 18, 2026)
Review found the features solid but the way around them scattered: four overlapping navigation systems, a tall pinned header, and Home burying the team list.
- **One navigation:** bottom bar is Home · Lineups · Ask (ball) · Trades · Teams. The numbered game-plan strip and the duplicate list on Home are gone. The menu is a grouped index: team search, This week, Trades, Players & teams, Account.
- **Back works everywhere:** inner screens have a back button, and the phone's swipe/back gesture walks back through screens (history state).
- **Teams screen** (new dock tab) merges Diagnose and Team reviews: *Now vs future* (value today vs in two seasons, position grades) and *Playoff odds* (1,000 simulated seasons). Every card opens the team's full diagnosis and trade recs.
- **Home:** urgent card and Must fix · Game-time · Upgrades counts, then *This week* (only what needs you: waiver night, teams with no lane, offers waiting, the brief), then **My teams**.
- **My teams sort and filter:** sort by Next lock, Record, Win-now rank, Future rank, Youngest, Playoff odds, A–Z. Filter by Contend, Rebuild, Undecided, Lineup issues, Young core (<25.5), Aging (27+). Each row shows record · now rank · future rank · avg age, plus a summary line and what the sort means.
- **Search (crystal ball) as a navigator:** keywords act as designators (trade, sell, buy, value, diagnose, compare, rank, waivers, lineups, offers). It finishes player and league names as you type, using only names that exist, and infers intent from players, leagues and teams ("sell lond" → Sell George London in Gridiron; "gridiron value" → that team's diagnosis). Empty search shows Go-to chips, suggestions from your data, and recents.
- **Naming:** Must fix · Game-time · Upgrades everywhere. No more "Step X of 5".
- **Header:** Sign in moved to the menu (header shows your initial once signed in). While scrolling down, the top row slides away and the search stays pinned, without shifting the page. The account banner is now one line.

## V2.3 · offers inbox, game-day run, links that land (Oct 19, 2026)
**Verified first:** Sleeper's public API never returns pending trade offers. In 401 recent transactions across 40 leagues, every trade listed was already completed. Sleeper's app-link file (sleeper.com/.well-known/apple-app-site-association) only hands /topics, /channels, /topic and /message to the app, so /leagues/... links open the mobile website, which asks you to log in.
- **Offers inbox (Offers → Received):** log a received offer in the trade builder (about 20 s). It's graded **Lowball / Close / Smash accept** from the full trade check: value change, win-now rank before and after, future rank before and after, and whether it fits your contend or rebuild plan. Up to 3 counters built from the real rosters (ask for a player at your weakest spot, add a pick, keep a piece, or swap down), each with the new value gap, a ready-to-copy message and a "Check" button that runs it through the full trade check. Work through them one at a time or as a list. Accept, Decline, Re-grade.
- **Game-day run:** every league with a decision before its lock, soonest first. Each league shows only the real moves ("WR: Start Ladd Henry for Caleb Legette"), what to check before kickoff, and projected points before and after. Open in Sleeper; when you come back it asks "Done?" and goes to the next league. Any Open button elsewhere also offers "Done ✓" when you return.
- **Link test:** a one-time card on Lineups lets you try the app link (league chat, /channels/{id}) and the website (/leagues/{id}/team) on your phone and keep whichever works. You can switch later in Settings.
- Build: the engine slice in tools/assemble.py now ends at a marker instead of a fixed line number, and mock game dates follow the calendar so the tests never go stale.

## V2.4 · recent trades feed (Oct 27, 2026)
Trades screen → **Recent trades**: every completed trade from the last 3 weeks across all leagues (All / My trades). Each shows the league, the date, what each team got, and, once the season sim has run, each team's **playoff odds, rest-of-season rank (projected weekly lineup in that league's scoring) and future-value rank before → after**, plus lineup points per week. "Before" undoes the trade on today's rosters and re-runs the same simulation used on Teams → Playoff odds. PC link: https://elijahsworllc.github.io/fantasyfootballmanager/

## Domain live: fantasyfootballuniverse.com (Nov 14, 2026)
- Hosted on Vercel (project `fantasyfootballuniverse`, team Elijah), deployed from `main` on every push. Builds from other branches, including `data`, are skipped by the project's ignored-build-step setting.
- DNS at Porkbun: A @ 216.198.79.1 and 64.29.17.1, CNAME www 3701dc8043c48dad.vercel-dns-017.com; www redirects (308) to the bare domain. TLS certificate auto-renews.
- Push alerts now link to https://fantasyfootballuniverse.com/. GitHub Pages stays up as a fallback.
- Supabase: Site URL should be the new domain, with redirect URLs for both domains.

## Fix: trade builder (Nov 21, 2026)
- Identical picks (two "2027 2nd (Early)") are separate assets now: both can be added, and removing one keeps the other. Every asset has a unique id (picks: season-round-original team).
- IR and taxi players are listed and tagged (new "IR / Taxi" filter), with injury tags. The roster list no longer stops at 40 assets, and picks from every round show (was rounds 1–4 only). Picks you own from another team say whose they were.
- The full trade check now values picks exactly as the builder shows them (tiered by the original team's strength). Before, a pick could show 2,400 in the builder and count as 0 in the verdict when its name didn't match FantasyCalc's.
- Offers inbox counters use the same asset list.

## Trade values: show the math + redraft fix (Nov 21, 2026)
- **"?" on every asset** in the trade calculator opens a ledger: market value and its source settings, overall and position rank, volatility range, 30-day trend, redraft value, this league's weekly projection, age rule, roster slot, and the exact number used. Picks show the tier rule (original team's win-now rank), the FantasyCalc key used and any fallback estimate. **Show the math** under the bar breaks down both sides, the stud premium and the gap. Every sheet lists the league settings the market value doesn't price in (TE premium, PPC, 6-pt pass TD, extra starters, IDP…).
- **Fix:** redraft leagues were priced with dynasty values. The value key now carries the league format (redraft → FantasyCalc redraft market).
- Pick provenance is stored on each pick (how its value was found).
- Full value-model audit and plan: `command-center/value-model-audit.md` in the project.

## Value model A: league-scoring adjustment (Nov 21, 2026)
Each player's projected stat line (this week's Sleeper projection) is scored twice: in the league's own rules and in the standard scoring the market value assumes (4-pt pass TD, the priced PPR, no bonuses). The ratio, relative to the typical starter (so a rule that lifts everyone equally changes nothing), is applied at 50% strength and capped at −25% / +35%. Players with no projection this week get their position's typical ratio. It flows through everything that uses values: the trade bar, the full check, team values and ranks, the trade finder, counters. It's a "League scoring" row in each player's "?" ledger (market value × multiplier, with both point totals). It can be turned off in Settings. Test leagues with TE premium +0.5: TEs ≈ +10%, other positions unchanged. The strength (alpha) will be calibrated against real trades in step B.

## Value model B: calibrated on 771 real trades (Nov 21, 2026)
Inputs: every completed two-team trade in the user's leagues (data branch market.json), valued with the daily FantasyCalc snapshot nearest each trade. League scoring, positions and season projections come from the new `calib.yml` job (data branch calib-inputs.json). Scripts are in the session notes (offline Python).
- **Stud premium 1.3 → 1.45.** At 1.3 the side giving more pieces came out +3.9% (median, 431 uneven trades); at ~1.45 it breaks even.
- **League-scoring adjustment taken out of trade prices.** 85 of 89 leagues are TE premium and 51 use 6-pt pass TDs, but trades don't price it: the TE-receiving side got fair market value (median +0.5%, 143 trades), and every positive strength made the fit worse. Prices stay at market. The scoring difference is shown as a **"+X% here" edge tag** (buy/sell signal) and scales **win-now lineup strength** (redraft value × scoring ratio). Opt-in setting to price trades by scoring.
- **Context for every gap:** real trades are looser than "±5% = even". Median |gap| 19%, only 13% within ±5%. The bar now says "closer to even than N% of the 771 trades made in your leagues this season".
- Caveats: snapshots start Oct 13 (earlier trades use that day's values); only the top ~420 players and plain pick prices are in the snapshot; snapshots are 12-team PPR. The calibration should be re-run monthly as trades accumulate.

## FFU in-house values (Nov 22, 2026)
Decision: FFU's own market values, built from trades in our users' leagues, replace third-party values over time.
- **Model (backend/inhouse.mjs, nightly):** each asset gets a factor on the market price on the day of the trade, chosen so real trades come out as fair as possible. Huber loss limits lopsided trades. A ridge pull toward the market price fades as an asset shows up in more trades. 90-day half-life. Stud premium 1.45. Strength (lambda) tuned on a validation window and scored on the newest 20% of trades, which are never used for tuning.
- **First result (771 trades, own leagues only):** held-out mean gap 15.9% → 15.0%, fairer on 87 vs 62 of 155 trades, median 13.2% → 14.0%. A modest gain; volume is the limit.
- **Database growth (backend/crawl.mjs, nightly):** seeds (platform users) → their league-mates → those people's leagues → completed trades. Bounded per run (250 new users, 600 leagues, ~600 calls/min). Stores ids only. Data branch: trades-db.json, crawl-state.json.
- **In the app:** values = market × FFU factor (dynasty leagues; players and pick classes). Ledger row "FFU in-house" shows the factor, the trade count and the database size. "Show the math" shows the held-out result. Settings: FFU in-house or market only.
- Next: move the trade store to Supabase once it outgrows a JSON file; add platform users as seeds automatically; fit per league shape (SF/1QB, TEP) once there's enough data; drop the market anchor for players with deep trade history.

## Value model C: second source, DynastyProcess (Nov 22, 2026)
- `backend/dp.mjs` (nightly, in market.yml) writes `dp.json` to the data branch: DynastyProcess values (FantasyPros expert consensus) joined to Sleeper ids. Free; GPL-3 repo, FantasyPros terms underneath, so revisit before charging.
- App: mapped onto each league shape's market scale by rank. Shown as "Experts' value" in every dynasty player's "Show the math", with how far the market sits from it. Players the market doesn't price get the expert value (tagged "expert value") instead of 0. Redraft leagues: unchanged.
- Not in the price: on 2,890 trades, a 25% blend raised the median gap 15.1% to 16.0%, and expert-market gaps didn't predict market moves (`tools/calibration/dp_eval.py`, `dp_lead.py`).

## V3 command-center look (Nov 23, 2026)
- New default look (`src/ui8.js`, `body.cc`): photographic Milky Way sky (Solar System Scope 8K, from ESO imagery, CC BY 4.0, color-graded; `sky-4k.jpg` / `sky-8k.jpg`, WebGL with a CSS fallback), dark glass, Space Grotesk headlines and Inter body. Settings → Look → Classic (or `?classic`) restores V2.
- Desktop (1100px and up): tool rail on the left with every tool, tool colors and live badges; content centered; side column (1380px and up) with Needs attention, Next lock and your 30-day movers. Phone keeps the dock; the menu gains Managers and Scoring edges.
- **Scoring Edges** (new): per player, how much more or less he scores in each league's rules than standard scoring (vs a typical starter), since trade prices follow standard scoring. Buy (other teams), Hold (yours, underpriced), Sell (yours, overpriced). Build offer / Shop him open the trade builder.
- **Managers** (new): every league-mate from this season's trades in your leagues: trades and last trade, what they buy and sell by value, pricing (median gap at today's values), trade fit 0–100 (35% activity, 30% direction complement, 20% your strength where they buy, 15% recency), and a pitch that opens the trade builder.

## Managers and Scoring Edges on the FFU database (Nov 23, 2026)
- Crawler records each league's roster owners (`trades-db.json` → `owners`, refreshed every two weeks), so trades tie to people across leagues.
- `backend/managers.mjs` (nightly, after the in-house fit) writes `managers.json`: per manager, trades this season across the whole database, leagues, partners, value shares bought and sold by position, and pricing = median gap with each trade valued on its own day's market snapshot (redraft trades count for activity, not pricing).
- Managers view uses those profiles (falls back to the user's own leagues at today's values for anyone not crawled yet). Scoring Edges now subtracts what trades already pay over market (in-house factor): Edge = scores − costs.

## FFU database as a product, part 1 (Nov 23, 2026)
- **Database layer** (`backend/supabase-ffu.sql`, run once in the Supabase SQL editor): `ffu_leagues`, `ffu_trades` (owner per side), `ffu_values` (daily, per asset and shape), `ffu_managers`, `api_keys` (SHA-256 hashes only) and `api_usage`, with `ffu_api_hit()` counting calls against each key's daily limit. Row level security on, no policies: server-only. `backend/db.mjs` upserts through the REST API with `SUPABASE_SECRET_KEY` and is a no-op without it, so files stay the source of truth until cutover.
- **Crawl** now has its own workflow (`crawl.yml`, every 6 hours) with higher caps (500 new users, 1,200 leagues, 800 league-mate lookups, 2,500 owner lookups per run); the nightly job no longer crawls. Both share a queued `data-branch` concurrency group (no more cancelled runs), and every data-branch publisher rebases and retries. Trade database and crawl state are stored gzipped (7MB → 1.2MB). First run with a key backfills every league and trade into the database, then only what changed.
- **Daily FFU values** (`backend/ffu-values.mjs` → `ffu-values.json` and `ffu_values`): market × in-house factor per player and pick, Superflex and 1QB, with expert values for players the market doesn't price (flagged, excluded from the API by default). Reports the share of value backed by 5+ trades (95% on Nov 23). In-house lambda grid extended to 64 (32 now wins).
- **Data API v1** (Vercel functions in `api/`, docs at `/developers.html`): `/api/v1` (status), `/values`, `/players/{id}`, `/managers/{id}`, `/trades?player|owner|league`. Key in `x-api-key`, daily limits, CORS open. Needs `SUPABASE_SECRET_KEY` in Vercel; answers 503 until then.

## FFU Index: values from trades only (Nov 24, 2026)
- `backend/ffu-index.mjs` (nightly, `ffu-index.json`): one value per player and future pick fitted only on real trades in the FFU database, no outside prices. Baseline from facts (position, age, years in the league, NFL draft slot from `player-facts.json`), each asset's own trade evidence on top, a Superflex offset by position; memory window and ridge tuned on a validation slice. Published values lean on the baseline by n/(n+10); players need 3+ trades, picks are future drafts rounds 1–5 with 20+.
- Nightly scorecard on the newest 20% of trades (never fitted), against the market price on the trade's day and against today's FFU values (market × in-house factor). Nov 24 (41,000+ trades, 8,335 held out): market 15.6% / 19.5%, FFU values 14.6% / 18.4%, Index 16.1% / 18.8% (median / mean |gap|). Two milestones tracked: beats market (independence) and beats FFU values (the gate to replace the market anchor). Neither passed yet; the Index already beats the market on the mean.
- Findings: Superflex QBs trade at ×1.22 of 1QB; rank correlation with the market 0.87 (players with 5+ trades). Value trends per player tested and left off (helped held-out trades slightly, hurt validation).
- `dp.mjs` now also writes `player-facts.json` (ids, birthdates, NFL draft slots; facts, no valuations).

## Cleaning: extreme accounts and lopsided trades (Nov 24, 2026)
- `backend/clean.mjs`, applied by the crawl and every valuation job: (1) accounts with trades this season more than 4 robust SDs above the typical manager on a log scale and at least 150 trades are discarded (threshold 244 trades on Nov 24: 17 accounts, 9,821 trades), removed from the trade database and never written to Supabase (deleted if already there), listed in `excluded.json`, sticky once excluded, seed users exempt; (2) remaining heavy traders are weighted down to count like the 99th percentile (75 trades; 102 accounts); (3) lopsided trades (gap over 75% at market, priced on both sides) are left out of fitting and manager pricing (840).
- After cleaning (held out, never fitted): market 15.8% / 18.7%, FFU values 13.6% / 16.9%; Index 16.6% / 18.8% vs market 15.6% / 18.6%.
- Managers view labels excluded league-mates ("left out of FFU values") and uses the user's leagues for them.

## Private data store (Nov 24, 2026)
- The jobs' working files (trade database, crawl state, market snapshots, fits, profiles) moved from the public `data` branch to a private Supabase Storage bucket (`ffu-data`). `backend/store.mjs pull|push` moves only what a job needs and only what changed (sha256 manifest), and refuses to run on an empty store. Crawl, nightly, alerts and calibration all use it; none of them write to git any more.
- The app no longer downloads whole datasets. It reads `/api/app/inhouse`, `/api/app/dp`, `/api/app/market?leagues=…` (only the user's leagues) and `POST /api/app/managers` (only the league-mates on screen), answered from the store and the database, cached at Vercel's edge, site origins only.
- Excluded accounts get a row in `ffu_managers` so the app and partners can see why a busy account has no profile.
- Egress budget (Supabase free tier, 5 GB/month): jobs pull about 45 MB a day (~1.4 GB/month); app reads are mostly served from Vercel's cache.
- Still to do: delete the old public `data` branch (its history still holds the dataset up to Nov 24).

## Partner program (Nov 24, 2026)
- `/developers.html#key`: self-serve key requests (name, email, project, what they'll build; honeypot; 3 per IP per day; one free key per email). The key is shown once and stored only as a SHA-256 hash in `api_keys` (plan `free`, 500/day), switched off until approved: Supabase → Table editor → `api_keys` → set `revoked` to false. Set `PARTNER_SIGNUPS=open` in Vercel to approve automatically.
- Plans on the page: Free (500/day, attribution, non-commercial) and Partner (commercial license, contact). Terms in plain words. `GET /api/v1/usage` shows a key's plan and calls.
- Free keys don't receive raw `market` prices or `factor` (FantasyCalc-derived); `internal`, `partner` and `trial` keys do.

## Live game day and the reactive sky (Nov 24, 2026)
- **Live** (rail and menu): every matchup you're in, with live scores (Sleeper), game clocks (ESPN), projected finals (points so far + each starter's projection × the share of his game left) and win chance (normal model; each starter's remaining points can miss by ~70%). Coin flips first and outlined. Refreshes every minute while games are on; rail badge and a side-panel summary while live; a toast and haptic tap when one of your matchups jumps 6+ points.
- **Reactive sky**: tints warmer as your week goes well and cooler when it doesn't, flares with a meteor on big scoring moments, leans with the pointer or phone tilt and drifts as you scroll. All motion respects reduced-motion settings.

## Polish sweep and home options (Nov 25, 2026)
- **Open in Sleeper:** Sleeper's app only claims `/channels/*`, `/topics/*`, `/topic/*` and `/message/*` (Apple's cached app-site-association, read Nov 25). League pages always open the website, a login wall on phones. Phones and tablets now get `sleeper.com/channels/{league}` (opens the league in the app), computers the team page; Settings → "Open in Sleeper goes to" overrides. The link-test card is gone.
- **Dropdowns, not bubble rows:** `chipSelect()` (src/ui10.js) replaces the home sort and filter, trade partner and position, rankings position, team lanes, Exposure and playoff-odds filters, firing the same action the bubble did.
- **No clipped text** in the next-lock card and rankings rows on phones.
- **Home layouts to try** (Settings → Home layout, or `?home=focus|launcher|hub`): Focus (up next + top 6 tools + teams), Launcher (8 tools with live status first), League hub (every league with Lineup / Trades / Sleeper buttons and search). Tools sort by use on the device; Lineups is pinned first when something must be fixed. Classic stays the default until a pick.
- **Next (pending decision):** Sign in with Sleeper (beta) for lineups, waivers and trades through Sleeper's private GraphQL (`update_matchup_leg`, `submit_waiver_claim`, `propose_trade`), token on the device only, a pass-through relay, preview + confirm + read-back on every move.

## Next up (proposed order)
1. **Payout spots per league** — read payouts from the league's early chat/description, or a per-league override, so bubble risk means "one spot out of the money."
2. **Market data beyond your leagues** — FantasyCalc trade database (needs permission for commercial use) or our own crawl of public Sleeper dynasty leagues for comps.
3. **Trade alerts** — nightly job flags when a league mate's direction flips (contender becomes a seller) and pushes the best offer.
4. **Payments** when opening beyond the control group (accounts are live).

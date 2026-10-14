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

## Accounts (in progress, waiting on Supabase project keys)
- Sign up and sign in with **email or phone number** as the login, plus a password. Phone needs a paid SMS provider (e.g. Twilio, about a cent per text) for verification codes; email works on the free tier.
- **Stay signed in** checkbox (on by default on your own phone): keeps the session on the device; unchecked signs out when the app is closed.
- Forgot password, show/hide password, strength hint.
- Synced per account: Sleeper username, rankings, team directions, done marks, settings. Row-level security so each user only reads and writes their own rows.
- "Take control of your command center" card on Home after the first scan; the app still works without an account.

## Next up (proposed order)
1. **Payout spots per league** — read payouts from the league's early chat/description, or a per-league override, so bubble risk means "one spot out of the money."
2. **Market data beyond your leagues** — FantasyCalc trade database (needs permission for commercial use) or our own crawl of public Sleeper dynasty leagues for comps.
3. **Trade alerts** — nightly job flags when a league mate's direction flips (contender becomes a seller) and pushes the best offer.
4. **Accounts + payments** when opening beyond the control group.

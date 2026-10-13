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

## Next up (proposed order)
1. **Hosting** — put index.html on a URL (GitHub Pages) so it installs to the phone home screen.
2. **Alerts** — small backend job (e.g. Cloudflare Worker / Supabase cron) that runs the same checks Thu 6pm, Sat 9pm, Sun 11am/3pm ET and pushes "these 7 leagues have an OUT starter" notifications.
3. **Waiver assistant** — free agents per league ranked by projection vs your worst starter at each position; flags open roster spots with best pickup.
4. **Trade analyzer + dynasty values** (needs a value source: own model or licensed feed).
5. **League insights** — contender/rebuild status, age curves, positional strength per team.
6. **Accounts + payments** when opening beyond the control group.

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

## Next up (proposed order)
1. **Hosting** — put index.html on a URL (GitHub Pages) so it installs to the phone home screen.
2. **Alerts** — small backend job (e.g. Cloudflare Worker / Supabase cron) that runs the same checks Thu 6pm, Sat 9pm, Sun 11am/3pm ET and pushes "these 7 leagues have an OUT starter" notifications.
3. **Waiver assistant** — free agents per league ranked by projection vs your worst starter at each position; flags open roster spots with best pickup.
4. **Trade analyzer + dynasty values** (needs a value source: own model or licensed feed).
5. **League insights** — contender/rebuild status, age curves, positional strength per team.
6. **Accounts + payments** when opening beyond the control group.

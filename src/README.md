# Source

`index.html` at the repo root is generated. Edit the files here, then rebuild:

    python3 tools/assemble.py

- `head.html`: document head, all CSS, page skeleton
- `engine-v1.html`: the original data engine (lines 348–1774 are kept: lineups, blueprints, sims, trade finder, waivers)
- `ui.js`: views, navigation, render loop, space background and crystal ball
- `ui2.js`: kickoff times, Thursday bulletin, tap feedback, warp transition
- `ui3.js`: Start/sit, Trade and Compare tools
- `ui4.js`: My Rankings and Team review
- `ui5.js`: accounts (Supabase) and sync

Tests (Playwright, all network mocked): serve the repo root on port 8765, then
`node tools/run.js <shots dir>` (full app flow) and `node tools/auth.js <shots dir>` (accounts).

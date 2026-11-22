# Value-model calibration

Re-run these to check or update the numbers in `src/engine-v1.html` (`STUD_P`, `CAL`).

1. Run the "Value-model calibration inputs" workflow (Actions tab), so the data branch has fresh `calib-inputs.json`. `market.json` and `values/` update nightly.
2. `git clone -b data --depth 1 https://github.com/elijahsworllc/fantasyfootballmanager.git data`
3. From the repo root:
   - `python3 tools/calibration/stud_premium.py data`: finds the exponent where the side giving more pieces neither wins nor loses
   - `python3 tools/calibration/scoring_alpha.py data 1.45`: tests pricing league scoring into trade values (strength 0 to 1.5)
   - `python3 tools/calibration/gap_quantiles.py data`: the |gap| percentiles behind "closer to even than N% of trades"

Results on Nov 21, 2026 (771 trades): exponent ≈1.45; scoring strength 0 fits best; median |gap| 19%.

## Second value source: DynastyProcess (Nov 22, 2026)
`dp_eval.py DATA_BRANCH DP_HISTORY_DIR db_playerids.csv` (set `RANK=1` for the rank mapping) and
`dp_lead.py` (same arguments). DP history: partial-clone github.com/dynastyprocess/data and
`git show <sha>:files/values-players.csv` for each weekly commit since Oct 1.

Result on 2,890 dynasty trades since Oct 13 (DP mapped onto the market scale by rank):
| Prices | Median gap | Mean gap |
|---|---|---|
| Market only | 15.1% | 19.6% |
| 25% expert blend | 16.0% | 21.1% |
| 50% expert blend | 18.3% | 23.6% |
| Expert value only | 22.2% | 28.6% |

Expert-vs-market gaps vs the market move over the next 2 to 6 weeks: correlation between -0.11 and +0.02
in six windows; players the experts rated 20%+ higher didn't rise. Decision: DP is a visible second
opinion and the value for players with no market price, never part of the price.

# Value-model calibration

Re-run these to check or update the numbers in `src/engine-v1.html` (`STUD_P`, `CAL`).

1. Run the "Value-model calibration inputs" workflow (Actions tab), so the data branch has fresh `calib-inputs.json`. `market.json` and `values/` update nightly.
2. `git clone -b data --depth 1 https://github.com/elijahsworllc/fantasyfootballmanager.git data`
3. From the repo root:
   - `python3 tools/calibration/stud_premium.py data`: finds the exponent where the side giving more pieces neither wins nor loses
   - `python3 tools/calibration/scoring_alpha.py data 1.45`: tests pricing league scoring into trade values (strength 0 to 1.5)
   - `python3 tools/calibration/gap_quantiles.py data`: the |gap| percentiles behind "closer to even than N% of trades"

Results on Nov 21, 2026 (771 trades): exponent ≈1.45; scoring strength 0 fits best; median |gap| 19%.

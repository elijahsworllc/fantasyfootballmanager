import csv, json, os, sys, math, statistics as st, bisect
D, H, IDS = sys.argv[1:4]; P = 1.45
fp2sl = {r['fantasypros_id']: r['sleeper_id'] for r in csv.DictReader(open(IDS)) if r['fantasypros_id'] not in ('', 'NA') and r['sleeper_id'] not in ('', 'NA')}
dps = {}
for f in sorted(os.listdir(H)):
    dps[f[:10]] = {fp2sl[r['fp_id']]: (float(r['value_1qb']), float(r['value_2qb'])) for r in csv.DictReader(open(os.path.join(H, f))) if r['fp_id'] in fp2sl and r['value_1qb'] not in ('', 'NA')}
def fc(day): return json.load(open(f"{D}/values/{day}.json"))
def rankmap(fcv, dp, j):
    both = [(dp[p][j], v) for p, v in fcv.items() if p in dp and v > 0 and dp[p][j] > 0]
    xs = sorted(x for x, _ in both); ys = sorted(y for _, y in both)
    def f(d):
        i = bisect.bisect_left(xs, d)
        if i <= 0: return ys[0] * d / xs[0]
        if i >= len(xs): return ys[-1] * d / xs[-1]
        t = (d - xs[i-1]) / (xs[i] - xs[i-1] or 1); return ys[i-1] + t * (ys[i] - ys[i-1])
    return f
# (2) lead test: expert/market ratio on the start day vs market change to the end day
for start, dday, end in [("2026-10-13", "2026-10-09", "2026-11-20"), ("2026-10-23", "2026-10-23", "2026-11-20"), ("2026-11-06", "2026-11-06", "2026-11-22")]:
    a, b = fc(start), fc(end)
    for shape, j in [("sf", 1), ("oneqb", 0)]:
        f = rankmap(a[shape], dps[dday], j); pts = []
        for p, v in a[shape].items():
            if p.startswith("FP_") or v < 1500 or p not in dps[dday] or not b[shape].get(p): continue
            gap = math.log(f(dps[dday][p][j]) / v); chg = math.log(b[shape][p] / v); pts.append((gap, chg))
        g = [x for x, _ in pts]; c = [y for _, y in pts]
        hi = [y for x, y in pts if x > .2]; lo = [y for x, y in pts if x < -.2]; mid = [y for x, y in pts if abs(x) <= .2]
        print(f"{start}->{end} {shape:5s} n={len(pts)} corr(expert gap, later market move)={st.correlation(g, c):+.3f} | experts >20% higher: n={len(hi)} median move {st.median(hi)*100:+.1f}% | within 20%: {st.median(mid)*100:+.1f}% | experts >20% lower: n={len(lo)} {st.median(lo)*100:+.1f}%")

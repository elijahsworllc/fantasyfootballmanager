# Does DynastyProcess (expert consensus) add information beyond the market price, judged by real trades?
import csv, json, os, sys, math, statistics as st, bisect
D = sys.argv[1]; H = sys.argv[2]; IDS = sys.argv[3]
P = 1.45
fp2sl = {}
for r in csv.DictReader(open(IDS)):
    if r['fantasypros_id'] not in ('', 'NA') and r['sleeper_id'] not in ('', 'NA'): fp2sl[r['fantasypros_id']] = r['sleeper_id']
dps = {}
for f in sorted(os.listdir(H)):
    m = {}
    for r in csv.DictReader(open(os.path.join(H, f))):
        sl = fp2sl.get(r['fp_id'])
        if sl and r['value_1qb'] not in ('', 'NA'): m[sl] = (float(r['value_1qb']), float(r['value_2qb']))
    dps[f[:10]] = m
dpdays = sorted(dps)
snapf = sorted(x for x in os.listdir(D + '/values') if x.endswith('.json')); snapdays = [x[:10] for x in snapf]; cache = {}
def snap(day):
    i = max(0, bisect.bisect_right(snapdays, day) - 1)
    if i not in cache: cache[i] = json.load(open(f"{D}/values/{snapf[i]}"))
    return cache[i], snapdays[i]
def dpfor(day):
    i = max(0, bisect.bisect_right(dpdays, day) - 1); return dps[dpdays[i]]
maps = {}
def mapping(fday, dday, shape):   # log FC = a + b log DP on players priced by both
    k = (fday, dday, shape)
    if k in maps: return maps[k]
    fc = cache_snap[fday][shape]; dp = dps[dday]; j = 1 if shape == 'sf' else 0
    xs, ys = [], []
    for pid, v in fc.items():
        if pid in dp and v > 0 and dp[pid][j] > 0: xs.append(math.log(dp[pid][j])); ys.append(math.log(v))
    mx, my = st.mean(xs), st.mean(ys); b = sum((x-mx)*(y-my) for x, y in zip(xs, ys)) / sum((x-mx)**2 for x in xs); a = my - b*mx
    r = st.correlation(xs, ys); maps[k] = (a, b, r, len(xs)); return maps[k]
cache_snap = {}
_rm = {}
def RM(fday, dday, shape):
    k = (fday, dday, shape)
    if k not in _rm:
        j = 1 if shape == 'sf' else 0; fcv = cache_snap[fday][shape]; dp = dps[dday]
        both = [(dp[p][j], v) for p, v in fcv.items() if p in dp and v > 0 and dp[p][j] > 0]
        xs = sorted(x for x, _ in both); ys = sorted(y for _, y in both)
        def f(d, xs=xs, ys=ys):
            i = bisect.bisect_left(xs, d)
            if i <= 0: return ys[0] * d / xs[0]
            if i >= len(xs): return ys[-1] * d / xs[-1]
            t = (d - xs[i-1]) / (xs[i] - xs[i-1] or 1); return ys[i-1] + t * (ys[i] - ys[i-1])
        _rm[k] = f
    return _rm[k]
mk = json.load(open(D + '/market.json')); cr = json.load(open(D + '/trades-db.json'))
shapes = {**cr['leagues'], **mk['leagues']}; seen = {}
for t in mk['tx'] + cr['trades']:
    if t.get('type') == 'trade' and t['id'] not in seen: seen[t['id']] = t
import datetime
rows = []
for t in seen.values():
    if not t.get('rids') or len(t['rids']) != 2: continue
    meta = shapes.get(t['lid'], {})
    if meta.get('type') == 0: continue
    shape = 'sf' if meta.get('qbs') == 2 else 'oneqb'; j = 1 if shape == 'sf' else 0
    day = datetime.datetime.fromtimestamp(t['ts']/1000, datetime.UTC).strftime('%Y-%m-%d')
    if day < '2026-10-13': continue
    s, fday = snap(day); cache_snap[fday] = s; vals = s[shape]
    dday = dpdays[max(0, bisect.bisect_right(dpdays, day) - 1)]; dp = dps[dday]
    a, b, r, n = mapping(fday, dday, shape)
    floor = min(v for v in vals.values() if v > 0) * 0.5
    sides = {t['rids'][0]: [], t['rids'][1]: []}
    for pid, rid in (t.get('adds') or {}).items():
        if rid not in sides: continue
        fc = vals.get(pid, 0); d = dp.get(pid, (0, 0))[j]; dm = (RM(fday, dday, shape)(d) if os.environ.get('RANK') else math.exp(a + b*math.log(d))) if d > 0 else 0
        sides[rid].append((fc, dm))
    for pk in t.get('picks') or []:
        if pk['to'] in sides: v = vals.get(f"FP_{pk['season']}_{pk['round']}", 0); sides[pk['to']].append((v, 0))
    A, B = sides[t['rids'][0]], sides[t['rids'][1]]
    if not A or not B or not any(x[0] > 0 for x in A) or not any(x[0] > 0 for x in B): continue
    rows.append((day, A, B, floor))
def pm(S): return sum(v**P for v in S) ** (1/P)
def gap(A, B): x, y = pm(A), pm(B); return abs(x-y)/max(x, y)
def price(x, w, floor, dpfloor):
    fc, dm = x
    if fc > 0 and dm > 0: return math.exp((1-w)*math.log(fc) + w*math.log(dm))
    if fc > 0: return fc
    if dpfloor and dm > 0: return min(dm, max(floor*2, dm))   # unpriced by the market: expert value instead of a floor
    return floor
print("trades since Oct 13:", len(rows))
print("DP→FC scale fits (shape, FC day, DP day, slope, corr, n), sample:")
for k, v in list(maps.items())[:4]: print("  ", k, [round(z, 3) for z in v[:3]], v[3])
touched = [r for r in rows if any(x[1] > 0 for x in r[1] + r[2])]
print("trades with a DP-priced player:", len(touched))
for label, w, df in [("market only", 0, False), ("market, DP for unpriced", 0, True), ("blend 25% DP", .25, True), ("blend 50% DP", .5, True), ("DP only where both", 1, True)]:
    g = [gap([price(x, w, fl, df) for x in A], [price(x, w, fl, df) for x in B]) for _, A, B, fl in rows]
    q = st.quantiles(g, n=4)
    print(f"{label:26s} median {st.median(g):.4f}  mean {st.mean(g):.4f}  p25 {q[0]:.4f}  p75 {q[2]:.4f}")
# unpriced-by-market players that DP knows: how often, and does DP floor help on just those trades
unp = [r for r in rows if any(x[0] == 0 and x[1] > 0 for x in r[1] + r[2])]
for label, df in [("floor", False), ("DP value", True)]:
    g = [gap([price(x, 0, fl, df) for x in A], [price(x, 0, fl, df) for x in B]) for _, A, B, fl in unp]
    print(f"trades with a market-unpriced player DP knows ({len(unp)}): {label:9s} median {st.median(g):.4f} mean {st.mean(g):.4f}")

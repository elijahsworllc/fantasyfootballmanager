import json, glob, os, bisect, statistics as stt, sys
D = sys.argv[1]
m = json.load(open(f"{D}/market.json"))
snaps = sorted(glob.glob(f"{D}/values/*.json")); days = [os.path.basename(s)[:10] for s in snaps]
cache = {}
def snap_for(ts):
    import datetime
    d = datetime.datetime.utcfromtimestamp(ts/1000).strftime("%Y-%m-%d")
    i = max(0, bisect.bisect_right(days, d) - 1)
    if i not in cache: cache[i] = json.load(open(snaps[i]))
    return cache[i], days[i] <= d
POS = {}  # player positions from the market meta aren't stored; infer from a players dump if present
trades = [t for t in m["tx"] if t["type"] == "trade" and len(t["rids"]) == 2]
rows = []
for t in trades:
    meta = m["leagues"].get(t["lid"], {}); s, dated = snap_for(t["ts"]); vals = s["sf" if meta.get("qbs") == 2 else "oneqb"]
    side = {r: [] for r in t["rids"]}
    for pid, r in t["adds"].items():
        if r in side: side[r].append(("P", pid, vals.get(pid, 0)))
    for p in t["picks"]:
        if p["to"] in side: side[p["to"]].append(("K", f'{p["season"]}-{p["round"]}', vals.get(f'FP_{p["season"]}_{p["round"]}', 0)))
    a, b = t["rids"]
    rows.append({"lid": t["lid"], "tep": meta.get("tep", 0), "A": side[a], "B": side[b], "dated": dated, "ts": t["ts"]})
def pm(xs, p): return sum(max(v, 0)**p for v in xs)**(1/p) if xs else 0
def gap(A, B, p):
    va, vb = pm(A, p), pm(B, p); return (va - vb)/max(va, vb, 1)
usable = [r for r in rows if sum(x[2] for x in r["A"]) > 0 and sum(x[2] for x in r["B"]) > 0]
dated = [r for r in usable if r["dated"]]
print(f"trades: {len(trades)} two-team, {len(usable)} with market values on both sides, {len(dated)} on/after first snapshot ({days[0]})")
# 1) stud premium: in uneven-count trades, the side with more pieces should not systematically win or lose
def more_side_gap(r, p):
    A = [x[2] for x in r["A"]]; B = [x[2] for x in r["B"]]
    if len(A) == len(B): return None
    if len(A) > len(B): return gap(A, B, p)
    return gap(B, A, p)
uneven = [r for r in usable if len(r["A"]) != len(r["B"])]
print(f"\n1) Stud premium (exponent p) on {len(uneven)} uneven trades, median gap of the side with MORE pieces (0 = calibrated):")
best = None
for p10 in range(10, 26):
    p = p10/10; g = [more_side_gap(r, p) for r in uneven]; g = [x for x in g if x is not None and abs(x) < 0.6]
    med = stt.median(g); mae = stt.mean(abs(x) for x in g)
    print(f"   p={p:.1f}  median {med:+.3f}  mean|gap| {mae:.3f}  n={len(g)}" + ("   <- current" if p10 == 13 else ""))
    if best is None or abs(med) < abs(best[1]): best = (p, med)
print(f"   best p ≈ {best[0]}")
# 2) how even real trades are (sets verdict thresholds)
p = best[0]
g = sorted(abs(gap([x[2] for x in r["A"]], [x[2] for x in r["B"]], p)) for r in usable)
q = lambda f: g[min(len(g)-1, int(f*len(g)))]
print(f"\n2) |gap| across {len(g)} real trades at p={p}: 25th pct {q(.25):.3f}, median {q(.5):.3f}, 75th {q(.75):.3f}, 90th {q(.9):.3f}")
for lim in (0.05, 0.10, 0.15, 0.20, 0.30):
    print(f"   within ±{int(lim*100)}%: {sum(1 for x in g if x <= lim)/len(g):.0%}")
json.dump({"best_p": best[0], "gap_pct": {"p25": q(.25), "p50": q(.5), "p75": q(.75), "p90": q(.9)}}, open("result.json", "w"))

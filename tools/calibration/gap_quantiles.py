import json, sys
sys.argv = ["", sys.argv[1], "1.45"]
exec(open("tools/calibration/scoring_alpha.py").read().split('P = float')[0])
g = sorted(abs(gap([x[0] for x in A], [x[0] for x in B], 1.45)) for A, B in rows)
qs = [round(g[min(len(g)-1, int(k/20*len(g)))], 4) for k in range(21)]
print(json.dumps({"n": len(g), "q": qs}))

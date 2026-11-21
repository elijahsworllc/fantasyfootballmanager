import json, glob, os, bisect, datetime, re, statistics as stt, sys
D = sys.argv[1]
m = json.load(open(f"{D}/market.json")); c = json.load(open(f"{D}/calib-inputs.json"))
snaps = sorted(glob.glob(f"{D}/values/*.json")); days = [os.path.basename(s)[:10] for s in snaps]; cache = {}
def snap_for(ts):
    d = datetime.datetime.fromtimestamp(ts/1000, datetime.UTC).strftime("%Y-%m-%d"); i = max(0, bisect.bisect_right(days, d) - 1)
    if i not in cache: cache[i] = json.load(open(snaps[i]))
    return cache[i]
pos = {}
for k in ("sf", "oneqb"):
    for x in c["fc"].get(k, []): pos[str(x["id"])] = x["pos"]
SP = c["seasonProj"]
SKIP = re.compile(r"^(adp_|pos_adp_|pts_std$|pts_ppr$|pts_half_ppr$|gp$|cmp_pct$|rec_tgt$)")
def score(stats, sc, p):
    t = sum(w*stats[k] for k, w in sc.items() if w and k in stats and not SKIP.match(k))
    rec = stats.get("rec", 0)
    for P, key in (("TE","bonus_rec_te"),("WR","bonus_rec_wr"),("RB","bonus_rec_rb")):
        if p == P and sc.get(key) and key not in stats: t += sc[key]*rec
    return t
def base(ppr): return {"pass_yd":0.04,"pass_td":4,"pass_int":-1,"pass_2pt":2,"rush_yd":0.1,"rush_td":6,"rush_2pt":2,"rec":ppr,"rec_yd":0.1,"rec_td":6,"rec_2pt":2,"fum_lost":-2}
REL = {}
def rel_table(lid):
    if lid in REL: return REL[lid]
    L = c["leagues"].get(lid); sc = L["sc"]; ppr = min([0,0.5,1], key=lambda x: abs(x-(sc.get("rec") or 0))); b = base(ppr)
    raw = {}
    for pid, e in SP.items():
        p = e["pos"]
        if p not in ("QB","RB","WR","TE"): continue
        Bv = score(e["stats"], b, p)
        if Bv >= 40: raw[pid] = (score(e["stats"], sc, p)/Bv, Bv)
    typ = stt.median([r for r, Bv in raw.values() if Bv >= 120]) if raw else 1
    posr = {}
    for P in ("QB","RB","WR","TE"):
        a = [r for pid,(r,Bv) in raw.items() if SP[pid]["pos"] == P]; posr[P] = stt.median(a)/typ if a else 1
    REL[lid] = ({pid: r/typ for pid,(r,Bv) in raw.items()}, posr); return REL[lid]
def pm(xs, p): return sum(max(v,0)**p for v in xs)**(1/p) if xs else 0
def gap(A, B, p): va, vb = pm(A,p), pm(B,p); return (va-vb)/max(va,vb,1)
trades = [t for t in m["tx"] if t["type"]=="trade" and len(t["rids"])==2 and t["lid"] in c["leagues"]]
rows = []
for t in trades:
    meta = m["leagues"].get(t["lid"], {}); vals = snap_for(t["ts"])["sf" if meta.get("qbs")==2 else "oneqb"]
    rel, posr = rel_table(t["lid"]); side = {r: [] for r in t["rids"]}
    for pid, r in t["adds"].items():
        if r in side: side[r].append((vals.get(pid,0), rel.get(pid, posr.get(pos.get(pid), 1)), pos.get(pid)))
    for pk in t["picks"]:
        if pk["to"] in side: side[pk["to"]].append((vals.get(f'FP_{pk["season"]}_{pk["round"]}',0), 1.0, "PICK"))
    a, b = t["rids"]
    if sum(x[0] for x in side[a]) > 0 and sum(x[0] for x in side[b]) > 0: rows.append((side[a], side[b]))
P = float(sys.argv[2]) if len(sys.argv) > 2 else 1.45
clamp = lambda x: max(0.75, min(1.35, x))
def adj(side, al): return [v*clamp(1+al*(r-1)) for v, r, _ in side]
print(f"{len(rows)} trades with values on both sides, stud premium p={P}")
print("alpha  mean|gap|  median|gap|   TE-side median signed gap (n)")
te_rows = [(A,B) if any(x[2]=="TE" for x in A) and not any(x[2]=="TE" for x in B) else (B,A) for A,B in rows if any(x[2]=="TE" for x in A) != any(x[2]=="TE" for x in B)]
res = []
for a10 in range(0, 16):
    al = a10/10
    g = [abs(gap(adj(A,al), adj(B,al), P)) for A,B in rows]; g = [x for x in g if x < 0.6]
    tg = [gap(adj(T,al), adj(O,al), P) for T,O in te_rows]; tg = [x for x in tg if abs(x) < 0.6]
    res.append((al, stt.mean(g), stt.median(g), stt.median(tg)))
    print(f" {al:.1f}    {stt.mean(g):.4f}    {stt.median(g):.4f}       {stt.median(tg):+.3f} ({len(tg)})" + ("   <- live now" if a10 == 5 else ""))
b1 = min(res, key=lambda x: x[1]); b2 = min(res, key=lambda x: abs(x[3]))
print(f"best alpha by overall fit: {b1[0]}, by TE-side balance: {b2[0]}")
# typical multipliers at the chosen alpha, for the write-up
al = b2[0]; ex = {}
for lid, L in list(c["leagues"].items()):
    if L["type"] != 2: continue
    rel, posr = rel_table(lid); ex.setdefault((L["sc"].get("bonus_rec_te",0), L["sc"].get("pass_td",4)), posr)
print("position multipliers (TEP, pass TD) -> QB RB WR TE at alpha", al)
for k, pr in sorted(ex.items()): print("  ", k, " ".join(f"{P2}:{clamp(1+al*(pr[P2]-1)):.2f}" for P2 in ("QB","RB","WR","TE")))

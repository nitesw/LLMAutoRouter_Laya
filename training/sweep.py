"""Escalation sweep: cheapest tier whose cumulative P(enough) >= c. none is merged into haiku (never skip the LLM)."""
import csv, json, os, laya
rows = list(csv.DictReader(open("data/test.csv")))
LV = {"none": 0, "haiku": 0, "sonnet": 1, "opus": 2}; NAMES = ["haiku", "sonnet", "opus"]
def probs(ck):
    f = f"data/test_probs_{os.path.basename(ck)}.json"
    if os.path.exists(f): return json.load(open(f))
    a = laya.load(ck); q = json.load(open(f"{ck}/questions.json"))
    out = [a.predict(r["text"], q)["answers"]["label"]["probabilities"] for r in rows]
    json.dump(out, open(f, "w")); return out
P1, P2 = probs("checkpoints/router-v1"), probs("checkpoints/router-v2")
def tri(p): return [p["none"] + p["haiku"], p["sonnet"], p["opus"]]
def avg(a, b): return {k: (a[k] + b[k]) / 2 for k in a}
truth = [LV[r["tier"]] for r in rows]; n = len(rows); n_op = sum(t == 2 for t in truth)
W = [1, 4, 20]  # illustrative relative cost: haiku 1, sonnet 4, opus 20
def run(name, plist):
    print(f"\n{name}\n{'c':>5} {'->opus':>7} {'->sonnet':>9} {'->haiku':>8} {'too weak':>9} {'opus found':>11} {'cost vs all-opus':>17}")
    for c in [None, 0.5, 0.6, 0.7, 0.8, 0.9]:
        pred = []
        for p in plist:
            t = tri(p)
            if c is None: pred.append(max(range(3), key=lambda i: t[i])); continue
            cum, k = 0, 2
            for i in range(3):
                cum += t[i]
                if cum >= c: k = i; break
            pred.append(k)
        cnt = [pred.count(i) for i in range(3)]
        weak = sum(p < t for p, t in zip(pred, truth))
        found = sum(p == 2 and t == 2 for p, t in zip(pred, truth))
        cost = sum(W[p] for p in pred) / (20 * n)
        print(f"{'argmax' if c is None else c:>5} {cnt[2]/n:>7.0%} {cnt[1]/n:>9.0%} {cnt[0]/n:>8.0%} {weak/n:>9.1%} {found:>6}/{n_op:<4} {cost:>16.0%}")
run("v1", P1); run("v2", P2); run("ensemble v1+v2 (avg probabilities)", [avg(a, b) for a, b in zip(P1, P2)])
print(f"\nbaselines: always-sonnet too weak {sum(t>1 for t in truth)/n:.1%}, cost {4/20:.0%}; always-opus too weak 0%, cost 100%")

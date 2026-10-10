"""Export probability vectors (no prompt text) + the tier training/sweep.py's rule picks, for the TS parity test."""
import json, sys
C = float(sys.argv[1]) if len(sys.argv) > 1 else 0.9
NAMES = ["haiku", "sonnet", "opus"]
rows = []
for p in json.load(open("data/test_probs_router-v1.json")):
    tri, cum, k = [p["none"] + p["haiku"], p["sonnet"], p["opus"]], 0, 2
    for i in range(3):
        cum += tri[i]
        if cum >= C: k = i; break
    rows.append({"probs": p, "tier": NAMES[k]})
json.dump({"threshold": C, "rows": rows}, open("proxy/test/fixtures/policy.json", "w"))
print(len(rows), "rows")

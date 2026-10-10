"""Attach restyled prompts to the synthetic set; check coverage; write data/syn_restyled.jsonl"""
import json, glob
from collections import Counter
allrows = {o["id"]: o for o in json.load(open("data/restyle/all.json"))}
new = {}
for f in sorted(glob.glob("data/restyle/out_*.txt")):
    for line in open(f):
        line = line.rstrip("\n")
        if not line: continue
        i, _, text = line.partition("|")
        assert i in allrows, i
        new[i] = text.strip()
missing = set(allrows) - set(new)
print("restyled", len(new), "of", len(allrows), "missing", len(missing), sorted(missing)[:10])
NO_PREV = {"b268", "b179"}  # restyled prompt already contains its context
out = []
for i, o in allrows.items():
    if i not in new: continue
    prev = "" if i in NO_PREV else o["prev"]
    out.append({"id": i, "prev": prev, "prompt": new[i], "tier": o["tier"]})
with open("data/syn_restyled.jsonl", "w") as f:
    for o in out: f.write(json.dumps(o, ensure_ascii=False) + "\n")
changed = sum(1 for o in out if o["prompt"].strip().lower() != allrows[o["id"]]["prompt"].strip().lower())
print("rows changed vs original:", changed, Counter(o["tier"] for o in out))

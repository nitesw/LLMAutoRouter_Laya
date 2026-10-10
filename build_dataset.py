"""Merge real + synthetic prompts into train/test CSVs (stratified 80/20, test = real prompts only)."""
import json, glob, random, csv
random.seed(0)
prompts = {r["id"]: r for r in map(json.loads, open("data/prompts.jsonl"))}
real = []
for f in sorted(glob.glob("data/labels/*.jsonl")):
    for l in map(json.loads, open(f)):
        real.append({**prompts[l["id"]], "tier": l["tier"], "src": "real"})
synth = [{**r, "src": "synthetic"} for r in map(json.loads, open("data/synthetic.jsonl"))]
train, test = [], []
for tier in ["none", "haiku", "sonnet", "opus"]:
    rows = [r for r in real if r["tier"] == tier]
    random.shuffle(rows)
    k = max(5, len(rows) // 5)
    test += rows[:k]; train += rows[k:]
train += synth
random.shuffle(train)
def text(r):  # what the router sees: previous turn as context + the prompt
    return (f"[previous: {r['prev'][:200]}]\n" if r["prev"] else "") + r["prompt"]
for name, rows in [("train", train), ("test", test)]:
    with open(f"data/{name}.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["text", "tier", "src"])
        for r in rows: w.writerow([text(r), r["tier"], r["src"]])
from collections import Counter
print("train", len(train), Counter(r["tier"] for r in train))
print("test ", len(test), Counter(r["tier"] for r in test))

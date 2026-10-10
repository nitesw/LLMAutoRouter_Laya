"""Export dashboard feedback (logs/feedback.jsonl, latest click per prompt) -> data/feedback.csv (text,tier) for retraining; rows tagged cant-tell or cancelled are skipped."""
import csv, json, os
latest = {}
if os.path.exists("logs/feedback.jsonl"):
    for line in open("logs/feedback.jsonl"):
        f = json.loads(line)
        latest[f["id"]] = f
rows = [(f["state"], f["tier"]) for f in latest.values() if f.get("state") and f.get("tier") and not {"cant-tell", "cancelled"} & set(f.get("tags", []))]
os.makedirs("data", exist_ok=True)
with open("data/feedback.csv", "w", newline="") as fh:
    w = csv.writer(fh); w.writerow(["text", "tier"]); w.writerows(rows)
from collections import Counter
print(len(rows), "labeled prompts", dict(Counter(t for _, t in rows)), "-> data/feedback.csv")

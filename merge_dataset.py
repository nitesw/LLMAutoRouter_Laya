"""v3 = cleaned real prompts + restyled synthetic -> kaggle/train_clean.csv. Test set untouched."""
import csv, json, re, statistics as st
from collections import Counter
key = lambda p: re.sub(r"\W+", " ", p).strip().lower()
body = lambda t: t.split("]\n")[-1] if t.startswith("[previous:") else t
test = {key(body(r["text"])) for r in csv.DictReader(open("data/test.csv"))}
orig_syn = {key(json.loads(l)["prompt"][:300]) for l in open("data/synthetic.jsonl")}
real = [(r["text"], r["tier"]) for r in csv.DictReader(open("data/train_clean_v1.csv")) if key(body(r["text"])) not in orig_syn]
rows, seen = list(real), {key(body(t)) for t, _ in real}
n_syn = 0
for l in open("data/syn_restyled.jsonl"):
    o = json.loads(l); k = key(o["prompt"])
    if k in test: continue
    text = (f"[previous: {o['prev'][:120]}]\n" if o["prev"] else "") + o["prompt"][:300]
    rows.append((text, o["tier"])); n_syn += 1
import random; random.seed(0); random.shuffle(rows)
with open("kaggle/train_clean.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["text", "tier"]); w.writerows(rows)
print("real", len(real), "synthetic", n_syn, "total", len(rows), dict(Counter(t for _, t in rows)))
def style(label, texts):
    b = [body(t) for t in texts]
    print(f"{label:10} median {st.median(len(x) for x in b):.0f} chars | lowercase-start {100*sum(x[:1].islower() for x in b)/len(b):.0f}% | no end punct {100*sum(x.strip()[-1:] not in '.?!' for x in b)/len(b):.0f}%")
style("your real", [t for t, _ in real]); style("restyled", [t for t, _ in rows[:0]] or [json.loads(l)["prompt"] for l in open("data/syn_restyled.jsonl")])
style("old synth", [json.loads(l)["prompt"] for l in open("data/syn_a.jsonl")])

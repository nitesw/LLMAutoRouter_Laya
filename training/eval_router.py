"""Evaluate a Laya checkpoint on data/test.csv. Usage: eval_router.py [checkpoint_dir]"""
import sys, csv, json, time
from collections import Counter
import laya

TIERS = ["none", "haiku", "sonnet", "opus"]
QUESTION = {"label": {"type": "choice",
    "instructions": "Which AI model tier is needed to handle this coding-agent request well?",
    "criteria": {
        "none": "trivial acknowledgement, yes/continue, thanks, or pick-one decision needing no reasoning",
        "haiku": "small mechanical task: rename, format, quick question, short error, run a command",
        "sonnet": "standard dev work: implement a feature, write tests, fix a clear bug, refactor",
        "opus": "hard: architecture, subtle multi-file debugging, security, migrations, design trade-offs"}}}

ckpt = sys.argv[1] if len(sys.argv) > 1 else None
if ckpt:
    agent = laya.load(ckpt)
    q = json.load(open(f"{ckpt}/questions.json"))
else:
    agent, q = laya.Router(), QUESTION
qid = next(iter(q))
rows = list(csv.DictReader(open("data/test.csv")))
conf, ms = Counter(), []
for r in rows:
    t = time.perf_counter()
    got = agent.predict(r["text"], q)["answers"][qid]["choice"]
    ms.append((time.perf_counter() - t) * 1000)
    conf[(r["tier"], got)] += 1
n = len(rows)
exact = sum(v for (e, g), v in conf.items() if e == g)
near = sum(v for (e, g), v in conf.items() if abs(TIERS.index(e) - TIERS.index(g)) <= 1)
under = sum(v for (e, g), v in conf.items() if TIERS.index(g) < TIERS.index(e))
print(f"checkpoint: {ckpt or 'base (zero-shot)'}   n={n}   median {sorted(ms)[n//2]:.0f} ms")
print(f"exact {exact/n:.1%}   within-one-tier {near/n:.1%}   under-routed (too weak) {under/n:.1%}")
print("\nexpected \\ got " + "".join(f"{t:>8}" for t in TIERS))
for e in TIERS:
    print(f"{e:15}" + "".join(f"{conf[(e, g)]:>8}" for g in TIERS))

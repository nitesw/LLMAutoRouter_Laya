"""Phase 1 check: sidecar probabilities match laya.load() and latency is acceptable."""
import csv, json, statistics, time, urllib.request
import laya

CKPT = "checkpoints/router-v1"
URL = "http://127.0.0.1:8765/v1/systemone"
questions = json.load(open(f"{CKPT}/questions.json"))
agent = laya.load(CKPT)
rows = list(csv.DictReader(open("data/test.csv")))[:20]

def remote(text):
    body = json.dumps({"model": "router", "state": text, "questions": questions}).encode()
    req = urllib.request.Request(URL, body, {"content-type": "application/json"})
    t = time.perf_counter()
    out = json.load(urllib.request.urlopen(req, timeout=10))
    return out["answers"]["label"]["probabilities"], (time.perf_counter() - t) * 1000

remote("warmup")
worst, ms = 0.0, []
for r in rows:
    local = agent.predict(r["text"], questions)["answers"]["label"]["probabilities"]
    probs, dt = remote(r["text"])
    ms.append(dt)
    worst = max(worst, max(abs(local[k] - probs[k]) for k in local))
ms.sort()
print(f"max prob diff {worst:.2e} ({'OK' if worst < 1e-3 else 'MISMATCH'})   p50 {statistics.median(ms):.0f} ms   p95 {ms[int(len(ms) * .95) - 1]:.0f} ms")

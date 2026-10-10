import json, laya
ck = "checkpoints/router-v1"; a = laya.load(ck); q = json.load(open(f"{ck}/questions.json"))
tests = ["route this through opus", "use opus for this one", "!opus rename the variable x to count", "send this to opus please",
         "use haiku, it's easy", "just use sonnet", "opus: fix the typo in the readme", "rename the variable x to count",
         "think really hard about this one: fix the typo in the readme"]
for t in tests:
    p = a.predict(t, q)["answers"]["label"]["probabilities"]
    tri = [p["none"] + p["haiku"], p["sonnet"], p["opus"]]
    cum, k = 0, 2
    for i in range(3):
        cum += tri[i]
        if cum >= 0.9: k = i; break
    print(f"{['haiku','sonnet','opus'][k]:7} P(opus)={p['opus']:.2f}  {t}")

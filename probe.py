import json, laya
a = laya.load("checkpoints/router-v2"); q = json.load(open("checkpoints/router-v2/questions.json"))
r = a.predict("fix the typo in the readme", q)
print(json.dumps(r["answers"], indent=1)[:900])

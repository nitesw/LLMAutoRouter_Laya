"""Extract real Claude Code prompts from ~/.claude/history.jsonl into data/prompts.jsonl."""
import json, os, re
rows = [json.loads(l) for l in open(os.path.expanduser("~/.claude/history.jsonl"))]
rows.sort(key=lambda r: r.get("timestamp", 0))
out, seen, prev = [], set(), {}
for r in rows:
    text = r.get("display", "")
    for k, v in (r.get("pastedContents") or {}).items():
        content = v.get("content") if isinstance(v, dict) else None
        if content:
            text = re.sub(r"\[Pasted text #%s[^\]]*\]" % k, content, text)
    text = text.strip()
    sid = r.get("sessionId")
    if not text or text.startswith("/") or len(text) < 2 or text in seen:
        prev[sid] = text or prev.get(sid, "")
        continue
    seen.add(text)
    out.append({"id": len(out), "project": os.path.basename(r.get("project", "")),
                "prev": prev.get(sid, "")[:300], "prompt": text[:2000]})
    prev[sid] = text
with open("data/prompts.jsonl", "w") as f:
    for o in out: f.write(json.dumps(o, ensure_ascii=False) + "\n")
for i in range(0, len(out), 150):
    with open(f"data/batches/batch_{i//150:02d}.jsonl", "w") as f:
        for o in out[i:i+150]: f.write(json.dumps(o, ensure_ascii=False) + "\n")
print(len(out), "prompts")

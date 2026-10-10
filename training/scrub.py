"""Strict scrub: train.csv -> kaggle/train_clean.csv. Real prompts only get redacted; synthetic pass through."""
import csv, re
KEEP = set("""API URL HTTP HTTPS JSON CSS SVG PDF HTML SQL CLI CPU GPU LLM MCP PR UI UX CORS OAuth REST GET POST PUT DELETE PATCH
React Python TypeScript JavaScript Swift SwiftUI Docker Postgres PostgreSQL MySQL GitHub Git Bun Node Elysia ElysiaJS Laravel Angular Vue
Next Tailwind Xcode macOS iOS iPhone Mac Linux Windows Android Chrome Safari Firefox Claude Opus Sonnet Haiku Ollama Playwright Supabase
Cloudflare AWS Google Apple Docker Kubernetes Redis Prisma GSAP OK Okay Yes No The And But This That What How Can Please Image Pasted""".split())
SENSITIVE_ROW = re.compile(r"(?i)private key|openssh|password|passwd|secret|token|credential|iban|\bpin\b|ssn|bearer|api[_ -]?key|\.env\b|login|invoice|salary|nda\b|confidential")
SUBS = [
 ("KEY",   r"\b(?:sk|pk|rk|ghp|gho|xox[bpas]|AKIA|AIza|eyJ)[A-Za-z0-9_\-\.]{12,}"),
 ("EMAIL", r"[\w.+-]+@[\w-]+(?:\.[\w.-]+)?"),
 ("URL",   r"https?://\S+|www\.\S+"),
 ("DOMAIN",r"\b[\w-]+(?:\.[\w-]+)*\.(?:com|be|nl|io|app|dev|org|net|eu|co|fr|pl|ua|ru|de)\b"),
 ("BUNDLE",r"\b[a-zA-Z]+(?:\.[a-zA-Z0-9_-]+){2,}\b"),
 ("REF",   r"@[\w.\-]+(?:/[\w.\-]*)*"),
 ("PATH",  r"(?:~|\.{0,2})/[\w.\-@]+(?:/[\w.\-@]+)+/?|/Users/\S+|/Volumes/\S+"),
 ("IP",    r"\b\d{1,3}(?:\.\d{1,3}){3}\b"),
 ("HEX",   r"\b[A-Fa-f0-9]{16,}\b"),
 ("NUM",   r"\d[\d\s\-\.,]{4,}\d|\b\d{4,}\b"),
]
NAME = re.compile(r"\b([A-Z][a-z]+[A-Z]\w*|[a-z]+[A-Z]\w*|[A-Z][A-Za-z0-9]{2,})\b")
# Private names live in a git-ignored file so they never reach the repo.
BLOCK = re.compile("(?i)" + "|".join(l.strip() for l in open("data/private_blocklist.txt") if l.strip() and not l.startswith("#")))
def redact(t):
    t = BLOCK.sub('<NAME>', t)
    for k, p in SUBS: t = re.sub(p, f"<{k}>", t)
    def name(m):
        w = m.group(1)
        if w in KEEP or w.isupper() and len(w) <= 5: return w
        # sentence-initial plain capitalized words are fine (e.g. "Fix", "Add")
        if re.fullmatch(r"[A-Z][a-z]+", w) and (m.start() == 0 or t[max(0, m.start()-2):m.start()].strip() in ("", ".", "!", "?", ":", "]")): return w
        return "<NAME>"
    return NAME.sub(name, t)
rows = list(csv.DictReader(open("data/train.csv")))
kept = dropped = 0
with open("kaggle/train_clean.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["text", "tier"])
    for r in rows:
        if r["src"] == "synthetic": w.writerow([r["text"], r["tier"]]); kept += 1; continue
        if SENSITIVE_ROW.search(r["text"]): dropped += 1; continue
        t = r["text"]
        if t.startswith("[previous:"):  # keep short, scrubbed context
            prev, _, body = t.partition("]\n"); t = prev[:120] + "]\n" + body
        w.writerow([redact(t[:300]), r["tier"]]); kept += 1
print("kept", kept, "dropped (sensitive keywords)", dropped)

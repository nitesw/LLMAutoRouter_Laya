"""Step 1: does Laya route prompts to sensible model tiers?"""
import time
from laya import Router

QUESTIONS = {
    "tier": {
        "type": "choice",
        "instructions": "Which AI model tier is needed to handle this request well?",
        "criteria": {
            "none": "a trivial yes/no or pick-one decision, a greeting, or a lookup that needs no reasoning",
            "haiku": "simple, small task: rename, format, explain a short error, one-line fix, quick fact",
            "sonnet": "standard coding task: implement a feature, write tests, refactor one file, debug a clear bug",
            "opus": "hard task: system architecture, multi-file debugging, subtle concurrency or security issues, deep research, ambiguous design trade-offs",
        },
    },
    "complexity": {
        "type": "score",
        "instructions": "How much reasoning and expertise does this request require?",
        "criteria": ["trivial", "simple", "moderate", "hard", "expert"],
    },
}

# (prompt, expected tier)
PROMPTS = [
    ("thanks!", "none"),
    ("should I use tabs or spaces? just pick one", "none"),
    ("yes, go ahead", "none"),
    ("rename the variable usr to user in this function", "haiku"),
    ("what does 'TypeError: undefined is not a function' mean?", "haiku"),
    ("format this JSON nicely", "haiku"),
    ("write a git commit message for adding a login button", "haiku"),
    ("add a /health endpoint to my Express server that returns status ok", "sonnet"),
    ("write unit tests for the parseDate function in utils.ts", "sonnet"),
    ("refactor this React component to use hooks instead of a class", "sonnet"),
    ("the signup form submits twice when I click fast, fix it", "sonnet"),
    ("design the architecture for a multi-tenant SaaS billing system with usage metering, proration and webhooks", "opus"),
    ("we have an intermittent race condition across our job queue workers and the Postgres locks, figure out the root cause across these 12 files", "opus"),
    ("audit this authentication flow for security vulnerabilities including token replay and session fixation", "opus"),
    ("migrate our monolith to microservices: propose service boundaries, data ownership and a phased rollout plan", "opus"),
]

TIER_ORDER = ["none", "haiku", "sonnet", "opus"]

router = Router()
router.predict("warmup", QUESTIONS)  # load model

hits = near = 0
print(f"{'expected':8} {'got':8} {'conf':>5} {'cplx':>8} {'ms':>5}  prompt")
for prompt, expected in PROMPTS:
    t = time.perf_counter()
    r = router.predict(prompt, QUESTIONS)
    ms = (time.perf_counter() - t) * 1000
    tier = r["answers"]["tier"]
    cx = r["answers"]["complexity"]
    got = tier["choice"]
    hits += got == expected
    near += abs(TIER_ORDER.index(got) - TIER_ORDER.index(expected)) <= 1
    mark = "OK " if got == expected else "XX "
    print(f"{mark}{expected:5} {got:8} {tier.get('confidence', 0):5.2f} {str(cx.get('score')):>8} {ms:5.0f}  {prompt[:60]}")

n = len(PROMPTS)
print(f"\nexact: {hits}/{n}   within one tier: {near}/{n}   model: {r['routing']['model']}")

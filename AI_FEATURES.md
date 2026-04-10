# AI Arena Analysis — Design Reference

Feature status and priority matrix → `TRACKER.md`. Per-utility detail → `AI_UTILS.md`.

---

## Design Philosophy

This tool is designed for **advanced players** (top 0.5% rating) who already play correctly
most of the time. That means:

- **No rule-based flagging** ("you had X available and didn't use it"). Existing tools like
  ArenaCoach.gg already do this and it's not useful at high level.
- **Timing and context matter** — using the right CD 15 seconds late during a burst window
  is a real mistake; using it 5 seconds early is also wrong. The analysis must cross-reference
  your actions against enemy actions.
- **Counterfactual framing** — "if you had held Cocoon 8 seconds longer, it would have
  covered both damage spikes instead of just the first one."
- **Covers all healers**, not spec-specific. Logic should infer appropriate behavior from
  `owner.spec`.

### Core Architecture Principle

```
features → state reconstruction → decision modeling → LLM evaluation → constrained output
```

NOT:

```
features → LLM → conclusions
```

The LLM's role is **constrained evaluator and ranker**, not free-form conclusion generator.
Context sent to Claude should be organized around **critical moments and decision points**,
not a flat list of feature blocks. Output: top 1–3 highest-impact findings, ranked by match impact.

**Explicitly out of scope:**

- Full CD rotation simulation as code — prompt engineering task, not a utility.
- Ping/Latency detection — log timestamps are server-side only.
- Perfect pre-match setup state — impossible before combat log initialization.
- Comp-specific heuristics in context injection — inject causal facts, not rules. Let Claude reason from data.

---

## Context Structure

```
MATCH SUMMARY
  [bracket, result, duration, specs, deaths, dampening]

CRITICAL MOMENTS (top 3, ranked by estimated match impact)
  Moment N: [timestamp] — [title]
    ⚠ Contributing factor: [spec] died Xs later (if applicable)
    Enemy state: [active offensive CDs, threat level]
    Friendly state: [defensives available, HP levels, CC status]
    What happened: [actual response]
    Root cause trace: [backward causal chain from death — CDs on CD + why, CC at death time]
    Available options: [what could have been done]
    Uncertainty: [what the log cannot confirm]

SUPPORTING DATA
  [purge responsibility, CD usage, teammate CDs, enemy CD timeline,
   overlaps, panic defensives, dispel summary, healing gaps,
   offensive windows, CC/trinket, outgoing CC chains, dampening]
```

---

## LLM Role

**System prompt principles:**

- Claude is a constrained evaluator, not a free-form coach
- Must express uncertainty explicitly; avoid "must", "always", "should have"
- Output: exactly 3 findings maximum, ranked by estimated match impact
- For each finding: what happened, what the alternative was, confidence level, what information would be needed to be certain

**Prompt structure:**

```
For each critical moment below, evaluate the decision made:
- Was this the correct trade given the available information?
- What was the most likely alternative decision?
- What is the estimated impact difference between the two?
- What uncertainty remains that prevents a definitive verdict?
```

---

## Build Order Reference

- **Sprint 1**: Prompt rewrite, purge blame attribution, purge blocklist (done)
- **Sprint 2**: Kill window quality (F12), timing classification (F13 done), offensive windows (F14 done), trade necessity (F22), blame assignment (F23), avoidability (F24), prompt optimization (F34), match archetype (F35)
- **Sprint 3**: DR chain tracking (F15 done), CC avoidability (F27 done), CDR heuristics (F16), CC during burst (F17), target selection (F25)
- **Sprint 4**: Fatal dispel flagging (F18), mana curve (F19), interrupt analysis (F20)

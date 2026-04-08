# AI Arena Analysis — Feature Backlog

Features for the AI cooldown analysis system. Each is designed to be independently
developable (separate utility + API route update + component section).

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

### Prior Art Research (2026-03)

- **ArenaCoach.gg** — rule-based mistake detection (broken CC chains, missed kicks, bad
  defensive timing). Good for beginners, not useful at high level.
- **Ultima AI (ai.pvpq.net)** — trained by 20+ AWC pros, scores 10 dimensions, uses
  Claude/GPT. Most sophisticated competitor.
- **Gaps in existing tools**: healer-specific deep analysis, dispel efficiency, healing gaps,
  mana curve, cooldown trading timelines. Most tools are DPS-focused.

### Core Architecture Principle (updated 2026-04)

The system follows:

```
features → state reconstruction → decision modeling → LLM evaluation → constrained output
```

NOT:

```
features → LLM → conclusions
```

The LLM's role is **constrained evaluator and ranker**, not free-form conclusion generator.
Context sent to Claude should be organized around **critical moments and decision points**,
not a flat list of feature blocks. Output should be compressed to the **top 1–3 highest-impact
findings**, ranked by estimated match impact.

**Explicitly out of scope:**

- Positioning analysis / LoS (Line of Sight) — mathematically impossible; combat log lacks Z-axis and 3D map collision meshes for pillars. Probabilistic statements only.
- Mirror benchmarking — requires opponent data we don't have.
- Full CD rotation simulation as code — this is a prompt engineering task, not a new utility.
- Ping/Latency detection — log timestamps are strictly server-side; we cannot differentiate between lag and poor reaction times.
- Perfect pre-match setup state — impossible to know exactly what CDs were pressed in the starting room before combat/log initialization.

---

## Already Built

### ✅ Cooldown Usage Analysis

- Extracts major tagged CDs (≥30s) from combat log
- Computes cast times and idle availability windows
- Cross-references with incoming damage pressure windows
- Files: `packages/shared/src/utils/cooldowns.ts`

### ✅ Enemy CD Timeline

- Reconstructs when enemy offensive CDs were available throughout the match
- Overlays with friendly incoming damage spikes
- Files: `packages/shared/src/utils/enemyCDs.ts`

### ✅ Dampening Curve

- Computes dampening % at each timestamp
- Identifies when healing could no longer sustain incoming damage
- Files: `packages/shared/src/utils/dampening.ts`

### ✅ Panic Trading & Overlap Detection

- Detects defensive CDs used during fake pressure or unnecessarily doubled up
- Files: `packages/shared/src/utils/cooldowns.ts` (`detectPanicDefensives`, `detectOverlappedDefensives`)

### ✅ Dispel Analysis

- Tracks cleanse timing vs. incoming damage pressure
- Tracks offensive purge windows (enemy buffs sitting unpurged)
- Files: `packages/shared/src/utils/dispelAnalysis.ts`

### ✅ Healing Gap Detection

- Finds windows where healing dropped to zero while team was under pressure
- Distinguishes CCed gaps (unavoidable) from free-cast gaps
- Files: `packages/shared/src/utils/healingGaps.ts`

### ✅ CC & Trinket Analysis

- Tracks CC received, trinket usage, and whether trinket was used optimally
- Files: `packages/shared/src/utils/ccTrinketAnalysis.ts`

### ✅ AI Test Page

- Local dev page at `/local/ai` for inspecting full request/response with Claude
- Shows user message, system prompt, response, token counts, latency
- Files: `packages/web/app/(main)/local/ai/page.tsx`

---

## Feature Priority Matrix

| Priority | #   | Feature                                                                             | Complexity | Value (advanced) | Status                           |
| -------- | --- | ----------------------------------------------------------------------------------- | ---------- | ---------------- | -------------------------------- |
| **1**    | P0  | Prompt rewrite — constrained evaluator, top-3 output, uncertainty, decision framing | Low        | **Critical**     | ✅ Done (F9, Sprint 1)           |
| **2**    | P0  | Purge blame attribution — who on team can purge, is log owner one of them           | Low        | **High**         | ✅ Done (F11, Sprint 1)          |
| **3**    | P0  | Purge blocklist fixes — spells flagged as purgeable that aren't                     | Low        | **High**         | ✅ Done (B6/B7 fixed)            |
| **4**    | 12  | Kill Window Quality                                                                 | Medium     | **High**         | ❌ Not started (F12, Sprint 2)   |
| **5**    | —   | Timing classification — early/optimal/late on defensive CD usage                    | Low        | **High**         | ❌ Not started (F13, Sprint 2)   |
| **6**    | 17  | Offensive Vulnerability Windows                                                     | Medium     | **High**         | ❌ Not started (F14, Sprint 2)   |
| **7**    | 9   | DR Chain Tracking                                                                   | Medium     | **High**         | ❌ Not started (F15, Sprint 3)   |
| **8**    | 18  | CDR Heuristics (scoped: Shifting Power, Wake of Ashes only)                         | Medium     | Medium           | ❌ Not started (F16, Sprint 3)   |
| **9**    | 2   | CC During Enemy Burst Response                                                      | Medium     | Medium           | ❌ Not started (F17, Sprint 3)   |
| **10**   | 16  | Fatal Dispel Flagging (UA backlash)                                                 | Low        | Medium           | ❌ Not started (F18, Sprint 4)   |
| **11**   | 5   | Mana Curve                                                                          | Low        | Medium           | ❌ Not started (F19, Sprint 4)   |
| **12**   | 11  | Interrupt Analysis                                                                  | Low        | Low-Medium       | ❌ Not started (F20, Sprint 4)   |
| **—**    | —   | Dispel/purge priority scoring + CD context + pressure signal                        | Medium     | **High**         | ✅ Done (F21, Sprint 2)          |
| **—**    | —   | Trade necessity + cost modeling                                                     | Medium     | **High**         | ❌ Not started (F22, Sprint 2)   |
| **—**    | —   | Blame assignment (self / teammate / unavoidable)                                    | Medium     | **High**         | ❌ Not started (F23, Sprint 2)   |
| **—**    | —   | Avoidability framing                                                                | Medium     | High             | ❌ Not started (F24, Sprint 2)   |
| **—**    | —   | Target selection evaluation                                                         | Medium     | Medium           | ❌ Not started (F25, Sprint 3)   |
| **—**    | —   | CC avoidability                                                                     | Low        | Medium           | ❌ Not started (F27, Sprint 3)   |
| **—**    | 8   | CD Rotation Simulation                                                              | —          | —                | Handled via prompt, not code     |
| **—**    | 6   | Positioning Analysis                                                                | —          | —                | Out of scope (no pillar data)    |
| **—**    | 13  | Player Performance Score                                                            | —          | —                | Deprioritized (calibration risk) |

---

## Build Order

### Sprint 1 — Fix the prompt before adding more data

These require no new data extraction. They fix the largest quality problems immediately.

1. **P0: Prompt rewrite** — restructure context around critical moments, constrain Claude's
   output to top-3 ranked insights, enforce uncertainty language, give Claude candidate
   decision options to evaluate rather than asking it to generate conclusions freely.

2. **P0: Purge blame attribution** — `reconstructDispelSummary` already computes who can
   purge, but the context sent to Claude doesn't distinguish "your team missed a purge" from
   "you personally missed a purge". Add explicit per-player purge capability to the context
   block, and clarify when the log owner cannot purge at all.

3. **P0: Purge blocklist** — audit and expand `PURGE_BLOCKLIST` in `dispelAnalysis.ts` for
   spells that have Magic dispelType in the DB but aren't actually purgeable in practice.

### Sprint 2 — Decision quality layer

These extend the data layer to support trade-based analysis.

4. **Kill Window Quality (#12)** — which decision determined the outcome; was the kill window
   wasted due to split damage, free healer, or missing CC?

5. **Timing classification** — add early/optimal/late label to each defensive CD usage based
   on match phase and enemy CD state. Small addition to `cooldowns.ts`.

6. **Offensive Vulnerability Windows (#17)** — inverse of pressure windows; when was the
   enemy vulnerable (low HP, medallion on CD, major def unavailable) and did your team
   capitalise? Completes the symmetry of the analysis.

### Sprint 3 — Precision layer

7. **DR Chain Tracking (#9)** — track CC DR state so Claude can assess whether a CC was
   full/partial/immune duration. Requires accurate DR category mapping per spell.

8. **CDR Heuristics (#18)** — scoped to a known short list: Shifting Power, Wake of Ashes,
   Convoke resets. Improves CD availability accuracy for affected specs.

9. **CC During Enemy Burst (#2)** — was the right CC used, at the right time, into the burst
   window? Requires enemy burst window detection already partially done via enemy CD timeline.

### Sprint 4 — Supporting signals

10. **Fatal Dispel Flagging (#16)** — detect UA dispel backlash, filter for pre-existing
    targeting to avoid false positives.

11. **Mana Curve (#5)** — relevant mainly in long/dampening-heavy matches. Medium value.

12. **Interrupt Analysis (#11)** — track kicked vs. unkicked high-value casts. Lower value
    at R1 where kicks are instinctive.

---

## Context Structure (target format after Sprint 1)

Instead of a flat block-per-feature, the context should be organized as:

```
MATCH SUMMARY
  [basic facts: bracket, result, duration, specs, dampening]

CRITICAL MOMENTS (top 3, ranked by estimated match impact)
  Moment 1: [timestamp] — [what happened]
    Enemy state: [active offensive CDs, threat level]
    Friendly state: [defensives available, HP levels, CC status]
    What happened: [actual response]
    Available options: [what could have been done]
    Uncertainty: [what the log cannot confirm]

  Moment 2: ...
  Moment 3: ...

SUPPORTING DATA (abbreviated — for Claude to reference if needed)
  [remaining CD usage, purge summary, dampening threshold, etc.]
```

Claude is then asked to evaluate each critical moment and rank them by impact — not to
summarize a feature list.

---

## LLM Role (target after Sprint 1)

**System prompt principles:**

- Claude is a constrained evaluator, not a free-form coach
- Must express uncertainty explicitly; avoid "must", "always", "should have"
- Output: exactly 3 findings maximum, ranked by estimated match impact
- For each finding: what happened, what the alternative was, confidence level, and what
  information would be needed to be certain

**Prompt structure (instead of "what went wrong"):**

```
For each critical moment below, evaluate the decision made:
- Was this the correct trade given the available information?
- What was the most likely alternative decision?
- What is the estimated impact difference between the two?
- What uncertainty remains that prevents a definitive verdict?
```

---

## Antigravity Feature Notes

These were contributed during a separate brainstorming session and are incorporated above:

- **#15 Offensive Purge Tracking** — now built into `dispelAnalysis.ts`
- **#16 Fatal Dispel Flagging** — Sprint 4, sound concept, needs UA-specific backlash filtering
- **#17 Offensive Vulnerability Windows** — Sprint 2, highest value of the set
- **#18 CDR Heuristics** — Sprint 3, scoped to known CDR abilities only

---

## Development Notes

- Each data feature adds a new input to the context builder — they are additive and independent
- Watch token limits: as context grows, lower-priority blocks should be summarised or omitted
- All utility functions must support all specs, not just Mistweaver
- All utility functions should be usable by both the web component (`CombatAIAnalysis`) and
  the AI test page (`/local/ai`)
- The AI test page (`/local/ai`) should be used to validate every prompt change before shipping

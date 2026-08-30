# AI Context Refactor — Decision-Centric Format

## Diagnosis

The current system already does prioritization correctly (`identifyCriticalMoments()` scores events, limits to top 3, ranks most-impactful-first). The real problem is that top-3 moments are serialized as **independent events** with no explicit causal connection between them. The LLM reads three separate facts instead of a chain: _this pressure set up that trade, which exhausted the resources, which caused the death._

The secondary problem is that supporting data sections (dispel events, enemy CD timeline, CC chains) are verbose enough to dilute LLM attention away from the critical moments section.

---

## What NOT to do

- Do NOT rewrite the pipeline or replace `identifyCriticalMoments()`
- Do NOT delete supporting data (it is a hallucination guardrail — removing it causes "you should have used X" when X is not in the player's build)
- Do NOT force a single decision window (sometimes two independent mistakes both mattered)
- Do NOT use forced A/B/C option templates (LLM fabricates option C to fill the slot)

---

## Three targeted changes

### Change 1 — Match Arc (highest value, lowest cost)

Add a 3-sentence summary of match flow **before** the CRITICAL MOMENTS section. Forces the LLM to understand "how did this game play out" before evaluating individual moments.

**Target output:**

```
Match Arc:
  Early (0:00–1:20): Enemy established pressure via stacked burst; no major defensives spent.
  Mid (1:20–2:45): First defensive trade (Apotheosis) forced to stabilize — no major CDs remaining.
  Late (2:45–3:30): Second burst aligned with zero defensives available → friendly death.
```

**Phase boundary rules (to decide before implementing):**

| Phase | Start                | End                                                                         |
| ----- | -------------------- | --------------------------------------------------------------------------- |
| Early | Match start          | First major defensive used by either team                                   |
| Mid   | First defensive      | First friendly death OR first burst window resolved (whichever comes first) |
| Late  | First friendly death | Match end                                                                   |

**Edge cases:**

- Match <90s (speed kill): collapse to two phases (Pressure / Death)
- No deaths before dampening: Late phase = "dampening reached" as boundary
- Win with no friendly deaths: phases still work; Late phase describes how the kill was finished

**Implementation:** New function `buildMatchArc()` in `CombatAIAnalysis/index.tsx`, ~20 lines, uses existing computed data (`enemyCDTimeline.alignedBurstWindows`, `cooldowns`, `friendlyDeaths`).

---

### Change 2 — Causal chain labeling on moments

Modify how moments are serialized in `buildMatchContext()` to describe their **causal role** rather than just their type. Use existing `contributingDeathAtSeconds` and `rootCauseTrace` fields to wire the chain.

**Current (independent events):**

```
--- MOMENT 1 (impact: Critical) ---
2:48 — Holy Priest death

--- MOMENT 2 (impact: High) ---
1:22 — Healing gap — Warrior took 480k while healer had free-cast time

--- MOMENT 3 (impact: Moderate) ---
0:55 — Panic defensive — Apotheosis used with no enemy burst detected
```

**Target (causal chain):**

```
--- MOMENT 1 [Setup] ---
0:55 — Apotheosis used with no enemy burst detected
  → This exhausted the primary healing cooldown 115s early.
  → Contributed to: Holy Priest death at 2:48 (113s later)

--- MOMENT 2 [Consequence] ---
1:22 — Healing gap — Warrior took 480k while healer had free-cast time
  → Apotheosis was on cooldown during this window (used 27s prior).
  → Contributed to: Holy Priest death at 2:48 (86s later)

--- MOMENT 3 [Kill] ---
2:48 — Holy Priest death
  Root cause trace: ...
```

**Label logic:**

- Moment with `isDeath: true` → `[Kill]`
- Moment with `contributingDeathAtSeconds` set → `[Setup]` or `[Consequence]` depending on whether an earlier moment also contributed to the same death
- Moment with no death connection → `[Standalone]`
- Fallback (win, no friendly death): use `[Pressure]`, `[Response]`, `[Resolution]`

---

### Change 3 — Supporting data compression

Replace raw event listings with aggregated summaries. Supporting data must stay (hallucination guardrail) but doesn't need to be verbose.

**Dispel section — current:**

```
DISPEL ANALYSIS:
  t=1:12 — missed: Unstable Affliction on Warrior (3.2s delay)
  t=1:42 — missed: Unstable Affliction on Warrior (8.1s delay)
  t=1:45 — dispelled: Mortal Coil on Holy Priest (0.4s delay)
  ... (15 more lines)
```

**Target:**

```
DISPEL SUMMARY:
  19 total dispellable events — 14 missed, 5 dispelled
  Worst missed: Unstable Affliction on Warrior (max delay 23s, avg 11s)
  High-impact misses: 3 occurred during burst windows with >500k damage taken
```

**Apply the same pattern to:**

- `formatEnemyCDTimelineForContext` — collapse per-player event lists into burst window summaries
- `formatCCTrinketForContext` — aggregate CC counts rather than per-instance listing
- `formatOutgoingCCChainsForContext` — summarize chain count + DR impact, not per-cast

---

### Change 4 — Prompt tweak (minimal)

Add two sentences to the existing system prompt in `analyze.ts`. Do NOT replace the existing prompt (it has important guardrails: spell reference validation, purge responsibility attribution).

**Add after the opening paragraph:**

```
The CRITICAL MOMENTS section is pre-ranked by estimated match impact. Prioritize it above all other sections.
Use supporting data only to verify or cross-check claims made from the critical moments — do not introduce new findings from supporting data alone.
When multiple moments exist, explain how they connect causally rather than treating them as independent issues.
```

---

## Implementation order

1. **Match Arc** — new function, no existing code touched, highest signal-to-noise improvement
2. **Causal chain labels** — modify moment serialization in `buildMatchContext()`
3. **Supporting data compression** — mechanical changes across `formatXxx()` functions
4. **Prompt tweak** — one-line change in `analyze.ts`

---

## Success check

After implementing, generate context for a match with a friendly death and verify:

- Match Arc correctly identifies the phase boundaries
- Moments are labeled with causal roles and reference each other
- Dispel section is a summary, not a list
- System prompt still contains spell reference and purge responsibility guardrails

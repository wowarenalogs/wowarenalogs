# F72: [RESOURCES] Token Compression Design

**Date:** 2026-04-25
**Status:** Approved
**File:** `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` (`buildResourceSnapshot`)

---

## Problem

The current `[RESOURCES]` block emits 3 lines after every `[OWNER CD]` and `[TEAMMATE CD]` event. A typical match with 15–20 CD events produces ~45–60 lines of `[RESOURCES]` text, contributing ~3–4k tokens of overhead. Most of this cost comes from:

- Multi-line format (2 of 3 lines are mostly indentation + prose labels)
- Verbose English labels: "Friendly ready:", "On CD:", "Enemy active:", "CC state:"
- Explicit "free" entries for every non-CC'd player (2–3 per snapshot)
- Verbose empty state: `— (no offensive CD in last 30s)` (35 chars)

---

## Goal

~70% token reduction per `[RESOURCES]` block with no loss of reasoning quality. All data fields preserved; format optimised for LLM inference rather than human readability.

---

## Design

### Format Spec

Replace the 3-line `[RESOURCES]` block with a single `[RES]` line:

```
[RES] rdy:<spell,...>  cd:<spell(Xs),...>  [enemy:<spell/spec(Xs),...>]  [cc:<pid/spell-Xs[stun],...>]
```

**Field rules:**

| Field    | Always emitted       | Value when empty | Notes                                                                         |
| -------- | -------------------- | ---------------- | ----------------------------------------------------------------------------- |
| `rdy:`   | Yes                  | `—`              | Comma-list of ready spell names                                               |
| `cd:`    | Yes                  | `—`              | Comma-list of `SpellName(Xs)` remaining                                       |
| `enemy:` | No — omit when empty | _(field absent)_ | Only spell/spec pairs for CDs active in last 30s; `(Xs)` = seconds since cast |
| `cc:`    | No — omit when empty | _(field absent)_ | Each entry: `pid/SpellName-Xs`; append `[stun]` when cast-locked              |

**Absence semantics (must be stated in system prompt):**

- `enemy:` absent → no enemy offensive CD was active in the last 30s
- `cc:` absent → all friendly players are free (no active CC)

### Examples

Calm state (typical panic press moment):

```
[RES] rdy:Avenging Wrath,Lay on Hands  cd:Pain Suppression(45s)
```

Enemy burst, no CC:

```
[RES] rdy:—  cd:Pain Suppression(45s),GoAK(12s)  enemy:Adrenaline Rush/Rogue(8s)
```

Enemy burst with CC:

```
[RES] rdy:Blessing of Sacrifice  cd:Pain Suppression(22s)  enemy:Adrenaline Rush/Rogue(8s)  cc:2/Psychic Scream-3s[stun]
```

---

## Why Not Full Delta (skip unchanged snapshots)?

The "no enemy burst" state is the critical signal for panic press detection. The system prompt instructs Claude to cross-reference `enemy active` at the moment of each CD use. If `[RES]` is omitted entirely on calm events, Claude must infer from absence rather than explicit data — weaker reasoning. Every CD event gets a `[RES]` line; only empty sub-fields are omitted.

---

## Implementation Scope

### 1. `CombatAIAnalysis/utils.ts` — `buildResourceSnapshot`

- Change return type from `string[]` (3 elements) to `string` (1 line)
- Build `rdy:` and `cd:` unconditionally
- Build `enemy:` only when ≥1 enemy CD active in last 30s; omit field entirely otherwise
- Build `cc:` only when ≥1 friendly player is CC'd; omit field entirely otherwise
- Replace `[CAST-LOCKED]` tag with inline `[stun]` appended to the cc entry
- Update both call sites (`[OWNER CD]` block and `[TEAMMATE CD]` block): spread `...resourceSnapshot()` into `addEntry` becomes a single string push

### 2. `prompts/analyzeSystemPrompts.ts`

Add format definition before existing `[RESOURCES]` references:

> Each `[OWNER CD]` and `[TEAMMATE CD]` event is followed by a `[RES]` line showing ground-truth state at that exact moment. Fields: `rdy` = friendly CDs ready now; `cd` = friendly CDs on cooldown with seconds remaining; `enemy` = enemy offensive CDs active in the last 30s (field absent = none active); `cc` = friendly players currently CC'd (field absent = all players free). A `[stun]` tag on a CC entry means the player is cast-locked.

Replace 3 occurrences of `[RESOURCES]` → `[RES]` in existing system prompt instructions.

### 3. `TRACKER.md`

Add new backlog item for CC coverage gap:

> Root, Disarm, and Kick/Interrupt are not currently tracked in `ccTrinketSummaries` / `drAnalysis.ts`. Roots and disarms have no DR category; kicks are cast events not aura events. These CC types are not represented in `[RES] cc:` entries. Track them as aura/event signals and include in the CC state line.

### 4. Tests

Existing snapshot assertions in `__tests__/timeline.test.ts` that match the 3-line `[RESOURCES]` format must be updated to the new single-line `[RES]` format.

---

## Out of Scope

- Root/Disarm/Kick tracking (separate feature, added to TRACKER)
- CD name abbreviation (full spell names preserved for Claude readability)
- F73 architecture review (separate decision — this design is format-only, not structural)

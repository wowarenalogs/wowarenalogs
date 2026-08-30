# Raw Timeline Prompt Redesign

**Date:** 2026-04-17  
**Status:** Approved — ready for implementation planning

## Problem

The current AI prompt pre-interprets nearly everything before handing it to Claude:

- `CRITICAL MOMENTS` pre-selects which events matter and assigns verdict labels (`[OPTIMAL]`, `[EARLY]`, `[CRITICAL]`)
- `MATCH ARC` narrates a causal story before AI reads the data
- `Root cause trace` pre-explains why deaths happened
- `Possible responses: Unavailable` pre-concludes that no options existed
- `Pressure correlation` framing implies missed opportunities

Claude is effectively a prose writer on top of our analysis — not an independent analyst. It confirms our pre-drawn conclusions rather than discovering its own. The feedback sections in `wow_ai.txt` (Match 1–5) confirm this: Claude's findings closely mirror our pre-labeled moments and its meta-feedback is mostly about navigating our rules, not about what it discovered.

## Goal

Replace the pre-interpreted prompt with a raw chronological event stream that lets Claude identify important decision points itself. Build a formal feedback loop so Claude's own data utility ratings drive iterative prompt improvement.

## Design

### Approach

**Approach 2: Timeline + Minimal Context Block**

Two-part prompt structure:

1. A small **context block** with non-interpretive facts (match info, purge guardrail, spec baselines, dampening)
2. A **chronological event timeline** of all significant events — no labels, no verdicts, no pre-selected moments

### Part A — Context Block

```
ARENA MATCH — ANALYSIS REQUEST

MATCH FACTS
  Spec: {ownerSpec} ({Healer if healer}) | Bracket: {bracket} | Result: {Win/Loss} | Duration: {mm:ss}
  My team: {specs}
  Enemy team: {specs}
  Dampening: started {N}%, reached {N}% by match end

PURGE RESPONSIBILITY
  Log owner ({ownerSpec}): CAN/CANNOT offensive purge
  Team purgers: {list or "none"}

SPEC BASELINES
  {formatSpecBaselines output — unchanged, already raw comparative data}
```

### Part B — Player Loadout

Listed before the timeline so Claude can cross-reference which CDs were available vs. actually used:

```
PLAYER LOADOUT (major CDs ≥30s available this match)
  {playerName} ({spec} — log owner):
    {SpellName} [{cooldownSeconds}s], ...
  {playerName} ({spec}):
    {SpellName} [{cooldownSeconds}s], ...
  {enemyName} ({spec} — enemy):
    {SpellName} [{cooldownSeconds}s], ...
```

No "NEVER USED" annotation. Never-used CDs surface naturally through absence in the timeline — listing them under a "never activated" label would pre-bias the analysis.

### Part C — Chronological Timeline

All significant events time-ordered. No timing labels, no danger scores, no pre-verdicts.

Event types included:

| Tag                | Source                                                                            | Example                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `[OWNER CD]`       | Owner major CD cast                                                               | `0:27  [OWNER CD]  Life Cocoon → Gardianmini (27% HP)`                                                  |
| `[TEAMMATE CD]`    | Teammate major CD cast                                                            | `0:22  [TEAMMATE CD]  Gardianmini: Power Infusion`                                                      |
| `[ENEMY CD]`       | Individual enemy CD cast (≥30s)                                                   | `0:33  [ENEMY CD]  Dzinked (Holy Paladin): Avenging Crusader`                                           |
| `[CC ON TEAM]`     | CC applied to any friendly                                                        | `0:37  [CC ON TEAM]  Feramonk ← Hammer of Justice (Dzinked) \| 4s stun \| trinket: available, not used` |
| `[TRINKET]`        | Trinket use                                                                       | `1:08  [TRINKET]  Feramonk used PvP trinket`                                                            |
| `[MISSED TRINKET]` | CC window where trinket available but not used (and was not already noted inline) | emitted only if not already captured on the CC event                                                    |
| `[MISSED CLEANSE]` | Dispel opportunity missed                                                         | `1:14  [MISSED CLEANSE]  Vampiric Touch on Simplesauce \| 30s \| 212k taken during`                     |
| `[CLEANSE]`        | Successful dispel                                                                 | `0:44  [CLEANSE]  Feramonk dispelled Vampiric Touch off Simplesauce`                                    |
| `[DMG SPIKE]`      | 5s window above threshold (≥300k)                                                 | `0:19  [DMG SPIKE]  Gardianmini (Shadow Priest): 1.24M in 5s`                                           |
| `[HEALING GAP]`    | Healer inactive ≥3.5s during pressure                                             | `1:22  [HEALING GAP]  Feramonk inactive 4.2s (2.1s free-cast) while Simplesauce under pressure`         |
| `[DEATH]`          | Friendly or enemy death                                                           | see format below                                                                                        |

Death format (most data-rich event):

```
1:58  [DEATH]  Simplesauce (Unholy Death Knight — friendly)
               HP: 77% at T-15s → 89% at T-10s → 71% at T-5s → 42% at T-3s → dead
               Top damage in final 10s: Hammer of Wrath 62k, Putrefy 62k, Void Volley 52k
```

**What is removed from the prompt:**

- `MATCH ARC` (pre-narrated 3-phase causal story)
- `CRITICAL MOMENTS` section entirely
- Timing labels: `[OPTIMAL]`, `[EARLY]`, `[CRITICAL]`, `[CONSTRAINED TRADE]`
- `Pressure correlation (counterfactual unknown — not evidence of missed opportunity)` framing
- `Possible responses: Unavailable` pre-conclusions
- Danger scores on enemy burst windows
- `HEALER EXPOSURE DURING ENEMY BURST WINDOWS` section (too processed)
- `KILL WINDOW TARGET SELECTION` section
- `OFFENSIVE WINDOWS` section
- `OUTGOING CC CHAINS` section

**What survives as timeline events** (converted from old sections):

- CD casts from all players → timeline events
- Enemy CD casts (individual, not grouped into scored burst windows)
- CC events, trinket use/miss → `[CC ON TEAM]`, `[TRINKET]`, `[MISSED TRINKET]`
- Dispel misses/hits → `[MISSED CLEANSE]`, `[CLEANSE]`
- Deaths with HP trajectory and top damage sources → `[DEATH]`
- Pressure windows above threshold → `[DMG SPIKE]`
- Healing gaps → `[HEALING GAP]` (healer only)

### System Prompt Changes

**Remove:**

- "The CRITICAL MOMENTS section represents the most important events in the match"
- "Use the MATCH ARC section to understand the causal structure"
- "For each CRITICAL MOMENT listed in the input, evaluate..."
- References to section names that no longer exist

**Replace task instruction with:**

> You are given a raw match timeline. Your task is to identify the most important decision points yourself — do not expect a pre-selected list. Read the full timeline, build your own causal narrative, then evaluate the decisions that most affected match outcome.

**Keep:**

- "Evaluate only what the data shows. Never invent events, timestamps, or spells not present in the data."
- "Only reference a spell if it appears in PLAYER LOADOUT or the timeline."
- "Express uncertainty explicitly."
- "This player already plays correctly most of the time."
- Purge responsibility rule
- NEVER USED rules (updated to reference PLAYER LOADOUT instead of COOLDOWN USAGE section)

**Output format change:** DATA UTILITY section is now **always required** (not just in test mode). Move it from `TEST_SYSTEM_PROMPT` into the main `SYSTEM_PROMPT`.

DATA UTILITY format:

```
## Data Utility

### Used — directly informed a finding
- [event type]: [how it was used]

### Present but unused
- [event type]: [why it didn't contribute]

### Missing — would have changed confidence or a finding
- [what you needed]: [which finding it would affect]

### One change
[Single most impactful prompt improvement you'd make]
```

### Formal Improvement Loop

1. Run `printMatchPrompts --count N --ai` to collect N responses with DATA UTILITY sections
2. Aggregate "present but unused" and "missing" across all N responses
3. Promotion rule:
   - Event type in "present but unused" in >50% of matches → remove from timeline builder
   - Item in "missing" in >30% of matches → add to timeline or context block
4. After each round of changes, run another N matches and compare finding quality

Target evolution: over several iterations, the timeline should converge toward a leaner categorized-tables format (option B) based on Claude's own feedback — not intuition.

## Implementation

### New Functions (shared utils)

Two new exported functions in `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`:

**`buildPlayerLoadout(owner, teammates, enemies, ownerCDs, teammateCDs, enemyCDTimeline)`**  
Returns formatted PLAYER LOADOUT string. Lists all major CDs ≥30s for all players — no usage annotations.

**`buildMatchTimeline(params)`**  
Core new function. Collects events from all sources, sorts by timestamp, returns formatted timeline string.

Sources it draws from (all already computed before the call):

- `ownerCDs` — `[OWNER CD]` events
- `teammateCDs` — `[TEAMMATE CD]` events
- `enemyCDTimeline.players[*].offensiveCDs` — `[ENEMY CD]` events (individual casts, not grouped burst windows)
- `ccTrinketSummaries` — `[CC ON TEAM]`, `[TRINKET]`, `[MISSED TRINKET]` events
- `dispelSummary` — `[MISSED CLEANSE]`, `[CLEANSE]` events
- `friendlyDeaths` + `enemyDeaths` (with HP trajectory and top damage) — `[DEATH]` events
- `pressureWindows` (≥300k threshold) — `[DMG SPIKE]` events
- `healingGaps` (healer only) — `[HEALING GAP]` events

### Feature Flag Strategy

The new prompt runs alongside the old one behind a flag. The old prompt is **not modified** during this phase. Once side-by-side comparison confirms the new format is better, a single flag flip activates it everywhere.

**Flag name:** `useTimelinePrompt: boolean` (default `false`)

**Where the flag lives:**

- `buildMatchContext(combat, friends, enemies, useTimelinePrompt?)` in `index.tsx` — optional parameter, defaults `false`; the web app passes `false` until the flip
- `printMatchPrompts.ts` — new CLI flag `--new-prompt` sets it to `true`; omitting it keeps old behavior
- `analyze.ts` — adds `NEW_SYSTEM_PROMPT` constant alongside existing `SYSTEM_PROMPT`; the API route selects based on which context was passed (old context → old prompt, new context → new prompt)

**Side-by-side comparison workflow:**

```bash
# Run old prompt
npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 5 --ai

# Run new prompt
npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 5 --ai --new-prompt
```

Both modes print the prompt + AI response to stdout so outputs can be diffed directly.

**Flip switch:** When ready to go live, change the default of `useTimelinePrompt` to `true` in `buildMatchContext`. No other changes needed.

### Files Changed

| File                                                                     | Change                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`  | Add `buildPlayerLoadout`, `buildMatchTimeline`                                                                                                                                  |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx` | Add `useTimelinePrompt?` param to `buildMatchContext`; when `true`, use context block + `buildPlayerLoadout` + `buildMatchTimeline`; when `false`, existing code path unchanged |
| `packages/tools/src/printMatchPrompts.ts`                                | Add `--new-prompt` CLI flag; when set, calls `buildPlayerLoadout` + `buildMatchTimeline` + `NEW_SYSTEM_PROMPT`; old path unchanged                                              |
| `packages/web/pages/api/analyze.ts`                                      | Add `NEW_SYSTEM_PROMPT` constant; route selects prompt based on `useTimelinePrompt` flag passed in request (default `false`)                                                    |

### What Old Code Remains Untouched

All existing functions stay in place and continue to be called by the `useTimelinePrompt = false` path:

- `buildMatchArc`, `identifyCriticalMoments`, `buildDeathRootCauseTrace`, `buildKillMomentFields`
- All `format*ForContext` functions
- `computeMatchArchetype`, `formatMatchArchetypeForContext`
- `formatDampeningForContext`

### Data Computations That Survive Unchanged

All these still run — their output feeds into `buildMatchTimeline` instead of the old section formatters:

- `extractMajorCooldowns`
- `reconstructEnemyCDTimeline`
- `analyzePlayerCCAndTrinket`
- `reconstructDispelSummary`
- `detectHealingGaps`
- `computePressureWindows`
- `formatSpecBaselines`

## Success Criteria

- Claude identifies critical moments not pre-labeled by our code
- DATA UTILITY feedback shows event types that informed findings vs. noise
- Over 3–5 iteration rounds, "present but unused" list shrinks and "missing" list drives real additions
- Finding confidence levels improve (more High, fewer Low) as the timeline converges on the right data

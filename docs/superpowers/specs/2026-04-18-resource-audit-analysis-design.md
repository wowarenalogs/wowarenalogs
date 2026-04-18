# Resource Audit Analysis — Design Spec

**Date:** 2026-04-18
**Feature:** Counterfactual resource-efficiency analysis for arena match AI coaching
**Scope:** `buildMatchTimeline` (data layer) + `NEW_SYSTEM_PROMPT` (reasoning layer)

---

## Motivation

The current analysis describes _what happened_. This spec upgrades it to audit _whether the resource trade was efficient_. The mental model shifts from "log reader" to "financial auditor": inputs are resources (major CDs, trinket), outputs are efficiency verdicts. A finding only qualifies if a cheaper path existed — survival confirmations are not findings.

---

## Part 1 — Data Layer: `[RESOURCES]` Snapshot

### What it does

Whenever a `[OWNER CD]` or `[TEAMMATE CD]` line is emitted in `buildMatchTimeline`, immediately follow it with a `[RESOURCES]` block containing three lines of ground-truth state at that exact timestamp.

### Format

```
0:22  [OWNER CD]   Pain Suppression → 3 (62% HP)
      [RESOURCES]  Friendly ready: Power Infusion, Psychic Scream | On CD: —
                   Enemy active: — (no offensive CD in last 30s)
                   CC state: 1 (Disc Priest) Kidney Shot 2s left | 2 (Warrior) free | 3 (Ret Pal) free
```

### Field definitions

**Friendly ready / On CD**

- For each other friendly major CD (owner + teammates), compute ready state at timestamp T:
  - Find the last cast of that CD before T
  - If `lastCastTime + cooldownSeconds ≤ T` → Ready
  - If no prior cast and T > grace period (5s) → Ready
  - Otherwise → `On CD (Xs remaining)` where X = `round(lastCastTime + cooldownSeconds - T)`
- Multi-charge CDs: check each charge slot independently
- Include trinket in the ready/CD list

**Enemy active**

- Pull from `enemyCDTimeline`: any enemy offensive CD with a cast in the 30s window `[T-30, T]`
- Format: `SpellName (ClassName, cast T-Xs ago)` or `— (no offensive CD in last 30s)`
- Note: this field flags _recently cast_ enemy CDs. Duration tracking (F44) is a future improvement.

**CC state**

- For every friendly player (owner + teammates): check `ccTrinketSummaries` for any CC event active at T
- Format per player: `N (SpecName) CCType Xs left` if in CC, or `N (SpecName) free`
- Physical stuns (Kidney Shot, Bash) annotated as `[CAST-LOCKED]` — player cannot cast most abilities

### Physical feasibility constraint

If a player is in a `[CAST-LOCKED]` CC and a cast appears from them in the same window, the only explanation is Trinket use. The implementation must flag this: append `[used trinket to break]` to their CC state line. This is the data the prompt needs to detect "Trinket + Pain Suppression into an already-covered window = Total Tactical Disaster."

### Implementation location

`buildMatchTimeline` in `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

New helper: `buildResourceSnapshot(timeSeconds, ownerCDs, teammateCDs, ccTrinketSummaries, enemyCDTimeline, matchStartMs)` → returns the three-line string. Called inline after each CD entry.

---

## Part 2 — Prompt Layer: Counterfactual Reasoning Rules

### Supreme directive (opening of task section)

> Your goal is **resource optimization, not survival confirmation**. Do not explain how the player survived. Explain whether they spent the minimum necessary resource to survive — and if not, what that waste costs them in the next enemy burst window.

### Mandatory reasoning checks per finding

**1. Trade Equity**

Cross-reference the `[RESOURCES]` enemy active line. If no enemy offensive CD was active:

- Do NOT conclude Bait if dampening > 40% (healing severely impaired; flat damage is lethal).
- Do NOT conclude Bait if the preceding 10s cast stream shows sustained heavy spell pressure (Chaos Bolt chains, Pyroblast casts, Greater Pyro reads).
- If both conditions are absent → flag as potential Bait and assess whether a smaller tool could have covered the window.

**2. Overlap Attribution**

If two or more friendly major CDs appear within 3s in the timeline:

- Determine Primary (the CD that was correct to use) and Secondary (the redundant one).
- Attribution logic using CC state:
  - Healer is `[CAST-LOCKED]`: DPS defensive is Primary. Any healer defensive in the same window required Trinket use — flag as potential Total Tactical Disaster (trinket burned on an already-covered window).
  - Healer is free: Healer's defensive is Primary. DPS defensive within 3s is Panic Click — DPS is responsible.
  - Both are free: the player with the more valuable remaining CD (larger cooldown, fewer remaining uses) should have held — they are responsible.
- The finding must name _who_ held the redundant resource and _which_ resource they should have kept.

**3. Counterfactual Path**

The alternative is never "do nothing." It is always "the cheapest tool that could have covered this window":

- Use HP trajectory and CC state to estimate whether small tools (Ignore Pain, shields, passive healing) could have bridged the 4–6s gap.
- If the conclusion is "not using X would have caused death with no alternative available," downgrade this finding to Low Value — do not include in Top 5. Only findings where a cheaper path plausibly existed qualify.

**4. Specific Future Consequence**

When a CD use is flagged as wasteful or redundant:

- Scan the future timeline for the next enemy offensive CD window or `[DEATH]` event.
- If that future window results in a death or a forced emergency CD, establish direct causation:
  > _"Because Pain Suppression was used at 0:22 when the Warrior's Die by the Sword was sufficient, no defensive was available when Dark Soul landed at 1:15, directly contributing to the Warrior's death."_
- Do not write vague consequence language ("later pressure increased"). Name the timestamp and the outcome.

---

## What does NOT change

- Output format: `## Finding N` with `What happened / Alternative / Impact / Confidence` — unchanged.
- Data Utility section — unchanged.
- Core evidence-discipline rules (no invented events, no spells not in loadout) — unchanged.
- `SYSTEM_PROMPT` (old critical-moments path) — not touched.

---

## Files changed

| File                                                                    | Change                                                                                                                                 |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` | Add `buildResourceSnapshot()`, call from `buildMatchTimeline` after each CD entry                                                      |
| `packages/shared/src/prompts/analyzeSystemPrompts.ts`                   | New file: extract `SYSTEM_PROMPT` and `NEW_SYSTEM_PROMPT` from `analyze.ts`; add counterfactual reasoning rules to `NEW_SYSTEM_PROMPT` |
| `packages/web/pages/api/analyze.ts`                                     | Import from `analyzeSystemPrompts.ts` (already partially done)                                                                         |
| `packages/tools/src/printMatchPrompts.ts`                               | Import `NEW_SYSTEM_PROMPT` from shared; sync `HYBRID_SYSTEM_PROMPT` if kept                                                            |

---

## Open questions (not blocking)

- F44 (enemyCDTimeline data quality audit) should run after this ships to verify enemy active coverage is accurate.
- Mana state is not currently tracked in the timeline — Trade Equity dampening check is a proxy. Mana curve (F19) would sharpen this further.

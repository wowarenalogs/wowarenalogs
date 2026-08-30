# F64 / F66 / F67 Remediation Design

**Date:** 2026-04-24  
**Scope:** Fix prompt-bloat, pre-cast blind spot, redundant snapshot spam, and brittle AoE CC detection identified in the critical review of F64–F67.

---

## Background

A post-implementation review (generated from Gemini analysis of the plan files) identified four production issues:

1. **F64** — All 6 player HP values on every `[HP]` tick creates walls of text during death windows.
2. **F67a** — `extractEnemyMajorBuffIntervals` misses buffs applied before `matchStartMs` (pre-cast during gates).
3. **F67b** — `[ENEMY BUFFS]` is injected into every `[RESOURCES]` snapshot, reprinting the same buff 5–10 times during its duration.
4. **F66a** — `AOE_CC_SPELL_IDS` is a hardcoded set that silently rots as WoW patches ship new AoE CC spells.
5. **F66b** — The grouping window anchors to the first application seen, incorrectly merging two rapid casts of the same spell by the same caster.

F65 (Owner Cast Log) is already correct in the shipped code — the whitelist is in place.

---

## Fix 1 — F64: Split enemy HP into a separate critical-window-only line

### Problem

`[HP]   P1:90% / P2:80% / P3:100% / E1:35% / E2:100% / E3:100%` appears on every tick (including baseline 3s ticks), producing ~60 HP data points per 10-second death window and tripling token cost of HP reporting.

### Design

- **`[HP]` lines** keep only friendly units. Emitted on both baseline (every 3s) and dense (every 1s) critical-window ticks, exactly as today.
- **`[ENEMY HP]` lines** contain only enemy units. Emitted **only on critical-window ticks** (death windows ±10s, spike windows ±5s, CC windows). Never on baseline 3s ticks.
- Format: `0:45  [ENEMY HP]   E1:35% / E2:100% / E3:100%`

### Change location

`buildMatchTimeline` in `utils.ts`, the HP tick loop (~line 1781). Split `hpUnits` into `friendlyHpUnits` and `enemyHpUnits`. Emit `[HP]` always (for ticks already selected), emit `[ENEMY HP]` only when `criticalWindowSet.has(t)`.

---

## Fix 2 — F67a: Pre-cast buff seeding

### Problem

`extractEnemyMajorBuffIntervals` only opens a buff interval when it sees `SPELL_AURA_APPLIED`. A PI cast during the pre-game gates has its `SPELL_AURA_APPLIED` before `matchStartMs`, so the interval is never opened and the buff is invisible for the entire match.

### Design

Before the main aura event loop, scan each enemy's `auraEvents` for events where `timestamp < matchStartMs`. For each tracked buff spell found in `ENEMY_MAJOR_BUFF_SPELL_IDS`:

- If there is a `SPELL_AURA_APPLIED` before `matchStartMs` with **no corresponding `SPELL_AURA_REMOVED` also before `matchStartMs`**, seed `openBuffs` with `stateKey → matchStartMs` (so `startSeconds` resolves to `0`).

This requires a two-pass pre-scan:

1. Collect all `(stateKey, applyMs)` pairs from events before `matchStartMs`.
2. Collect all `stateKey` values that were also removed before `matchStartMs`.
3. Seed `openBuffs` with the survivors (applied but not removed before match start).

### Change location

`extractEnemyMajorBuffIntervals` in `utils.ts` (~line 86).

---

## Fix 3 — F67b: Event-based buff reporting (replace snapshot injection)

### Problem

`buildResourceSnapshot` appends `[ENEMY BUFFS]` to every `[RESOURCES]` block. During a 20-second PI window where the log owner casts 5 CDs, the same PI line is printed 5 times.

### Design

Remove `[ENEMY BUFFS]` from `buildResourceSnapshot` entirely. Instead, iterate `enemyBuffIntervals` in `buildMatchTimeline` and emit two timeline events per interval:

- **On buff start:** `0:23  [ENEMY BUFF]   E2: Power Infusion (purgeable)`
- **On buff end:** `0:43  [ENEMY BUFF END]   E2: Power Infusion`

This mirrors how `[ENEMY CD]` events are emitted — one entry per state change, never repeated. The `enemyBuffIntervals` computation is unchanged; only how it's rendered changes.

The `enemyBuffIntervals` parameter can be removed from `buildResourceSnapshot`'s param interface once no longer used there. The `IResourceSnapshotParams` interface should be updated accordingly.

### Change location

- `buildResourceSnapshot` in `utils.ts` (~line 1243): remove `enemyBuffIntervals` param + buff line logic.
- `buildMatchTimeline` in `utils.ts`: add a loop over `enemyBuffIntervals` that calls `addEntry` for start and end events.

---

## Fix 4 — F66a: Data-driven AoE CC detection

### Problem

`AOE_CC_SPELL_IDS` is a hardcoded `Set<string>` of ~11 spell IDs. Any new AoE CC (new ranks, PvP variants, racial changes) silently goes untracked. The prior Bloodlust/Heroism emergency patch is a precedent for how quickly this list rots.

### Design

Delete `AOE_CC_SPELL_IDS`. In `extractAoeCCEvents`, derive AoE-ness at runtime:

1. Group all `SPELL_AURA_APPLIED` events across `outgoingCCChains` by `(spellId, casterName, castGroup)` — where `castGroup` is determined by the grouping fix below (Fix 5).
2. A group with **≥2 distinct enemy target names** is emitted as a `[CC CAST]` event.
3. A group with exactly 1 target is skipped (single-target CC, already handled elsewhere).

No list to maintain. Any spell that hits 2+ enemies in an actual match is automatically treated as AoE.

### Change location

`extractAoeCCEvents` and `AOE_CC_SPELL_IDS` in `drAnalysis.ts` (~line 116).

---

## Fix 5 — F66b: Grouping window anchor fix

### Problem

The current grouping anchors to `app.atSeconds` (first application of the entire spell across all chains), so two rapid casts of `Psychic Scream` by the same priest 0.4s apart can incorrectly merge into one event.

### Design

Replace the current grouping with a **gap-based sequential grouping** per `(spellId, casterName)`:

1. Collect all applications for a given `(spellId, casterName)` pair, sorted ascending by `atSeconds`.
2. Start a new group whenever the gap between the current application's `atSeconds` and the previous application's `atSeconds` exceeds **0.5s**.
3. Each group = one cast event, anchored to the earliest `atSeconds` in the group.

This is O(n log n) on sort, O(n) thereafter — no change in complexity. Correctly separates two rapid same-caster casts.

### Change location

`extractAoeCCEvents` in `drAnalysis.ts` (~line 452).

---

## Files changed

| File                                                                    | Changes                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` | F64 HP split, F67a pre-scan seeding, F67b event emission + remove buff from snapshot |
| `packages/shared/src/utils/drAnalysis.ts`                               | F66a remove `AOE_CC_SPELL_IDS`, F66b fix grouping anchor                             |

No new files. No new exported interfaces (one interface shrinks: `IResourceSnapshotParams` loses `enemyBuffIntervals`).

---

## Testing

Each fix has a clear unit-testable surface:

- **F64**: `buildMatchTimeline` with enemies provided — assert `[ENEMY HP]` absent on baseline ticks, present on critical ticks.
- **F67a**: `extractEnemyMajorBuffIntervals` with a pre-`matchStartMs` `SPELL_AURA_APPLIED` and no removal — assert interval starts at `0`.
- **F67b**: `buildMatchTimeline` with an active buff — assert no `[ENEMY BUFFS]` in output, assert exactly one `[ENEMY BUFF]` and one `[ENEMY BUFF END]`.
- **F66a/b**: `extractAoeCCEvents` with a 2-target application group — assert it's emitted; with a 1-target group — assert it's skipped; with two rapid same-caster casts 0.4s apart — assert two separate events.

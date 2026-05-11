# F86 [OWNER CAST] → [OWNER CD] Promotion for Untagged Major CDs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote major personal Paladin CDs (Avenging Crusader, Aura Mastery, Ardent Defender, etc.) from `[OWNER CAST]` to `[OWNER CD]` by adding appropriate `SpellTag` entries in `classMetadata.ts`.

**Architecture:** `extractMajorCooldowns` in `cooldowns.ts` skips any spell with `tags.length === 0`, so these CDs never enter `ownerCDs`. They fall through to the healer gap-filler (`[OWNER CAST]` block) instead. The fix is purely in `classMetadata.ts`: add `SpellTag.Offensive` or `SpellTag.Defensive` to each spell. A few spells also need `SPEC_EXCLUSIVE_SPELLS` entries in `cooldowns.ts` to prevent them from appearing for the wrong Paladin spec in logs without `COMBATANT_INFO`.

**Tech Stack:** TypeScript, Jest (via `npx tsdx test`), `packages/parser/src/classMetadata.ts`, `packages/shared/src/utils/cooldowns.ts`

---

## Background

In `cooldowns.ts`, `extractMajorCooldowns` filters spells:

```ts
if (spell.tags.length === 0) return false; // ← blocks all untagged spells
```

The following Paladin spells in `classMetadata.ts` have empty `tags: []` and cooldown ≥ 30 s, so they never appear as `[OWNER CD]`:

| Spell ID | Name                             | CD    | Correct tag          | Notes                                                                                           |
| -------- | -------------------------------- | ----- | -------------------- | ----------------------------------------------------------------------------------------------- |
| `216331` | Avenging Crusader                | 60 s  | `SpellTag.Offensive` | Holy only (spec 65); replaces Avenging Wrath                                                    |
| `31821`  | Aura Mastery                     | 180 s | `SpellTag.Defensive` | Holy only baseline; not in spellClassMap talent tree                                            |
| `31850`  | Ardent Defender                  | 90 s  | `SpellTag.Defensive` | Protection only (spec 66 talent tree)                                                           |
| `204018` | Blessing of Spellwarding         | 300 s | `SpellTag.Defensive` | Protection talent; spellClassMap specIds includes all 3 specs but talent-tree filter handles it |
| `231895` | Avenging Wrath (Crusade variant) | 120 s | `SpellTag.Offensive` | specIds=[] in spellClassMap; relies on cast-evidence filter                                     |

`31821` Aura Mastery is not in `spellClassMap.json` (no talent tree entry), so it is not in `specTalentTreeSpellIds`. Without `COMBATANT_INFO`, the talent-tree filter doesn't run and the spell would appear for any Paladin. Add `'31821': [CombatUnitSpec.Paladin_Holy]` to `SPEC_EXCLUSIVE_SPELLS` to hard-gate it to Holy.

---

## File Map

| File                                                    | Change                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `packages/parser/src/classMetadata.ts`                  | Add `SpellTag.Defensive` / `SpellTag.Offensive` to 5 Paladin spells |
| `packages/shared/src/utils/cooldowns.ts`                | Add `'31821'` to `SPEC_EXCLUSIVE_SPELLS`                            |
| `packages/shared/src/utils/__tests__/cooldowns.test.ts` | New `describe` block for `extractMajorCooldowns`                    |

---

## Task 1: Write Failing Tests for `extractMajorCooldowns`

`extractMajorCooldowns` has no direct tests today. Write them first so the fix is verified.

**Files:**

- Modify: `packages/shared/src/utils/__tests__/cooldowns.test.ts`

- [ ] **Step 1: Add import for `extractMajorCooldowns` and `CombatUnitClass`**

At the top of `cooldowns.test.ts`, the existing import already includes `CombatUnitClass` from `testHelpers` indirectly via `makeUnit`. Add `extractMajorCooldowns` to the import from `../cooldowns`:

```ts
import {
  annotateDefensiveTimings,
  computePressureWindows,
  detectOverlappedDefensives,
  detectPanicDefensives,
  extractMajorCooldowns, // ← add this
  fmtTime,
  getPressureThreshold,
  IEnemyCDTimelineForTiming,
  IMajorCooldownInfo,
  isHealerSpec,
  isMeleeSpec,
  specToString,
} from '../cooldowns';
```

Also ensure `CombatUnitClass` and `CombatUnitSpec` are in the `@wowarenalogs/parser` import:

```ts
import { CombatUnitClass, CombatUnitReaction, CombatUnitSpec, LogEvent } from '@wowarenalogs/parser';
```

- [ ] **Step 2: Add the failing test describe block**

Append this block at the end of `cooldowns.test.ts`:

```ts
// ─── extractMajorCooldowns ────────────────────────────────────────────────────

describe('extractMajorCooldowns', () => {
  const T0 = 1_000_000; // match start ms
  const T_END = 1_180_000; // match end ms (3 min)

  function makeCombatFull(units: Record<string, ReturnType<typeof makeUnit>>) {
    return {
      startTime: T0,
      endTime: T_END,
      units,
    } as unknown as import('@wowarenalogs/parser').AtomicArenaCombat;
  }

  it('includes Avenging Crusader (216331) for Holy Paladin who cast it', () => {
    const owner = makeUnit('player-1', {
      class: CombatUnitClass.Paladin,
      spec: CombatUnitSpec.Paladin_Holy,
      spellCastEvents: [makeSpellCastEvent('216331', T0 + 30_000, 'enemy-1')],
    });
    const combat = makeCombatFull({ 'player-1': owner });

    const cds = extractMajorCooldowns(owner, combat);
    const ac = cds.find((c) => c.spellId === '216331');
    expect(ac).toBeDefined();
    expect(ac?.casts).toHaveLength(1);
    expect(ac?.casts[0].timeSeconds).toBeCloseTo(30, 1);
  });

  it('does not include Avenging Crusader for Retribution Paladin', () => {
    const owner = makeUnit('player-1', {
      class: CombatUnitClass.Paladin,
      spec: CombatUnitSpec.Paladin_Retribution,
      spellCastEvents: [],
      info: { talents: [], pvpTalents: [] } as unknown as ReturnType<typeof makeUnit>['info'],
    });
    const combat = makeCombatFull({ 'player-1': owner });

    const cds = extractMajorCooldowns(owner, combat);
    expect(cds.find((c) => c.spellId === '216331')).toBeUndefined();
  });

  it('includes Aura Mastery (31821) for Holy Paladin who cast it', () => {
    const owner = makeUnit('player-1', {
      class: CombatUnitClass.Paladin,
      spec: CombatUnitSpec.Paladin_Holy,
      spellCastEvents: [makeSpellCastEvent('31821', T0 + 60_000, 'player-1')],
    });
    const combat = makeCombatFull({ 'player-1': owner });

    const cds = extractMajorCooldowns(owner, combat);
    expect(cds.find((c) => c.spellId === '31821')).toBeDefined();
  });

  it('does not include Aura Mastery for Retribution Paladin (SPEC_EXCLUSIVE_SPELLS guard)', () => {
    const owner = makeUnit('player-1', {
      class: CombatUnitClass.Paladin,
      spec: CombatUnitSpec.Paladin_Retribution,
      spellCastEvents: [makeSpellCastEvent('31821', T0 + 60_000, 'player-1')],
    });
    const combat = makeCombatFull({ 'player-1': owner });

    const cds = extractMajorCooldowns(owner, combat);
    expect(cds.find((c) => c.spellId === '31821')).toBeUndefined();
  });

  it('includes Ardent Defender (31850) for Protection Paladin who cast it', () => {
    const owner = makeUnit('player-1', {
      class: CombatUnitClass.Paladin,
      spec: CombatUnitSpec.Paladin_Protection,
      spellCastEvents: [makeSpellCastEvent('31850', T0 + 45_000, 'player-1')],
    });
    const combat = makeCombatFull({ 'player-1': owner });

    const cds = extractMajorCooldowns(owner, combat);
    expect(cds.find((c) => c.spellId === '31850')).toBeDefined();
  });
});
```

- [ ] **Step 3: Run the tests and verify they all fail**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern="cooldowns.test" --verbose 2>&1 | tail -30
```

Expected: 5 new tests all FAIL (Avenging Crusader / Aura Mastery / Ardent Defender not found because tags are empty).

---

## Task 2: Fix `classMetadata.ts` — Add Missing Tags

**Files:**

- Modify: `packages/parser/src/classMetadata.ts`

- [ ] **Step 1: Add `SpellTag.Offensive` to Avenging Crusader (216331)**

Find line:

```ts
    { spellId: '216331', name: 'Avenging Crusader', tags: [] },
```

Change to:

```ts
    { spellId: '216331', name: 'Avenging Crusader', tags: [SpellTag.Offensive] },
```

- [ ] **Step 2: Add `SpellTag.Offensive` to Crusade variant (231895)**

Find line:

```ts
    { spellId: '231895', name: 'Crusade', tags: [] },
```

Change to:

```ts
    { spellId: '231895', name: 'Crusade', tags: [SpellTag.Offensive] },
```

- [ ] **Step 3: Add `SpellTag.Defensive` to Aura Mastery (31821)**

Find line:

```ts
    { spellId: '31821', name: 'Aura Mastery', tags: [] },
```

Change to:

```ts
    { spellId: '31821', name: 'Aura Mastery', tags: [SpellTag.Defensive] },
```

- [ ] **Step 4: Add `SpellTag.Defensive` to Ardent Defender (31850)**

Find line:

```ts
    { spellId: '31850', name: 'Ardent Defender', tags: [] },
```

Change to:

```ts
    { spellId: '31850', name: 'Ardent Defender', tags: [SpellTag.Defensive] },
```

- [ ] **Step 5: Add `SpellTag.Defensive` to Blessing of Spellwarding (204018)**

Find line:

```ts
    { spellId: '204018', name: 'Blessing of Spellwarding', tags: [] },
```

Change to:

```ts
    { spellId: '204018', name: 'Blessing of Spellwarding', tags: [SpellTag.Defensive] },
```

---

## Task 3: Fix `cooldowns.ts` — Guard Aura Mastery to Holy Only

**Files:**

- Modify: `packages/shared/src/utils/cooldowns.ts`

- [ ] **Step 1: Add Aura Mastery to `SPEC_EXCLUSIVE_SPELLS`**

Find the Paladin section of `SPEC_EXCLUSIVE_SPELLS` (around line 53):

```ts
  // Paladin
  '498': [CombatUnitSpec.Paladin_Holy], // Divine Protection
  '6940': [CombatUnitSpec.Paladin_Holy], // Blessing of Sacrifice
  '199448': [CombatUnitSpec.Paladin_Holy], // Blessing of Sacrifice
  '210294': [CombatUnitSpec.Paladin_Holy], // Divine Favor
  '86659': [CombatUnitSpec.Paladin_Protection], // Guardian of Ancient Kings
  '337851': [CombatUnitSpec.Paladin_Protection], // Guardian of Ancient Kings
  '337852': [CombatUnitSpec.Paladin_Protection], // Reign of Ancient Kings
  '228049': [CombatUnitSpec.Paladin_Protection], // Guardian of the Forgotten Queen
```

Change to (add the two new lines):

```ts
  // Paladin
  '498': [CombatUnitSpec.Paladin_Holy], // Divine Protection
  '6940': [CombatUnitSpec.Paladin_Holy], // Blessing of Sacrifice
  '199448': [CombatUnitSpec.Paladin_Holy], // Blessing of Sacrifice
  '210294': [CombatUnitSpec.Paladin_Holy], // Divine Favor
  '31821': [CombatUnitSpec.Paladin_Holy], // Aura Mastery
  '86659': [CombatUnitSpec.Paladin_Protection], // Guardian of Ancient Kings
  '337851': [CombatUnitSpec.Paladin_Protection], // Guardian of Ancient Kings
  '337852': [CombatUnitSpec.Paladin_Protection], // Reign of Ancient Kings
  '228049': [CombatUnitSpec.Paladin_Protection], // Guardian of the Forgotten Queen
  '31850': [CombatUnitSpec.Paladin_Protection], // Ardent Defender
```

---

## Task 4: Run Tests and Commit

**Files:**

- No new files; verifying prior changes compile and pass.

- [ ] **Step 1: Run full test suite**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern="cooldowns.test" --verbose 2>&1 | tail -40
```

Expected: All 5 new `extractMajorCooldowns` tests PASS. No regressions in existing tests.

- [ ] **Step 2: Run lint**

```bash
npm run lint -w @wowarenalogs/parser && npm run lint -w @wowarenalogs/shared
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 3: Run full test suite**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/parser/src/classMetadata.ts \
        packages/shared/src/utils/cooldowns.ts \
        packages/shared/src/utils/__tests__/cooldowns.test.ts
git commit -m "feat(timeline): promote untagged Paladin major CDs to [OWNER CD] (F86)"
```

---

## Self-Review

**Spec coverage:**

- ✅ Avenging Crusader promoted from `[OWNER CAST]` to `[OWNER CD]` — tagged `Offensive`, tested
- ✅ Aura Mastery promoted — tagged `Defensive`, guarded to Holy via `SPEC_EXCLUSIVE_SPELLS`, tested
- ✅ Ardent Defender promoted — tagged `Defensive`, guarded to Protection via `SPEC_EXCLUSIVE_SPELLS`, tested
- ✅ Blessing of Spellwarding promoted — tagged `Defensive`, talent-tree filter handles spec exclusivity
- ✅ Crusade variant (231895) promoted — tagged `Offensive`, cast-evidence filter handles spec

**Placeholder scan:** None found.

**Type consistency:** All code uses existing types (`SpellTag`, `CombatUnitSpec`, `IMajorCooldownInfo`) — no new types introduced.

**Side effect:** Spells promoted to `[OWNER CD]` are automatically removed from `[OWNER CAST]` because the deduplication check in `buildMatchTimeline` already skips spells tracked in `ownerCDs`:

```ts
// utils.ts line ~1775
if (trackedSet && (trackedSet.has(tsMs) || ...)) continue;
```

No change needed in `utils.ts`.

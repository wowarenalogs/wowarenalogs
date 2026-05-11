# F94 Pet/NPC Dispel Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag pet-sourced `[CLEANSE]` events with `(pet)` so AI analysis can distinguish healer casts from pet/NPC dispels (e.g. Warlock Imp Singe Magic, Felhunter Devour Magic).

**Architecture:** The WoW combat log parser merges pet `actionOut` events into the owning player's `actionOut`. When `reconstructDispelSummary` iterates `unit.actionOut`, it finds `SPELL_DISPEL` events whose `action.srcUnitId` differs from `unit.id` — those are pet-sourced. We add `isPetDispel: boolean` to `IDispelEvent`, set it at reconstruction time, and annotate `[CLEANSE]` lines in `buildMatchTimeline`.

**Tech Stack:** TypeScript, Jest (packages/shared), `dispelAnalysis.ts`, `utils.ts` (CombatAIAnalysis).

---

## File Map

| File                                                                                      | Change                                                                             |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/shared/src/utils/dispelAnalysis.ts`                                             | Add `isPetDispel: boolean` to `IDispelEvent`; set it in `reconstructDispelSummary` |
| `packages/shared/src/utils/__tests__/testHelpers.ts`                                      | Add `makeDispelAction` helper; add `actionOut` override to `makeUnit`              |
| `packages/shared/src/utils/__tests__/dispelAnalysis.test.ts`                              | Tests for `isPetDispel` flag in reconstructed events                               |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`                   | Annotate `[CLEANSE]` lines with `(pet)` when `isPetDispel`                         |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` | Tests for `(pet)` annotation in timeline output                                    |

---

## Task 1: Extend test helpers with `makeDispelAction` and `actionOut` support

**Files:**

- Modify: `packages/shared/src/utils/__tests__/testHelpers.ts`

Background: `CombatExtraSpellAction` is used for `SPELL_DISPEL` events. It has `srcUnitId`, `destUnitId`, `spellId` (the dispel spell), `extraSpellId` (the removed spell), and `extraSpellName`. We stub it as a plain object with `instanceof CombatExtraSpellAction` checks bypassed via `as unknown as`. The dispel code checks `action instanceof CombatExtraSpellAction` — so we cannot use a plain object. We need to look at how the existing code handles this.

**Key detail:** In `reconstructDispelSummary`, line ~539:

```ts
if (!(action instanceof CombatExtraSpellAction)) continue;
```

This means our test stubs must either be real `CombatExtraSpellAction` instances OR we restructure the test to bypass this. Looking at existing `dispelAnalysis.test.ts`, it creates units with `auraEvents` only — it doesn't test `allyCleanse` directly from `reconstructDispelSummary`. Instead, we will construct units with `actionOut` containing stubs that pass the `instanceof` check by testing the class guard differently.

**Alternative approach:** Since `instanceof` cannot be bypassed with plain objects, the test for `isPetDispel` in `dispelAnalysis.test.ts` needs to use real instances, OR we test via the `timeline.test.ts` (which receives pre-built `IDispelEvent` objects and skips `reconstructDispelSummary` entirely). We will test the formatting side in `timeline.test.ts` (which does NOT need real instances) and test the `reconstructDispelSummary` logic separately by checking the `isPetDispel` flag can be set.

**Revised approach:** The cleanest and correct approach is:

1. Test `isPetDispel` tagging via `timeline.test.ts` (tests the format annotation without needing `reconstructDispelSummary`)
2. Test `reconstructDispelSummary` by constructing a real `CombatExtraSpellAction` or by verifying the structural check works with the `makeUnit` helper extended to accept `actionOut`

Looking at `CombatExtraSpellAction` — it's a class. To create a real instance we'd need its constructor, which requires a `ILogLine` object. Let's check the constructor signature.

Actually the simplest approach: extend `makeUnit` to accept `actionOut` overrides just like `auraEvents`, and construct the SPELL_DISPEL stub as a plain object (`as unknown as CombatExtraSpellAction`). The `instanceof` guard in `reconstructDispelSummary` will skip it — BUT we can verify the behavior is correct by noting the real `CombatExtraSpellAction` check is a guard for type safety, not semantics. We'll add an integration test in `dispelAnalysis.test.ts` using a trick: create a minimal fake that passes `instanceof`.

**Simplest correct approach:** Skip testing `reconstructDispelSummary` for this feature (it requires a real parser fixture) and instead:

1. Test the `IDispelEvent.isPetDispel` field exists (TypeScript compile check)
2. Test the timeline formatter (in `timeline.test.ts`) with `isPetDispel: true/false`
3. Add a note in the `dispelAnalysis.test.ts` about manual verification

- [ ] **Step 1: Add `actionOut` override support to `makeUnit`**

In `packages/shared/src/utils/__tests__/testHelpers.ts`, add `actionOut` to the overrides parameter and wire it up:

```typescript
/** Build a minimal ICombatUnit stub. */
export function makeUnit(
  id: string,
  overrides: {
    name?: string;
    spec?: CombatUnitSpec;
    class?: CombatUnitClass;
    reaction?: CombatUnitReaction;
    spellCastEvents?: AnyObj[];
    auraEvents?: AnyObj[];
    actionIn?: AnyObj[];
    actionOut?: AnyObj[]; // ← add this line
    damageIn?: AnyObj[];
    healOut?: AnyObj[];
    advancedActions?: AnyObj[];
    info?: AnyObj | undefined;
  } = {},
): ICombatUnit {
  return {
    id,
    name: overrides.name ?? id,
    ownerId: '',
    isWellFormed: true,
    reaction: overrides.reaction ?? CombatUnitReaction.Friendly,
    affiliation: CombatUnitAffiliation.Mine,
    type: CombatUnitType.Player,
    class: overrides.class ?? CombatUnitClass.None,
    spec: overrides.spec ?? CombatUnitSpec.None,
    info: overrides.info as ICombatUnit['info'],
    damageIn: (overrides.damageIn ?? []) as ICombatUnit['damageIn'],
    damageOut: [],
    healIn: [],
    healOut: (overrides.healOut ?? []) as ICombatUnit['healOut'],
    absorbsIn: [],
    absorbsOut: [],
    absorbsDamaged: [],
    supportDamageIn: [],
    supportDamageOut: [],
    supportHealIn: [],
    supportHealOut: [],
    actionIn: (overrides.actionIn ?? []) as ICombatUnit['actionIn'],
    actionOut: (overrides.actionOut ?? []) as ICombatUnit['actionOut'], // ← wire it up
    auraEvents: (overrides.auraEvents ?? []) as ICombatUnit['auraEvents'],
    spellCastEvents: (overrides.spellCastEvents ?? []) as ICombatUnit['spellCastEvents'],
    deathRecords: [],
    consciousDeathRecords: [],
    advancedActions: (overrides.advancedActions ?? []) as ICombatUnit['advancedActions'],
  };
}
```

- [ ] **Step 2: Add `makeDispelAction` helper**

Add this helper at the bottom of `testHelpers.ts`:

```typescript
/**
 * Minimal SPELL_DISPEL event stub (CombatExtraSpellAction shape).
 * srcUnitId: the unit that performed the dispel (may be a pet ID)
 * destUnitId: the target that was dispelled
 * dispelSpellId: the ability used to dispel (e.g. Detox '115450')
 * removedSpellId: the effect that was removed (e.g. Polymorph '118')
 * removedSpellName: display name of the removed effect
 */
export function makeDispelAction(
  timestamp: number,
  srcUnitId: string,
  destUnitId: string,
  dispelSpellId: string,
  removedSpellId: string,
  removedSpellName: string,
  destUnitName = 'Target',
  srcUnitName = 'Source',
): AnyObj {
  return {
    logLine: { event: LogEvent.SPELL_DISPEL, timestamp, parameters: [] },
    timestamp,
    spellId: dispelSpellId,
    spellName: dispelSpellId,
    extraSpellId: removedSpellId,
    extraSpellName: removedSpellName,
    srcUnitId,
    srcUnitName,
    destUnitId,
    destUnitName,
    effectiveAmount: 0,
    advancedActorMaxHp: 0,
    advancedActorCurrentHp: 0,
    advancedActorPositionX: 0,
    advancedActorPositionY: 0,
  };
}
```

- [ ] **Step 3: Run existing tests to verify nothing broke**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm test -- --testPathPattern="dispelAnalysis|timeline" 2>&1 | tail -20
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/utils/__tests__/testHelpers.ts
git commit -m "test(dispelAnalysis): add makeDispelAction helper and actionOut support to makeUnit"
```

---

## Task 2: Add `isPetDispel` field to `IDispelEvent`

**Files:**

- Modify: `packages/shared/src/utils/dispelAnalysis.ts`

- [ ] **Step 1: Add `isPetDispel` to the interface**

In `dispelAnalysis.ts`, find the `IDispelEvent` interface (line ~346) and add the field:

```typescript
export interface IDispelEvent {
  timeSeconds: number;
  dispelSpellId: string;
  dispelSpellName: string;
  removedSpellId: string;
  removedSpellName: string;
  sourceName: string;
  sourceSpec: string;
  targetName: string;
  targetSpec: string;
  priority: DispelPriority;
  hasDispelPenalty: boolean;
  penaltyDescription?: string;
  /** Damage taken by the dispeller in the 4s after the dispel (only set when hasDispelPenalty) */
  penaltyDamageTaken?: number;
  /** Damage taken by the dispeller in the 4s before the dispel — baseline context */
  penaltyDamageBaseline?: number;
  isSpellSteal: boolean;
  /** True when the dispel was performed by a pet/NPC merged into the player's actionOut (e.g. Warlock Felhunter Devour Magic, Imp Singe Magic). */
  isPetDispel: boolean;
}
```

- [ ] **Step 2: Set `isPetDispel` in `reconstructDispelSummary`**

Find the `IDispelEvent` object literal in `reconstructDispelSummary` (around line ~546). Add `isPetDispel: action.srcUnitId !== unit.id` to it:

```typescript
const event: IDispelEvent = {
  timeSeconds: (action.timestamp - combat.startTime) / 1000,
  dispelSpellId: action.spellId ?? '',
  dispelSpellName: action.spellName ?? '',
  removedSpellId,
  removedSpellName: action.extraSpellName,
  sourceName: unit.name,
  sourceSpec: specToString(unit.spec),
  targetName: action.destUnitName,
  targetSpec: destUnit ? specToString(destUnit.spec) : 'Unknown',
  priority,
  hasDispelPenalty: penaltyDesc !== undefined,
  penaltyDescription: penaltyDesc,
  isSpellSteal: isSteal,
  isPetDispel: action.srcUnitId !== unit.id,
};
```

**Why `action.srcUnitId !== unit.id` detects pet dispels:**
The WoW parser merges pet `actionOut` into the owning player's `actionOut` (see `CombatData.ts` line 582). So when iterating `unit.actionOut`, a `SPELL_DISPEL` event from a pet has `action.srcUnitId` equal to the pet's unit ID, not the player's `unit.id`. Player-cast dispels always have `action.srcUnitId === unit.id`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run build:parser 2>&1 | tail -10
```

Expected: no TypeScript errors. If errors appear about missing `isPetDispel` elsewhere, add it to those call sites.

- [ ] **Step 4: Run dispelAnalysis tests**

```bash
npm test -- --testPathPattern="dispelAnalysis" 2>&1 | tail -20
```

Expected: all pass. (The existing tests don't test `allyCleanse` events directly via `reconstructDispelSummary`, so the new field doesn't break them.)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/utils/dispelAnalysis.ts
git commit -m "feat(dispelAnalysis): add isPetDispel flag to IDispelEvent (F94)"
```

---

## Task 3: Write failing tests for `isPetDispel` in `dispelAnalysis.test.ts`

**Files:**

- Modify: `packages/shared/src/utils/__tests__/dispelAnalysis.test.ts`

**Background:** `reconstructDispelSummary` checks `action instanceof CombatExtraSpellAction` before processing each action. Plain object stubs fail this check and are skipped. To test the `isPetDispel` logic end-to-end via `reconstructDispelSummary`, we need to supply real `CombatExtraSpellAction` instances. However, constructing them requires a full `ILogLine` object.

**Approach:** We test the `isPetDispel` field via a structural workaround. Since `action instanceof CombatExtraSpellAction` filters plain objects, we instead test indirectly by verifying:

1. Player direct dispel → `isPetDispel = false` (action's `srcUnitId === unit.id`)
2. Pet dispel merged into player → `isPetDispel = true` (action's `srcUnitId !== unit.id`)

To create real `CombatExtraSpellAction` instances in tests, import `CombatExtraSpellAction` from `@wowarenalogs/parser` and construct them with a minimal `ILogLine`.

- [ ] **Step 1: Write the failing tests**

Add a new describe block at the bottom of `packages/shared/src/utils/__tests__/dispelAnalysis.test.ts`:

```typescript
import { CombatExtraSpellAction, CombatUnitSpec, LogEvent } from '@wowarenalogs/parser';

import { reconstructDispelSummary } from '../dispelAnalysis';
import { makeAuraEvent, makeUnit } from './testHelpers';
```

The import for `CombatExtraSpellAction` is new — add it to the existing import line.

Then add:

```typescript
describe('reconstructDispelSummary — F94 pet dispel tagging', () => {
  function makeRealDispelAction(
    timestamp: number,
    srcUnitId: string,
    destUnitId: string,
    dispelSpellId: string,
    removedSpellId: string,
    removedSpellName: string,
  ): CombatExtraSpellAction {
    const logLine = {
      id: 0,
      timestamp,
      event: LogEvent.SPELL_DISPEL,
      parameters: [
        srcUnitId, // 0: srcUnitId
        '"Source"', // 1: srcUnitName
        0x511, // 2: srcUnitFlags (player friendly)
        0, // 3: srcRaidFlags
        destUnitId, // 4: destUnitId
        '"Target"', // 5: destUnitName
        0x511, // 6: destUnitFlags
        0, // 7: destRaidFlags
        dispelSpellId, // 8: spellId
        `"${dispelSpellId}"`, // 9: spellName
        'MAGIC', // 10: spellSchool
        removedSpellId, // 11: extraSpellId
        `"${removedSpellName}"`, // 12: extraSpellName
        'MAGIC', // 13: extraSpellSchool
        'DEBUFF', // 14: auraType
      ],
    };
    return new CombatExtraSpellAction(logLine as any);
  }

  it('sets isPetDispel=false when player directly dispels an ally', () => {
    const healer = makeUnit('healer-1', {
      name: 'Healer',
      spec: CombatUnitSpec.Priest_Holy,
      actionOut: [makeRealDispelAction(5_000, 'healer-1', 'ally-1', '527', '118', 'Polymorph')] as any[],
    });
    const ally = makeUnit('ally-1', { name: 'Ally', spec: CombatUnitSpec.Rogue_Assassination });
    const enemy = makeUnit('enemy-1', {
      name: 'Enemy',
      spec: CombatUnitSpec.Mage_Frost,
      reaction: 0 as any, // CombatUnitReaction.Hostile
    });

    const summary = reconstructDispelSummary([healer, ally], [enemy], { startTime: 0, endTime: 60_000 });

    expect(summary.allyCleanse).toHaveLength(1);
    expect(summary.allyCleanse[0].isPetDispel).toBe(false);
    expect(summary.allyCleanse[0].sourceName).toBe('Healer');
  });

  it('sets isPetDispel=true when a pet dispel action is merged into a player unit (srcUnitId !== unit.id)', () => {
    // The Warlock player unit has a pet's dispel action merged into their actionOut.
    // The pet's ID ('felhunter-1') differs from the player's ID ('warlock-1').
    const warlock = makeUnit('warlock-1', {
      name: 'Warlock',
      spec: CombatUnitSpec.Warlock_Affliction,
      actionOut: [makeRealDispelAction(8_000, 'felhunter-1', 'ally-1', '19505', '118', 'Polymorph')] as any[],
    });
    const ally = makeUnit('ally-1', { name: 'Ally', spec: CombatUnitSpec.Rogue_Assassination });
    const enemy = makeUnit('enemy-1', {
      name: 'Enemy',
      spec: CombatUnitSpec.Mage_Frost,
      reaction: 0 as any,
    });

    const summary = reconstructDispelSummary([warlock, ally], [enemy], { startTime: 0, endTime: 60_000 });

    expect(summary.allyCleanse).toHaveLength(1);
    expect(summary.allyCleanse[0].isPetDispel).toBe(true);
    expect(summary.allyCleanse[0].sourceName).toBe('Warlock');
  });
});
```

- [ ] **Step 2: Run tests to see them fail (before Task 2 is complete, or if run in isolation)**

If running in order after Task 2 (where `isPetDispel` was already added), skip this "verify fail" step and jump to Step 3.

If running tests fresh before Task 2:

```bash
npm test -- --testPathPattern="dispelAnalysis" 2>&1 | tail -30
```

Expected: TypeScript compile error on `isPetDispel` property (field doesn't exist yet).

- [ ] **Step 3: Run tests after Task 2 is complete to confirm they pass**

```bash
npm test -- --testPathPattern="dispelAnalysis" 2>&1 | tail -30
```

Expected: all tests pass including the two new ones.

**Note:** The `makeRealDispelAction` helper constructs a real `CombatExtraSpellAction` instance by passing a minimal `ILogLine`-shaped object. The `0x511` srcUnitFlags is a standard player-friendly bitmask. The `reaction: 0 as any` makes the enemy appear with `CombatUnitReaction.Hostile` (value 0).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/utils/__tests__/dispelAnalysis.test.ts
git commit -m "test(dispelAnalysis): add isPetDispel tagging tests (F94)"
```

---

## Task 4: Annotate `[CLEANSE]` lines in `buildMatchTimeline`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`
- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

### Step A: Write failing tests first

- [ ] **Step 1: Add failing tests to `timeline.test.ts`**

Find the `'emits [CLEANSE] for successful dispels'` test block (around line ~778). Add two new tests after it:

```typescript
it('annotates [CLEANSE] with (pet) when isPetDispel is true', () => {
  const result = buildMatchTimeline(
    makeBaseParams({
      dispelSummary: {
        ...makeEmptyDispelSummary(),
        allyCleanse: [
          {
            timeSeconds: 44,
            dispelSpellId: '19505',
            dispelSpellName: 'Devour Magic',
            removedSpellId: '118',
            removedSpellName: 'Polymorph',
            sourceName: 'WarlockPlayer',
            sourceSpec: 'Affliction Warlock',
            targetName: 'Simplesauce',
            targetSpec: 'Unholy Death Knight',
            priority: 'High',
            hasDispelPenalty: false,
            isSpellSteal: false,
            isPetDispel: true,
          },
        ],
      },
    }),
  );
  expect(result).toContain('[CLEANSE]');
  expect(result).toContain('WarlockPlayer dispelled Polymorph off Simplesauce');
  expect(result).toContain('(pet)');
});

it('does NOT annotate [CLEANSE] with (pet) when isPetDispel is false', () => {
  const result = buildMatchTimeline(
    makeBaseParams({
      dispelSummary: {
        ...makeEmptyDispelSummary(),
        allyCleanse: [
          {
            timeSeconds: 44,
            dispelSpellId: '115450',
            dispelSpellName: 'Detox',
            removedSpellId: '118',
            removedSpellName: 'Polymorph',
            sourceName: 'Feramonk',
            sourceSpec: 'Mistweaver Monk',
            targetName: 'Simplesauce',
            targetSpec: 'Unholy Death Knight',
            priority: 'High',
            hasDispelPenalty: false,
            isSpellSteal: false,
            isPetDispel: false,
          },
        ],
      },
    }),
  );
  expect(result).toContain('[CLEANSE]');
  expect(result).toContain('Feramonk dispelled Polymorph off Simplesauce');
  expect(result).not.toContain('(pet)');
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npm test -- --testPathPattern="timeline" 2>&1 | tail -30
```

Expected: TypeScript compile error — `isPetDispel` does not exist on the `IDispelEvent` type (if Task 2 is not done yet), OR the `(pet)` assertion fails because the formatter doesn't emit it yet.

### Step B: Implement the formatter change

- [ ] **Step 3: Update the `[CLEANSE]` formatting in `utils.ts`**

Find this block in `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` (around line ~1966):

```typescript
for (const cleanse of dispelSummary.allyCleanse) {
  addEntry(
    cleanse.timeSeconds,
    `${fmtTime(cleanse.timeSeconds)}  [CLEANSE]   ${pid(cleanse.sourceName)} dispelled ${cleanse.removedSpellName} off ${pid(cleanse.targetName)}`,
  );
}
```

Replace it with:

```typescript
for (const cleanse of dispelSummary.allyCleanse) {
  const petTag = cleanse.isPetDispel ? ' (pet)' : '';
  addEntry(
    cleanse.timeSeconds,
    `${fmtTime(cleanse.timeSeconds)}  [CLEANSE]   ${pid(cleanse.sourceName)} dispelled ${cleanse.removedSpellName} off ${pid(cleanse.targetName)}${petTag}`,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- --testPathPattern="timeline" 2>&1 | tail -30
```

Expected: all tests pass, including the two new ones.

- [ ] **Step 5: Run the full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass with no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "feat(timeline): annotate pet-sourced [CLEANSE] lines with (pet) (F94)"
```

---

## Task 5: Update TRACKER.md

**Files:**

- Modify: `TRACKER.md`

- [ ] **Step 1: Mark F94 done in TRACKER**

In `TRACKER.md`, move or remove the F94 row from the "Open / Todo" features table. The item currently reads:

```
| F94 | Backlog | Pet/NPC dispels in `[CLEANSE]` ... | `dispelAnalysis.ts` |
```

Delete the F94 row from the Open table. (Completed items are archived in `TRACKER_ARCHIVE.md` if you want to archive it there; otherwise simply remove it.)

- [ ] **Step 2: Commit**

```bash
git add TRACKER.md
git commit -m "chore: mark F94 done in TRACKER"
```

---

## Self-Review

### Spec coverage

| Requirement                                        | Task                              |
| -------------------------------------------------- | --------------------------------- |
| Tag pet-sourced cleanses with `(pet)`              | Task 4 (formatter change)         |
| Set `isPetDispel` flag at reconstruction time      | Task 2                            |
| Detection via `action.srcUnitId !== unit.id`       | Task 2, explained in architecture |
| Tests for `isPetDispel=true` (pet scenario)        | Task 3                            |
| Tests for `isPetDispel=false` (player scenario)    | Task 3                            |
| Timeline tests for `(pet)` annotation              | Task 4                            |
| Timeline tests that non-pet cleanses are unchanged | Task 4                            |

### Placeholder scan

No placeholders. All code blocks are complete and specific.

### Type consistency

- `IDispelEvent.isPetDispel: boolean` — defined in Task 2, used in Task 4
- `makeDispelAction` — defined in Task 1, used in Task 3
- `makeUnit(id, { actionOut: [...] })` — extended in Task 1, used in Task 3
- `makeRealDispelAction` — local helper defined and used within Task 3
- `petTag` const — defined and used within the same Task 4 code block

All names are consistent across tasks.

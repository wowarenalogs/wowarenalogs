# F92: Annotate [OWNER CAST] When Target Is a Totem/Pet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Append `[totem/pet]` to `[OWNER CAST]` timeline lines when the spell's target unit is a Guardian (totem) or Pet, so Claude knows the cast was wasted.

**Architecture:** WoW combat log events carry `destUnitFlags` on every `CombatAction`. `getUnitType(flags)` from `@wowarenalogs/parser` decodes the flag into `CombatUnitType.Guardian` (totems) or `CombatUnitType.Pet`. In `buildMatchTimeline`'s `[OWNER CAST]` section in `utils.ts`, we check this flag after resolving the target label and append `[totem/pet]` when it matches. The flag is already on the `CombatAction` object (`spellCastEvents` is `CombatAction[]`); no upstream data change is needed.

**Tech Stack:** TypeScript 4.6, Jest (via TSDX), `packages/shared`

---

## File Map

| Action | Path                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------- |
| Modify | `packages/shared/src/utils/__tests__/testHelpers.ts:63–86`                                                      |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`                       |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts:1` (add import) and `utils.ts:1794–1796` |

---

### Task 1: Add `destUnitFlags` to test helper + write failing test

**Files:**

- Modify: `packages/shared/src/utils/__tests__/testHelpers.ts`
- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Add `destUnitFlags` param to `makeSpellCastEvent`**

In `packages/shared/src/utils/__tests__/testHelpers.ts`, find `makeSpellCastEvent` (line 63) and replace it with:

```typescript
export function makeSpellCastEvent(
  spellId: string,
  timestamp: number,
  destUnitId: string,
  destUnitName = 'Target',
  srcUnitId = 'player-1',
  srcUnitName = 'Player',
  destUnitFlags = 0,
): AnyObj {
  return {
    logLine: { event: LogEvent.SPELL_CAST_SUCCESS, timestamp, parameters: [] },
    timestamp,
    spellId,
    spellName: spellId,
    srcUnitId,
    srcUnitName,
    destUnitId,
    destUnitName,
    destUnitFlags,
    effectiveAmount: 0,
    advancedActorMaxHp: 0,
    advancedActorCurrentHp: 0,
    advancedActorPositionX: 0,
    advancedActorPositionY: 0,
  };
}
```

All existing callers pass at most 6 args; the new 7th param defaults to `0`, which `getUnitType` decodes as `CombatUnitType.None` — no behavior change for existing tests.

- [ ] **Step 2: Write the failing test**

In `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`, find the describe block `'buildMatchTimeline — [OWNER CAST] target resolution'` (around line 860) and add these two tests at the end of that block:

```typescript
it('appends [totem/pet] when [OWNER CAST] target is a Guardian (totem, destUnitFlags 0x2000)', () => {
  const GUARDIAN_FLAGS = 0x00002000;
  const result = buildMatchTimeline(
    makeBaseParams({
      owner: {
        ...makeOwner('Feramonk'),
        spellCastEvents: [
          makeSpellCastEvent('88625', 30_000, 'totem-1', 'Tremor Totem', 'player-1', 'Feramonk', GUARDIAN_FLAGS),
        ],
      } as any,
    }),
  );
  expect(result).toContain('[OWNER CAST]');
  expect(result).toContain('[totem/pet]');
  expect(result).toContain('Tremor Totem');
});

it('appends [totem/pet] when [OWNER CAST] target is a Pet (destUnitFlags 0x1000)', () => {
  const PET_FLAGS = 0x00001000;
  const result = buildMatchTimeline(
    makeBaseParams({
      owner: {
        ...makeOwner('Feramonk'),
        spellCastEvents: [makeSpellCastEvent('33206', 30_000, 'pet-1', 'Fluffy', 'player-1', 'Feramonk', PET_FLAGS)],
      } as any,
    }),
  );
  expect(result).toContain('[OWNER CAST]');
  expect(result).toContain('[totem/pet]');
});
```

Note: `makeOwner` returns a minimal `ICombatUnit`; we spread and add `spellCastEvents`. The `as any` cast is needed because `makeOwner` returns a partial. `'88625'` = Holy Word: Chastise (Priest CC); `'33206'` = Pain Suppression (both are in `HEALER_CAST_SPELL_ID_TO_NAME` or will pass via `e.spellName` fallback — see implementation note below).

Actually, `'88625'` is NOT in `HEALER_CAST_SPELL_ID_TO_NAME`. It will fall through to `e.spellName` which equals `e.spellId` in the mock (`'88625'`), so `displayName = '88625'` which is truthy. The cast will appear. Use `'33206'` (Pain Suppression, which IS in the map) for the pet test. For the totem test, `'88625'` works via spellName fallback.

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -w @wowarenalogs/shared -- --testPathPattern="timeline" --verbose 2>&1 | grep -E "PASS|FAIL|totem|pet|●" | head -20
```

Expected: the two new tests FAIL (the annotation isn't implemented yet).

- [ ] **Step 4: Commit**

```bash
git -C /Users/mingjianliu/code/wowarenalogs add \
  packages/shared/src/utils/__tests__/testHelpers.ts \
  packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git -C /Users/mingjianliu/code/wowarenalogs commit -m "test(timeline): add failing tests for totem/pet [OWNER CAST] annotation (F92)"
```

---

### Task 2: Implement the `[totem/pet]` annotation

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Add imports for `getUnitType` and `CombatUnitType`**

Line 1 of `utils.ts` currently reads:

```typescript
import { ICombatUnit, LogEvent } from '@wowarenalogs/parser';
```

Replace with:

```typescript
import { CombatUnitType, getUnitType, ICombatUnit, LogEvent } from '@wowarenalogs/parser';
```

- [ ] **Step 2: Add the annotation in the `[OWNER CAST]` loop**

Find this block (around lines 1794–1796):

```typescript
const targetLabel = resolveTarget(e.destUnitName);
const targetPart = targetLabel ? ` → ${targetLabel}` : '';
addEntry(timeSeconds, `${fmtTime(timeSeconds)}  [OWNER CAST]   ${displayName}${targetPart}${orderNote}`);
```

Replace with:

```typescript
const targetLabel = resolveTarget(e.destUnitName);
const targetPart = targetLabel ? ` → ${targetLabel}` : '';
const destType = getUnitType(e.destUnitFlags ?? 0);
const totemNote = destType === CombatUnitType.Guardian || destType === CombatUnitType.Pet ? ' [totem/pet]' : '';
addEntry(timeSeconds, `${fmtTime(timeSeconds)}  [OWNER CAST]   ${displayName}${targetPart}${totemNote}${orderNote}`);
```

- [ ] **Step 3: Run timeline tests to verify new tests pass**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -w @wowarenalogs/shared -- --testPathPattern="timeline" --verbose 2>&1 | grep -E "PASS|FAIL|totem|pet|●" | head -20
```

Expected: the two new tests PASS; all prior tests still pass.

- [ ] **Step 4: Run the full shared test suite**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -w @wowarenalogs/shared 2>&1 | tail -10
```

Expected: 0 failures.

- [ ] **Step 5: Commit**

```bash
git -C /Users/mingjianliu/code/wowarenalogs add \
  packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git -C /Users/mingjianliu/code/wowarenalogs commit -m "feat(timeline): annotate [OWNER CAST] with [totem/pet] for wasted casts (F92)"
```

---

## Self-Review

**Spec coverage:** F92 says annotate `[OWNER CAST]` when target is totem/pet. The `[totem/pet]` suffix on the emitted line covers this. Test covers both Guardian (totem) and Pet unit types.

**Placeholder scan:** No placeholders — all code is complete. Exact flag constants (`0x00002000`, `0x00001000`) are from `parser/src/utils.ts` switch cases and verified against the `getUnitType` implementation.

**Type consistency:** `getUnitType` returns `CombatUnitType`; comparison with `CombatUnitType.Guardian` and `CombatUnitType.Pet` is type-safe. `e.destUnitFlags` is `number` on `CombatAction`; `?? 0` guards against the test mock where the field may be absent.

**Edge cases:** `destUnitFlags = 0` → `getUnitType(0)` returns `CombatUnitType.None` → `totemNote = ''` — existing tests unaffected. `orderNote` (the `[completed before CC landed]` annotation) appears after `[totem/pet]`, so both annotations can coexist.

**Note on `[OWNER CD]` path:** The `[OWNER CD]` loop (lines 1704–1744) uses `cast.targetName` from `IMajorCooldownInfo.casts` which is a different data structure with no unit flags. F92 is scoped to `[OWNER CAST]` only; `[OWNER CD]` is out of scope.

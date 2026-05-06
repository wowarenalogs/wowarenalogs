# B11: Stolen-Buff Dispel False-Positive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `dispelAnalysis.ts` from flagging "missed cleanse" on buffs that landed on a friendly via Spellsteal/Devour Magic (e.g. friendly Mage spellsteals enemy Blessing of Freedom — buff is now on the Mage, sourced from the original enemy paladin, but is not a debuff and cannot be cleansed).

**Architecture:** The bug lives in `reconstructDispelSummary` (`packages/shared/src/utils/dispelAnalysis.ts`). The missed-cleanse loop iterates aura events on friendlies whose `srcUnitId` is enemy. Stolen buffs satisfy that condition because the WoW combat log preserves the _original_ caster as `srcUnit` after Spellsteal. The fix is to filter aura events by their auraType marker (combat-log parameter index 11 — `'BUFF'` vs `'DEBUFF'`) and only treat `DEBUFF` rows as cleanse candidates. We apply the symmetric `'BUFF'` filter in the missed-purge loop so a debuff briefly landing on an enemy via reflect/cross-team weirdness can never count toward "missed purge."

**Tech Stack:** TypeScript, Jest (`tsdx test`), `@wowarenalogs/parser` types (`ICombatUnit`, `LogEvent`).

---

## File Structure

- Modify: `packages/shared/src/utils/dispelAnalysis.ts` — add auraType helper + filter in missed-cleanse and missed-purge loops.
- Create: `packages/shared/src/utils/__tests__/dispelAnalysis.test.ts` — regression tests for stolen-buff false positive and ordinary debuff path.
- Modify: `packages/shared/src/utils/__tests__/testHelpers.ts` — extend `makeAuraEvent` to optionally set auraType in `parameters[11]`.
- Modify: `TRACKER.md` — move B11 from Open to fixed (or annotate as resolved per repo convention).

---

## Task 1: Extend test helper to allow auraType in fixtures

**Files:**

- Modify: `packages/shared/src/utils/__tests__/testHelpers.ts:88-109`

The current `makeAuraEvent` writes `parameters: []`. The fix in `dispelAnalysis.ts` will read `parameters[11]`. Tests must be able to seed it. Add an optional `auraType` argument that places the marker at index 11, leaving earlier slots as empty strings (the upstream parser fills indices 0–10 from real log lines, but for our tests only [11] is read).

- [ ] **Step 1: Read the current helper to confirm shape**

Run: open `packages/shared/src/utils/__tests__/testHelpers.ts` and confirm the `makeAuraEvent` signature ends at line ~109 with `parameters: []`.

- [ ] **Step 2: Edit `makeAuraEvent` to accept an `auraType` parameter**

Replace the function body so the signature is:

```typescript
export function makeAuraEvent(
  event: LogEvent,
  spellId: string,
  timestamp: number,
  srcUnitId = 'enemy-1',
  destUnitId = 'player-1',
  auraType: 'BUFF' | 'DEBUFF' = 'DEBUFF',
): AnyObj {
  // parameters[11] is the BUFF/DEBUFF marker for SPELL_AURA_* events.
  // Earlier slots are left empty — production parses them but our tests don't read them.
  const parameters: (string | number)[] = [];
  parameters[11] = auraType;
  return {
    logLine: { event, timestamp, parameters },
    timestamp,
    spellId,
    spellName: spellId,
    srcUnitId,
    srcUnitName: 'Source',
    destUnitId,
    destUnitName: 'Target',
    effectiveAmount: 0,
    advancedActorMaxHp: 0,
    advancedActorCurrentHp: 0,
  };
}
```

- [ ] **Step 3: Verify existing tests still compile**

Run: `npx tsdx test --testPathPattern packages/shared/src/utils/__tests__ --listTests` from `packages/shared`.
Expected: lists existing test files without TypeScript errors. (The new optional parameter defaults to `'DEBUFF'`, so existing call sites are unaffected.)

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/utils/__tests__/testHelpers.ts
git commit -m "test(shared): allow makeAuraEvent to set BUFF/DEBUFF marker"
```

---

## Task 2: Write the failing regression test

**Files:**

- Create: `packages/shared/src/utils/__tests__/dispelAnalysis.test.ts`

Reproduce the B11 scenario: a friendly Mage spellsteals enemy Blessing of Freedom. The combat log emits `SPELL_AURA_APPLIED` on the friendly Mage with `srcUnitId` = enemy paladin, `auraType` = `'BUFF'`. Today this slips into `missedCleanseWindows`. After the fix it must not.

Also include a positive control: an enemy Polymorph (DEBUFF) on a friendly with no removal — must continue to appear as a missed cleanse.

- [ ] **Step 1: Write the failing test file**

```typescript
import { CombatUnitSpec, LogEvent } from '@wowarenalogs/parser';

import { reconstructDispelSummary } from '../dispelAnalysis';
import { makeAuraEvent } from './testHelpers';

// Minimal ICombatUnit-shaped stub — only fields read by reconstructDispelSummary.
function makeUnit(opts: {
  id: string;
  name: string;
  spec: CombatUnitSpec;
  auraEvents?: ReturnType<typeof makeAuraEvent>[];
}): any {
  return {
    id: opts.id,
    name: opts.name,
    spec: opts.spec,
    auraEvents: opts.auraEvents ?? [],
    actionOut: [],
    damageIn: [],
    spellCastEvents: [],
    info: undefined,
  };
}

const COMBAT = { startTime: 0, endTime: 60_000 };

describe('reconstructDispelSummary — B11 stolen-buff false positive', () => {
  it('does NOT flag a missed cleanse when a friendly Mage spellsteals an enemy Blessing of Freedom (buff lands on friendly with enemy as srcUnit)', () => {
    const friendlyMage = makeUnit({
      id: 'mage-1',
      name: 'FriendlyMage',
      spec: CombatUnitSpec.Mage_Frost,
      // 1044 = Blessing of Freedom (buffs_defensive → priority High; dispelType Magic).
      // After Spellsteal the buff is on the Mage, srcUnit is the original enemy Paladin,
      // auraType is BUFF — exactly the conditions that today's missed-cleanse loop misreads.
      auraEvents: [makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '1044', 5_000, 'enemy-pal', 'mage-1', 'BUFF')],
    });
    const friendlyHealer = makeUnit({
      id: 'priest-1',
      name: 'FriendlyHealer',
      spec: CombatUnitSpec.Priest_Holy, // Magic cleanser
    });
    const enemyPaladin = makeUnit({
      id: 'enemy-pal',
      name: 'EnemyPaladin',
      spec: CombatUnitSpec.Paladin_Retribution,
    });

    const summary = reconstructDispelSummary([friendlyMage, friendlyHealer], [enemyPaladin], COMBAT);

    expect(summary.missedCleanseWindows).toHaveLength(0);
    const totalCC = summary.ccEfficiency.reduce((s, e) => s + e.totalCCWindows, 0);
    expect(totalCC).toBe(0);
  });

  it('still flags a missed cleanse for a real enemy debuff (Polymorph on friendly, never removed)', () => {
    const friendlyDps = makeUnit({
      id: 'rogue-1',
      name: 'FriendlyRogue',
      spec: CombatUnitSpec.Rogue_Assassination,
      // 118 = Polymorph. Real debuff applied by enemy.
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '118', 5_000, 'enemy-mage', 'rogue-1', 'DEBUFF'),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '118', 13_000, 'enemy-mage', 'rogue-1', 'DEBUFF'),
      ],
    });
    const friendlyHealer = makeUnit({
      id: 'priest-1',
      name: 'FriendlyHealer',
      spec: CombatUnitSpec.Priest_Holy,
    });
    const enemyMage = makeUnit({
      id: 'enemy-mage',
      name: 'EnemyMage',
      spec: CombatUnitSpec.Mage_Frost,
    });

    const summary = reconstructDispelSummary([friendlyDps, friendlyHealer], [enemyMage], COMBAT);

    expect(summary.missedCleanseWindows).toHaveLength(1);
    expect(summary.missedCleanseWindows[0].spellId).toBe('118');
  });
});
```

- [ ] **Step 2: Run the new tests and verify the first one fails, second passes**

Run: `cd packages/shared && npx tsdx test --testPathPattern dispelAnalysis.test.ts`
Expected:

- The "does NOT flag a missed cleanse" test FAILS — `missedCleanseWindows` has length 1 (the bug).
- The "still flags a missed cleanse for a real enemy debuff" test PASSES.

If both pass, the test fixture is wrong (Freedom may not be priority High/Critical via current `getPriority`) — verify by adding `console.log(summary.missedCleanseWindows)` and confirming the bug repro lands a row before proceeding. Only proceed once the failure is the stolen-buff one.

- [ ] **Step 3: Commit the failing test**

```bash
git add packages/shared/src/utils/__tests__/dispelAnalysis.test.ts
git commit -m "test(shared): add failing B11 regression for stolen-buff false positive"
```

---

## Task 3: Implement the auraType filter in `dispelAnalysis.ts`

**Files:**

- Modify: `packages/shared/src/utils/dispelAnalysis.ts:599-755` (missed-cleanse loop)
- Modify: `packages/shared/src/utils/dispelAnalysis.ts:765-790` (missed-purge loop)

The combat log writes `'BUFF'` or `'DEBUFF'` at parameter index 11 of `SPELL_AURA_APPLIED` / `SPELL_AURA_REMOVED` / `SPELL_AURA_BROKEN(_SPELL)` events. The parser does not surface this as a typed field, so we read it directly from `aura.logLine.parameters[11]`.

- [ ] **Step 1: Add a helper `getAuraType` near the other top-level helpers**

Insert after the `unitCastSpellIds` function (around line 187):

```typescript
/**
 * Extracts the BUFF/DEBUFF marker from an aura event's raw log line.
 * Combat-log parameter index 11 holds this for SPELL_AURA_APPLIED, SPELL_AURA_REMOVED,
 * SPELL_AURA_BROKEN, and SPELL_AURA_REFRESH. Returns null when the marker is absent
 * (e.g. synthetic events from older fixtures) so callers can decide how to treat unknowns.
 */
function getAuraType(aura: { logLine: { parameters: (string | number)[] } }): 'BUFF' | 'DEBUFF' | null {
  const raw = aura.logLine.parameters[11];
  if (raw === 'BUFF' || raw === 'DEBUFF') return raw;
  return null;
}
```

- [ ] **Step 2: Filter the missed-cleanse loop to DEBUFF only**

In the missed-cleanse loop (currently around line 603), inside `for (const aura of unit.auraEvents) { ... }`, after the existing `if (!enemyIds.has(aura.srcUnitId)) continue;` check, add:

```typescript
// B11 fix: skip stolen buffs that landed on a friendly via Spellsteal/Devour Magic.
// Those events have the original enemy as srcUnitId but auraType=BUFF and cannot be
// cleansed by a defensive dispel. Only DEBUFF auras are cleanse candidates.
const auraType = getAuraType(aura);
if (auraType !== null && auraType !== 'DEBUFF') continue;
```

We tolerate `null` (older fixtures, edge log lines) to preserve current behavior wherever the marker is missing — no regression for existing test data.

- [ ] **Step 3: Apply the symmetric filter to the missed-purge loop**

In the missed-purge loop (currently around line 769), inside `for (const aura of enemy.auraEvents) { ... }`, after `if (!enemyIds.has(aura.srcUnitId)) continue;`, add:

```typescript
// Symmetric to the cleanse fix: only treat actual buffs on enemies as purge targets.
// A debuff briefly hitting an enemy with an enemy as srcUnit (reflects, cross-team
// weirdness) is not something our offensive purge should handle.
const auraType = getAuraType(aura);
if (auraType !== null && auraType !== 'BUFF') continue;
```

- [ ] **Step 4: Run the new dispelAnalysis tests and confirm both pass**

Run: `cd packages/shared && npx tsdx test --testPathPattern dispelAnalysis.test.ts`
Expected: both tests PASS.

- [ ] **Step 5: Run the full shared package test suite to confirm no regressions**

Run: `cd packages/shared && npx tsdx test`
Expected: all tests pass.

- [ ] **Step 6: Run the lint check**

Run: `npm run lint -w @wowarenalogs/shared`
Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/utils/dispelAnalysis.ts
git commit -m "fix(shared): ignore non-debuff auras in missed-cleanse detection (B11)"
```

---

## Task 4: Update TRACKER.md

**Files:**

- Modify: `TRACKER.md` (root)

The repo convention: completed bug rows move to `TRACKER_ARCHIVE.md`. Match the existing format used for prior fixed bugs.

- [ ] **Step 1: Inspect TRACKER_ARCHIVE.md to confirm the archival format**

Run: open `TRACKER_ARCHIVE.md` and find a recent fixed bug entry to mirror its style (status icon, date, fix-commit reference if present).

- [ ] **Step 2: Remove the B11 row from `TRACKER.md`**

Delete line 12 (the B11 row in the Bugs table).

- [ ] **Step 3: Append the B11 entry to `TRACKER_ARCHIVE.md`**

Add to the archived bugs section, mirroring the format already used there. Reference the actual file path that was changed (`dispelAnalysis.ts`) and a one-line summary of the resolution: stolen buffs now skipped via auraType=DEBUFF filter.

- [ ] **Step 4: Commit**

```bash
git add TRACKER.md TRACKER_ARCHIVE.md
git commit -m "docs: archive B11 (stolen-buff dispel false positive fixed)"
```

---

## Self-Review Notes

- **Spec coverage:** B11's two failure modes (stolen Freedom flagged as missed cleanse; not actually cleanseable) are both addressed by the auraType filter — buffs on friendlies are dropped before reaching the cleanse decision.
- **No placeholders:** every code step contains the exact code to write.
- **Type consistency:** `getAuraType` returns `'BUFF' | 'DEBUFF' | null`; both call sites use `auraType !== null && auraType !== 'DEBUFF'` / `'BUFF'` — same shape.
- **Unaddressed edge:** the `dispelType` annotation in `IDispelEvent` for `ourPurges` of stolen buffs is unaffected — this plan only fixes the _missed_-event detection. If the LLM prompt downstream lists "we did spellsteal X" that already works correctly today.
- **Tracker file path nuance:** TRACKER.md says `ccTrinketAnalysis.ts` for B11, but the actual logic lives in `dispelAnalysis.ts`. Plan operates on the real file; the archival entry will reflect the correct path.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-29-b11-stolen-buff-dispel-false-positive.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task with review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?

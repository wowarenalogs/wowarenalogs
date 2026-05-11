# F91: Suppress 0-second CC Duration Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suppress `[CC ON TEAM]` timeline entries where `durationSeconds === 0`, which are artifacts of instant-break or same-second trinket use and carry no useful signal for the model.

**Architecture:** Add a single guard in `buildMatchTimeline` inside `utils.ts`: skip any `cc` entry whose `durationSeconds` is 0 before emitting the `[CC ON TEAM]` line. The `ICCInstance` data already contains `durationSeconds`; no upstream data change is needed.

**Tech Stack:** TypeScript 4.6, Jest (via TSDX), `packages/shared`

---

## File Map

| Action         | Path                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| Modify         | `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts:1862–1873`         |
| Modify (tests) | `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` |

---

### Task 1: Write the failing test

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

The existing test block is `describe('buildMatchTimeline — CC, dispel, pressure, healing gap events', ...)` starting around line 565. Add the new test at the end of that block (after the last `it(...)` for trinket/CC events, before the cleanse tests — or just append inside the describe).

- [ ] **Step 1: Add the failing test**

Locate the block `describe('buildMatchTimeline — CC, dispel, pressure, healing gap events', ...)` and add this test after the existing `[CC ON TEAM]` tests (after approximately line 611, before the `[TRINKET]` test):

```typescript
it('suppresses [CC ON TEAM] when durationSeconds is 0 (instant-break artifact)', () => {
  const cc: ICCInstance = {
    atSeconds: 15,
    durationSeconds: 0,
    spellId: '853',
    spellName: 'Hammer of Justice',
    sourceName: 'Dzinked',
    sourceSpec: 'Holy Paladin',
    damageTakenDuring: 0,
    trinketState: 'used',
    drInfo: null,
    distanceYards: null,
    losBlocked: null,
  };
  const result = buildMatchTimeline(
    makeBaseParams({
      ccTrinketSummaries: [{ ...makeEmptyCCTrinketSummary('Feramonk'), ccInstances: [cc] }],
    }),
  );
  expect(result).not.toContain('[CC ON TEAM]');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -w @wowarenalogs/shared -- --testPathPattern="timeline" --verbose 2>&1 | grep -E "PASS|FAIL|suppress|0-second|RUNS"
```

Expected: FAIL — the test currently emits `[CC ON TEAM]` for 0-duration CCs so `not.toContain` fails.

---

### Task 2: Implement the filter

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Add the guard at line ~1862**

Find the block:

```typescript
for (const cc of summary.ccInstances) {
  const trinketNote =
    cc.trinketState === 'available_unused'
      ? ' | trinket: available, not used'
      : cc.trinketState === 'used'
        ? ' | trinket: used'
        : ' | trinket: on cooldown';
  addEntry(
    cc.atSeconds,
    `${fmtTime(cc.atSeconds)}  [CC ON TEAM]   ${pid(summary.playerName)} ← ${cc.spellName} (${pid(cc.sourceName)}) | ${cc.durationSeconds.toFixed(0)}s${trinketNote}`,
  );
}
```

Replace with:

```typescript
for (const cc of summary.ccInstances) {
  if (cc.durationSeconds === 0) continue;
  const trinketNote =
    cc.trinketState === 'available_unused'
      ? ' | trinket: available, not used'
      : cc.trinketState === 'used'
        ? ' | trinket: used'
        : ' | trinket: on cooldown';
  addEntry(
    cc.atSeconds,
    `${fmtTime(cc.atSeconds)}  [CC ON TEAM]   ${pid(summary.playerName)} ← ${cc.spellName} (${pid(cc.sourceName)}) | ${cc.durationSeconds.toFixed(0)}s${trinketNote}`,
  );
}
```

- [ ] **Step 2: Run the test to verify it passes**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -w @wowarenalogs/shared -- --testPathPattern="timeline" --verbose 2>&1 | grep -E "PASS|FAIL|suppress|✓|✗|●"
```

Expected: PASS — the new test passes; all prior CC tests still pass.

- [ ] **Step 3: Run the full shared test suite**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -w @wowarenalogs/shared 2>&1 | tail -20
```

Expected: all tests pass, 0 failures.

- [ ] **Step 4: Commit**

```bash
git -C /Users/mingjianliu/code/wowarenalogs add \
  packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
  packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git -C /Users/mingjianliu/code/wowarenalogs commit -m "fix(timeline): suppress 0-duration [CC ON TEAM] lines (F91)"
```

---

## Self-Review

**Spec coverage:** F91 says "filter before emitting" zero-duration CC events. The single `continue` guard in `utils.ts` handles that exactly. Test covers the case directly.

**Placeholder scan:** No placeholders — all code blocks are complete and executable.

**Type consistency:** `ICCInstance.durationSeconds` is `number` throughout; `=== 0` comparison is type-safe and matches the field used in the emit line on the same loop iteration.

**Edge cases covered:** The existing tests for `durationSeconds: 4` and `durationSeconds: 6` still pass, so non-zero CCs are unaffected. The `[TRINKET]` event path is a separate loop and is not touched.

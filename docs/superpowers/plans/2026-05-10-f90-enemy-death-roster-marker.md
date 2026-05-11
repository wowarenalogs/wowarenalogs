# F90: Enemy Death Roster Marker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit an explicit `[ROSTER] enemy N removed (dead)` line immediately after each enemy `[DEATH]` event so the model is not left guessing why subsequent `[STATE]` lines have fewer enemy HP indices.

**Architecture:** Single-line addition inside the enemy-deaths loop of `buildMatchTimeline`. Both `[DEATH]` and `[ROSTER]` are added in the same `addEntry` call so they are guaranteed adjacent in output order. No new data structures needed — `enemyPid()` already resolves the correct numeric ID.

**Tech Stack:** TypeScript, Jest (existing `timeline.test.ts` suite in `packages/shared`).

---

## File Map

| Action | File                                                                                              | Notes                                                               |
| ------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts:1762-1764`                 | Add `[ROSTER]` line inside the enemy deaths loop                    |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts:329-417` | Add three new tests in the existing `[DEATH] events` describe block |

---

## Task 1: Write failing tests

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Open the test file and locate the `[DEATH] events` describe block (line 331)**

The block ends at line 417. Add the three new `it` cases immediately before the closing `});` of the `describe('buildMatchTimeline — [DEATH] events', ...)` block (after line 416).

- [ ] **Step 2: Add the three failing tests**

Insert immediately before the closing `});` on line 417:

```typescript
it('emits a [ROSTER] removed line after each enemy death', () => {
  const result = buildMatchTimeline(
    makeBaseParams({
      enemyDeaths: [{ spec: 'Affliction Warlock', name: 'Natjkis', atSeconds: 88 }],
    }),
  );
  expect(result).toContain('[ROSTER]');
  expect(result).toContain('enemy Natjkis removed (dead)');
});

it('[ROSTER] line appears immediately after the corresponding [DEATH] line', () => {
  const result = buildMatchTimeline(
    makeBaseParams({
      enemyDeaths: [{ spec: 'Affliction Warlock', name: 'Natjkis', atSeconds: 88 }],
    }),
  );
  const lines = result.split('\n');
  const deathIdx = lines.findIndex((l) => l.includes('[DEATH]') && l.includes('Natjkis'));
  const rosterIdx = lines.findIndex((l) => l.includes('[ROSTER]') && l.includes('Natjkis removed (dead)'));
  expect(deathIdx).toBeGreaterThanOrEqual(0);
  expect(rosterIdx).toBe(deathIdx + 1);
});

it('[ROSTER] uses numeric enemy ID when enemyIdMap is provided', () => {
  const enemyIdMap = new Map<string, number>([['Natjkis', 5]]);
  const result = buildMatchTimeline(
    makeBaseParams({
      enemyDeaths: [{ spec: 'Affliction Warlock', name: 'Natjkis', atSeconds: 88 }],
      enemyIdMap,
    }),
  );
  expect(result).toContain('enemy 5 removed (dead)');
  expect(result).not.toContain('enemy Natjkis removed (dead)');
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern="timeline.test" --testNamePattern="ROSTER"
```

Expected output: 3 tests fail with `expect(received).toContain('[ROSTER]')` errors — `[ROSTER]` does not yet exist in the output.

- [ ] **Step 4: Commit the failing tests**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "test(timeline): add [ROSTER] enemy removed marker tests (F90)"
```

---

## Task 2: Implement the `[ROSTER]` line

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts:1762-1764`

- [ ] **Step 1: Locate the enemy deaths loop**

The loop is at lines 1762–1764 of `utils.ts`:

```typescript
for (const death of enemyDeaths) {
  addEntry(death.atSeconds, `${fmtTime(death.atSeconds)}  [DEATH]  ${enemyPid(death.name)} (${death.spec} — enemy)`);
}
```

- [ ] **Step 2: Expand the `addEntry` call to include the `[ROSTER]` line**

Replace the loop body so both lines are emitted in the same entry (guaranteeing adjacency):

```typescript
for (const death of enemyDeaths) {
  addEntry(
    death.atSeconds,
    `${fmtTime(death.atSeconds)}  [DEATH]  ${enemyPid(death.name)} (${death.spec} — enemy)`,
    `${fmtTime(death.atSeconds)}  [ROSTER]  enemy ${enemyPid(death.name)} removed (dead)`,
  );
}
```

No other changes are needed. `addEntry` already accepts variadic `...lines: string[]` and emits all lines from the same entry together.

- [ ] **Step 3: Run the three new tests to confirm they pass**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern="timeline.test" --testNamePattern="ROSTER"
```

Expected output:

```
✓ emits a [ROSTER] removed line after each enemy death
✓ [ROSTER] line appears immediately after the corresponding [DEATH] line
✓ [ROSTER] uses numeric enemy ID when enemyIdMap is provided
```

- [ ] **Step 4: Run the full test suite to confirm no regressions**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern="timeline.test"
```

Expected output: all tests pass (0 failures).

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

Expected output: 0 errors, 0 warnings.

- [ ] **Step 6: Commit the implementation**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git commit -m "feat(timeline): emit [ROSTER] enemy removed marker after enemy [DEATH] (F90)"
```

---

## Task 3: Mark F90 done in TRACKER.md

**Files:**

- Modify: `TRACKER.md`

- [ ] **Step 1: Move F90 from the open features table to TRACKER_ARCHIVE.md**

In `TRACKER.md`, delete the F90 row:

```
| F90 | Backlog | Death-driven `[ENEMY HP]` shape changes are silent — ... | `printMatchPrompts.ts` (buildMatchTimeline) |
```

In `TRACKER_ARCHIVE.md`, add F90 with status `✅ Done` under the Features section, following the existing archive format.

- [ ] **Step 2: Commit**

```bash
git add TRACKER.md TRACKER_ARCHIVE.md
git commit -m "chore: mark F90 done in TRACKER"
```

---

## Self-Review

**Spec coverage:**

- F90 asks for a `[ROSTER] enemy N removed (dead)` marker after death events ✅
- Uses numeric ID when `enemyIdMap` is present ✅
- Line appears immediately after `[DEATH]` (same `addEntry` call guarantees this) ✅

**Placeholder scan:** None found.

**Type consistency:** `addEntry` signature is `(timeSeconds: number, ...lines: string[]) => void` — both calls match. `enemyPid` is already defined in scope. No new types or helpers introduced.

**Friendly deaths:** The spec only mentions enemy deaths, and the existing friendly death code block builds multiple lines for trajectory/damage sources — the friendly block is intentionally left untouched.

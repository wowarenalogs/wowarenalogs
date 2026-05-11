# F88: CC Trinket Noise Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suppress the `trinket: available, not used` annotation on `[CC ON TEAM]` lines — make available the implicit default — and emit `trinket: ON CD (Xs left)` only when the trinket was on cooldown, so the model sees actionable signal without per-event noise.

**Architecture:** `ICCInstance` gets a new `trinketCooldownSecondsRemaining: number | null` field (populated only for `on_cooldown` instances). The timeline formatter in `utils.ts` is updated to emit nothing for `available_unused`, keep `trinket: used`, and emit `trinket: ON CD (Xs left)` for `on_cooldown`. All ICCInstance literals in tests gain the new field set to `null`.

**Tech Stack:** TypeScript (strict), Jest, `packages/shared/src/utils/ccTrinketAnalysis.ts`, `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`, test files.

---

## File Map

| Action | File                                                                                                                                      |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Modify | `packages/shared/src/utils/ccTrinketAnalysis.ts` — add field to `ICCInstance` interface; populate it in `analyzePlayerCCAndTrinket`       |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` — update `trinketNote` logic in `buildMatchTimeline` (~line 1863) |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` — update existing tests, add `on_cooldown` test |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/index.test.ts` — add field to `makeCCInstance` factory            |
| Modify | `packages/shared/src/utils/__tests__/deathOutcomeAnalysis.test.ts` — add field to 3 ICCInstance literals                                  |
| Modify | `packages/shared/src/utils/__tests__/healerExposureAnalysis.test.ts` — add field to ICCInstance literal                                   |

---

### Task 1: Add `trinketCooldownSecondsRemaining` to `ICCInstance` and populate it

**Files:**

- Modify: `packages/shared/src/utils/ccTrinketAnalysis.ts`

- [ ] **Step 1: Write a failing test in `timeline.test.ts` that expects the new field shape**

Add this test inside `describe('buildMatchTimeline — CC, dispel, pressure, healing gap events')`:

```typescript
it('emits [CC ON TEAM] with trinket: ON CD annotation when trinket is on cooldown', () => {
  const cc: ICCInstance = {
    atSeconds: 37,
    durationSeconds: 4,
    spellId: '853',
    spellName: 'Hammer of Justice',
    sourceName: 'Dzinked',
    sourceSpec: 'Holy Paladin',
    damageTakenDuring: 50_000,
    trinketState: 'on_cooldown',
    trinketCooldownSecondsRemaining: 45,
    drInfo: null,
    distanceYards: null,
    losBlocked: null,
  };
  const result = buildMatchTimeline(
    makeBaseParams({
      ccTrinketSummaries: [{ ...makeEmptyCCTrinketSummary('Feramonk'), ccInstances: [cc] }],
    }),
  );
  expect(result).toContain('[CC ON TEAM]');
  expect(result).toContain('trinket: ON CD (45s left)');
  expect(result).not.toContain('trinket: on cooldown');
});
```

- [ ] **Step 2: Run the new test to verify it fails with a TypeScript error about missing field**

```bash
cd packages/shared && npx jest --testPathPattern="timeline.test" --no-coverage 2>&1 | tail -20
```

Expected: compile error — `trinketCooldownSecondsRemaining` does not exist on type `ICCInstance`.

- [ ] **Step 3: Add `trinketCooldownSecondsRemaining` to the `ICCInstance` interface**

In `packages/shared/src/utils/ccTrinketAnalysis.ts`, find the `ICCInstance` interface (~line 44) and add the new field after `trinketState`:

```typescript
export interface ICCInstance {
  atSeconds: number;
  durationSeconds: number;
  spellId: string;
  spellName: string;
  sourceName: string;
  sourceSpec: string;
  damageTakenDuring: number;
  trinketState: 'used' | 'available_unused' | 'on_cooldown' | 'passive_trinket';
  /** Seconds remaining on trinket cooldown at the time of CC application. Non-null only when trinketState === 'on_cooldown'. */
  trinketCooldownSecondsRemaining: number | null;
  /** DR state at the time this CC was applied. null if spell not in DR category map. */
  drInfo: IDRInfo | null;
  distanceYards: number | null;
  losBlocked: boolean | null;
}
```

- [ ] **Step 4: Populate the new field in `analyzePlayerCCAndTrinket`**

In `packages/shared/src/utils/ccTrinketAnalysis.ts`, find the `trinketState` assignment block (~lines 315–325) inside the `ccWindows.map(...)` call. Replace the existing block with:

```typescript
let trinketState: ICCInstance['trinketState'];
let trinketCooldownSecondsRemaining: number | null = null;

if (trinketType === 'Relentless') {
  trinketState = 'passive_trinket';
} else if (trinketUsedInWindow) {
  trinketState = 'used';
} else if (isTrinketAvailable(trinketCastTimestamps, trinketCooldownMs, w.applyMs)) {
  trinketState = 'available_unused';
} else {
  trinketState = 'on_cooldown';
  // Find last cast before w.applyMs to compute remaining CD
  let lastCast = -Infinity;
  for (const ts of trinketCastTimestamps) {
    if (ts <= w.applyMs) lastCast = ts;
    else break;
  }
  if (lastCast !== -Infinity) {
    trinketCooldownSecondsRemaining = Math.round((lastCast + trinketCooldownMs - w.applyMs) / 1000);
  }
}
```

- [ ] **Step 5: Add `trinketCooldownSecondsRemaining` to the returned object literal**

In the same `ccWindows.map(...)` call, the returned object includes `trinketState`. Add the new field:

```typescript
return {
  atSeconds: (w.applyMs - matchStartMs) / 1000,
  durationSeconds: (w.removeMs - w.applyMs) / 1000,
  spellId: w.spellId,
  spellName: w.spellName,
  sourceName: w.srcName,
  sourceSpec: enemySpecMap.get(w.srcUnitId) ?? 'Unknown',
  damageTakenDuring,
  trinketState,
  trinketCooldownSecondsRemaining,
  distanceYards,
  losBlocked,
};
```

- [ ] **Step 6: Fix all ICCInstance literals that now fail TypeScript strict check**

Add `trinketCooldownSecondsRemaining: null` to every existing ICCInstance object literal. There are 8 locations:

**`packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`** — 4 locations (lines ~575, ~600, ~1138, ~1757, ~2438 — search for `trinketState:` and add the field below it in each):

```typescript
// e.g. at line ~575:
trinketState: 'available_unused',
trinketCooldownSecondsRemaining: null,
// e.g. at line ~600:
trinketState: 'used',
trinketCooldownSecondsRemaining: null,
```

**`packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/index.test.ts`** — update `makeCCInstance` factory (~line 94):

```typescript
function makeCCInstance(
  atSeconds: number,
  durationSeconds: number,
  trinketState: 'used' | 'available_unused' | 'on_cooldown' | 'passive_trinket' = 'on_cooldown',
  overrides: Partial<IPlayerCCTrinketSummary['ccInstances'][number]> = {},
): IPlayerCCTrinketSummary['ccInstances'][number] {
  return {
    atSeconds,
    durationSeconds,
    spellId: '853',
    spellName: 'Hammer of Justice',
    sourceName: 'EnemyA',
    sourceSpec: 'Ret Paladin',
    damageTakenDuring: 50_000,
    trinketState,
    trinketCooldownSecondsRemaining: null,
    drInfo: null,
    distanceYards: null,
    losBlocked: null,
    ...overrides,
  };
}
```

**`packages/shared/src/utils/__tests__/deathOutcomeAnalysis.test.ts`** — 3 ICCInstance literals (lines ~67, ~101, ~157 — add after `trinketState:`):

```typescript
trinketState: 'on_cooldown',
trinketCooldownSecondsRemaining: null,
// ... and:
trinketState: 'available_unused',
trinketCooldownSecondsRemaining: null,
```

**`packages/shared/src/utils/__tests__/healerExposureAnalysis.test.ts`** — 1 ICCInstance literal (~line 28 — add after `trinketState:`):

```typescript
trinketState: 'on_cooldown',
trinketCooldownSecondsRemaining: null,
```

- [ ] **Step 7: Run tests to confirm the new field compiles and existing tests still pass**

```bash
cd packages/shared && npx jest --testPathPattern="(timeline|index|deathOutcomeAnalysis|healerExposureAnalysis).test" --no-coverage 2>&1 | tail -30
```

Expected: new `on_cooldown` test still fails (formatter not updated yet); all others pass.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/utils/ccTrinketAnalysis.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/index.test.ts \
        packages/shared/src/utils/__tests__/deathOutcomeAnalysis.test.ts \
        packages/shared/src/utils/__tests__/healerExposureAnalysis.test.ts
git commit -m "feat(ccTrinket): add trinketCooldownSecondsRemaining to ICCInstance (F88)"
```

---

### Task 2: Update `buildMatchTimeline` formatter and fix the failing test

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` (~line 1863)
- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Update the `available_unused` test expectation**

The existing test at line ~566 (`'emits [CC ON TEAM] with trinket: available, not used when trinket was available'`) checks for `trinket: available, not used`. Change it so it verifies the annotation is _absent_:

```typescript
it('emits [CC ON TEAM] without trinket annotation when trinket was available (available is implicit default)', () => {
  const cc: ICCInstance = {
    atSeconds: 37,
    durationSeconds: 4,
    spellId: '853',
    spellName: 'Hammer of Justice',
    sourceName: 'Dzinked',
    sourceSpec: 'Holy Paladin',
    damageTakenDuring: 50_000,
    trinketState: 'available_unused',
    trinketCooldownSecondsRemaining: null,
    drInfo: null,
    distanceYards: null,
    losBlocked: null,
  };
  const result = buildMatchTimeline(
    makeBaseParams({
      ccTrinketSummaries: [{ ...makeEmptyCCTrinketSummary('Feramonk'), ccInstances: [cc] }],
    }),
  );
  expect(result).toContain('[CC ON TEAM]');
  expect(result).toContain('Feramonk ← Hammer of Justice (Dzinked)');
  expect(result).toContain('0:37');
  expect(result).not.toContain('trinket:');
});
```

- [ ] **Step 2: Run tests to verify the updated `available_unused` test now fails (still using old formatter)**

```bash
cd packages/shared && npx jest --testPathPattern="timeline.test" --no-coverage -t "without trinket annotation" 2>&1 | tail -20
```

Expected: FAIL — `trinket: available, not used` is still present in output.

- [ ] **Step 3: Update the `trinketNote` logic in `buildMatchTimeline`**

In `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`, find the `trinketNote` block at ~line 1863:

```typescript
// OLD:
const trinketNote =
  cc.trinketState === 'available_unused'
    ? ' | trinket: available, not used'
    : cc.trinketState === 'used'
      ? ' | trinket: used'
      : ' | trinket: on cooldown';
```

Replace with:

```typescript
// NEW:
const trinketNote =
  cc.trinketState === 'used'
    ? ' | trinket: used'
    : cc.trinketState === 'on_cooldown'
      ? ` | trinket: ON CD (${cc.trinketCooldownSecondsRemaining ?? '?'}s left)`
      : '';
```

This makes `available_unused` and `passive_trinket` emit nothing (silent defaults).

- [ ] **Step 4: Run all affected tests to verify they pass**

```bash
cd packages/shared && npx jest --testPathPattern="(timeline|index|deathOutcomeAnalysis|healerExposureAnalysis).test" --no-coverage 2>&1 | tail -30
```

Expected: all pass including the new `on_cooldown` test and updated `available_unused` test.

- [ ] **Step 5: Run the full test suite to verify no regressions**

```bash
npm run test 2>&1 | tail -30
```

Expected: all tests pass, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "feat(timeline): suppress trinket:available noise; emit ON CD (Xs left) for on_cooldown (F88)"
```

---

## Self-Review

**Spec coverage:**

- F88 requires: suppress `trinket: available, not used` ✓ (Task 2 makes `available_unused` emit `''`)
- F88 requires: annotate on-CD as `trinket: ON CD (Xs left)` ✓ (Task 1 adds `trinketCooldownSecondsRemaining`, Task 2 emits it)
- `passive_trinket` (Relentless) was previously falling through to `' | trinket: on cooldown'` which was wrong — now silently suppressed ✓

**Placeholder scan:** No TBD, TODO, or "similar to Task N" patterns present.

**Type consistency:**

- `trinketCooldownSecondsRemaining` defined in Task 1 interface, populated in Task 1 computation, used in Task 2 formatter — consistent name throughout.
- Fallback `?? '?'` in formatter handles the impossible `null` case gracefully.

**TRACKER update:** Mark F87 as Done in `TRACKER.md` after both commits (the suppression fix from the previous commit already shipped as F87; F88 is this work).

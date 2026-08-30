# F64 — Enemy HP Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add enemy player HP to `[HP]` timeline ticks at the same cadence as friendly HP, so Claude can evaluate kill-window timing, whether offensive CDs were kill attempts, and whether burst pressure was justified.

**Architecture:** `BuildMatchTimelineParams` gains an `enemies: ICombatUnit[]` field. The existing HP tick loop in `buildMatchTimeline` is extended to include enemy units alongside friendly units, using `enemyPid()` for name compression. Enemy deaths are added to the `criticalWindowSet` so the 1s dense-tick window fires before an enemy kill just like it does for friendly deaths.

**Tech Stack:** TypeScript, Jest (existing test infrastructure in `__tests__/timeline.test.ts`)

---

## File Map

| Action | File                                                                                      | Change                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`                   | Add `enemies` to `BuildMatchTimelineParams`; extend HP tick loop; add enemy deaths to critical windows |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx`                  | Pass `enemies as ICombatUnit[]` to `buildMatchTimeline` call site                                      |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` | Update `makeBaseParams` default; add two new test cases                                                |

---

## Task 1: Add `enemies` to `BuildMatchTimelineParams` and wire up the call site

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts:1111-1138`
- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx:215-233`

- [ ] **Step 1: Add `enemies` to the interface in `utils.ts`**

Find `BuildMatchTimelineParams` (around line 1111). After the `friends: ICombatUnit[];` line, add:

```ts
  /**
   * Enemy player units. When provided, their HP is included in [HP] ticks
   * alongside friendly HP, referenced by enemyPid() numeric ID.
   */
  enemies?: ICombatUnit[];
```

- [ ] **Step 2: Destructure `enemies` in `buildMatchTimeline`**

In the destructuring block at the top of `buildMatchTimeline` (around line 1141), add `enemies` next to `friends`:

```ts
const {
  owner,
  ownerSpec,
  ownerCDs,
  teammateCDs,
  enemyCDTimeline,
  ccTrinketSummaries,
  dispelSummary,
  friendlyDeaths,
  enemyDeaths,
  pressureWindows,
  healingGaps,
  friends,
  enemies, // ← add this
  matchStartMs,
  matchEndMs,
  isHealer,
  playerIdMap,
  enemyIdMap,
} = params;
```

- [ ] **Step 3: Pass `enemies` at the call site in `index.tsx`**

In `buildMatchContext` in `index.tsx`, the `buildMatchTimeline` call (around line 215) already has access to `enemies` (parameter of `buildMatchContext`). Add it to the object literal:

```ts
      buildMatchTimeline({
        owner: owner as ICombatUnit,
        ownerSpec,
        ownerCDs: cooldowns,
        teammateCDs: allTeamCDsWithSpec,
        enemyCDTimeline,
        ccTrinketSummaries,
        dispelSummary,
        friendlyDeaths,
        enemyDeaths,
        pressureWindows,
        healingGaps,
        friends: friends as ICombatUnit[],
        enemies: enemies as ICombatUnit[],   // ← add this line
        matchStartMs: combat.startTime,
        matchEndMs: combat.endTime,
        isHealer: healer,
        playerIdMap,
        enemyIdMap,
      } as BuildMatchTimelineParams),
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run build:web 2>&1 | tail -20
```

Expected: no new TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx
git commit -m "feat(F64): add enemies param to BuildMatchTimelineParams and call site"
```

---

## Task 2: Write failing tests

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

`makeBaseParams` (around line 218) currently has no `enemies` key — TypeScript will now require it since the interface has the optional field. Update the default and add two new describe blocks.

- [ ] **Step 1: Add `enemies: []` to `makeBaseParams`**

In `makeBaseParams`, add `enemies: []` inside the returned object:

```ts
function makeBaseParams(overrides: Partial<BuildMatchTimelineParams> = {}): BuildMatchTimelineParams {
  return {
    owner: makeOwner('Feramonk'),
    ownerSpec: 'Holy Paladin',
    ownerCDs: [],
    teammateCDs: [],
    enemyCDTimeline: makeEnemyTimeline(),
    ccTrinketSummaries: [],
    dispelSummary: makeEmptyDispelSummary(),
    friendlyDeaths: [],
    enemyDeaths: [],
    pressureWindows: [] as IDamageBucket[],
    healingGaps: [] as IHealingGap[],
    friends: [],
    enemies: [], // ← add this
    matchStartMs: 0,
    matchEndMs: 0,
    isHealer: true,
    ...overrides,
  };
}
```

- [ ] **Step 2: Add the F64 describe block at the end of the file**

Append after the last `describe` block:

```ts
describe('buildMatchTimeline — F64 enemy HP in [HP] ticks', () => {
  it('includes enemy HP on the same [HP] line as friendly HP', () => {
    const matchStartMs = 0;

    const friend = makeUnit('unit-1', {
      name: 'Feramonk',
      advancedActions: [
        makeAdvancedAction(6_000, 0, 0, 500_000, 450_000), // 90% at t=6s
      ],
    }) as ICombatUnit;

    // advancedActorId must match the unit's id for getUnitHpAtTimestamp to pick it up
    const enemy = makeUnit('enemy-1', {
      name: 'Natjkis',
      advancedActions: [
        { ...makeAdvancedAction(6_000, 0, 0, 500_000, 175_000), advancedActorId: 'enemy-1' }, // 35% at t=6s
      ],
    }) as ICombatUnit;

    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [friend],
        enemies: [enemy],
        matchStartMs,
        matchEndMs: 9_000,
      }),
    );

    // Both HP readings should appear on the same [HP] line at t=6s
    const hpLines = result.split('\n').filter((l) => l.includes('[HP]'));
    expect(hpLines.length).toBeGreaterThan(0);
    const sixSecondLine = hpLines.find((l) => l.startsWith('0:06'));
    expect(sixSecondLine).toBeDefined();
    expect(sixSecondLine).toContain('Feramonk:90%');
    expect(sixSecondLine).toContain('Natjkis:35%');
  });

  it('adds 1s dense ticks in [T-10, T] window before an enemy death', () => {
    const matchStartMs = 0;

    const enemy = makeUnit('enemy-1', {
      name: 'Natjkis',
      advancedActions: [
        { ...makeAdvancedAction(51_000, 0, 0, 500_000, 100_000), advancedActorId: 'enemy-1' }, // 20% at t=51s
        { ...makeAdvancedAction(55_000, 0, 0, 500_000, 25_000), advancedActorId: 'enemy-1' }, // 5% at t=55s
      ],
    }) as ICombatUnit;

    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        enemyDeaths: [{ spec: 'Affliction Warlock', name: 'Natjkis', atSeconds: 60 }],
        matchStartMs,
        matchEndMs: 65_000,
      }),
    );

    // Dense window [50, 60] — expect consecutive 1s ticks (not just 3s multiples like 51, 54, 57, 60)
    const hpLines = result.split('\n').filter((l) => l.includes('[HP]'));
    const tickSeconds = hpLines
      .map((l) => {
        const m = l.match(/^(\d+):(\d+)/);
        return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
      })
      .filter((t): t is number => t !== null);
    const inDenseWindow = tickSeconds.filter((t) => t >= 50 && t <= 60);
    // At minimum 5 of the 11 possible 1s ticks should appear (accounting for sparse advanced data)
    expect(inDenseWindow.length).toBeGreaterThanOrEqual(5);
    // Specifically, t=52 and t=53 are NOT 3s multiples — they should appear only because of the dense window
    expect(inDenseWindow).toContain(52);
    expect(inDenseWindow).toContain(53);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test --workspace=@wowarenalogs/shared -- --testPathPattern=timeline --no-coverage 2>&1 | tail -30
```

Expected: both new tests fail — enemy HP not in output, dense ticks not triggered by enemy deaths.

---

## Task 3: Implement the HP loop changes in `utils.ts`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

The HP tick section runs from approximately line 1364 to line 1419. We need to:

1. Add enemy deaths to `criticalWindowSet`
2. Replace the `hpFriends` variable with a combined `hpUnits` array

- [ ] **Step 1: Add enemy deaths to the `criticalWindowSet` in `utils.ts`**

Find the critical-window construction block (after the friendly deaths loop, around line 1369). After the `for (const d of friendlyDeaths)` loop, add:

```ts
for (const d of enemyDeaths) {
  // Dense 1s ticks in [T-10, T] before enemy kill — mirrors the friendly death window
  for (let t = Math.max(0, Math.ceil(d.atSeconds - 10)); t <= Math.floor(d.atSeconds); t++) {
    criticalWindowSet.add(t);
  }
}
```

- [ ] **Step 2: Replace `hpFriends` with `hpUnits` in `utils.ts`**

Find this line (around line 1405):

```ts
const hpFriends = friends;
```

Replace it with:

```ts
const hpUnits: Array<{ unit: ICombatUnit; label: (name: string) => string }> = [
  ...friends.map((u) => ({ unit: u, label: (name: string) => pid(name) })),
  ...(enemies ?? []).map((u) => ({ unit: u, label: (name: string) => enemyPid(name) })),
];
```

- [ ] **Step 3: Update the tick emission loop to use `hpUnits`**

Find the tick emission loop (around line 1407). The current loop body is:

```ts
for (const t of [...tickSet].sort((a, b) => a - b)) {
  const tsMs = matchStartMs + t * 1000;
  const sampleWindowMs = criticalWindowSet.has(t) ? HP_SAMPLE_WINDOW_CRITICAL_MS : HP_SAMPLE_WINDOW_BASELINE_MS;
  const parts = hpFriends
    .map((u) => {
      const pct = getUnitHpAtTimestamp(u, tsMs, sampleWindowMs);
      return pct !== null ? `${pid(u.name)}:${pct}%` : null;
    })
    .filter((s): s is string => s !== null);
  if (parts.length > 0) {
    addEntry(t, `${fmtTime(t)}  [HP]   ${parts.join(' / ')}`);
  }
}
```

Replace with:

```ts
for (const t of [...tickSet].sort((a, b) => a - b)) {
  const tsMs = matchStartMs + t * 1000;
  const sampleWindowMs = criticalWindowSet.has(t) ? HP_SAMPLE_WINDOW_CRITICAL_MS : HP_SAMPLE_WINDOW_BASELINE_MS;
  const parts = hpUnits
    .map(({ unit, label }) => {
      const pct = getUnitHpAtTimestamp(unit, tsMs, sampleWindowMs);
      return pct !== null ? `${label(unit.name)}:${pct}%` : null;
    })
    .filter((s): s is string => s !== null);
  if (parts.length > 0) {
    addEntry(t, `${fmtTime(t)}  [HP]   ${parts.join(' / ')}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test --workspace=@wowarenalogs/shared -- --testPathPattern=timeline --no-coverage 2>&1 | tail -30
```

Expected: all tests pass including both new F64 tests.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npm test --workspace=@wowarenalogs/shared --no-coverage 2>&1 | tail -20
```

Expected: no failures.

- [ ] **Step 6: Run lint**

```bash
npm run lint 2>&1 | tail -20
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "feat(F64): add enemy HP to [HP] ticks with enemy-death critical windows"
```

---

## Self-Review

**Spec coverage (from TRACKER.md F64):**

- Enemy HP in `[HP]` entries at same frequency as friendly HP → Task 3 Step 2+3 ✓
- `enemyPid()` for name compression → `hpUnits` label closure uses `enemyPid` ✓
- Enemy deaths as critical windows (1s dense ticks before kill) → Task 3 Step 1 ✓
- `enemies` param added to `BuildMatchTimelineParams` → Task 1 Step 1 ✓
- Call site in `index.tsx` updated → Task 1 Step 3 ✓
- Tests covering enemy HP on tick lines → Task 2 Step 2 (test 1) ✓
- Tests covering dense ticks before enemy death → Task 2 Step 2 (test 2) ✓

**Type consistency:**

- `hpUnits` type: `Array<{ unit: ICombatUnit; label: (name: string) => string }>` — used consistently in Task 3 Step 2 and Step 3.
- `enemies?: ICombatUnit[]` in interface, defaulted to `[]` in `makeBaseParams` — no null-safety gaps; `(enemies ?? [])` in Step 2 handles the optional case.
- Test advanced actions: `makeAdvancedAction` returns `advancedActorId: 'unit-1'` by default. Enemy unit tests override with `{ ...makeAdvancedAction(...), advancedActorId: 'enemy-1' }` to match the enemy unit's id — required for `getUnitHpAtTimestamp` to match on `a.advancedActorId !== unit.id`.

**Placeholder scan:** None. All code blocks are complete and directly usable.

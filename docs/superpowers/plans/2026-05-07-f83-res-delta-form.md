# F83: [RES] rdy: Delta Form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the full `rdy:` list in every `[RES]` snapshot with a delta form (`rdy:Δ+Added,-Removed`) after the first snapshot, saving tokens in tight burst windows where many CDs are used in quick succession.

**Architecture:** The `buildResourceSnapshot` function in `utils.ts` already computes `readyNames`. We add an optional `prevReadyNames?: string[]` to `ResourceSnapshotParams` — when provided, the `rdy:` portion switches to delta form (`rdy:Δ+NewReady,-NoLongerReady`; `rdy:Δ` when nothing changed). The `resourceSnapshot` closure inside `buildMatchTimeline` maintains the previous ready-names state. We also extract a small `computeReadyNames` helper shared between `buildResourceSnapshot` and `buildMatchTimeline`'s state-tracking closure to avoid code duplication.

**Tech Stack:** TypeScript, Jest

---

## File Map

| File                                                                                      | Change                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`                   | Add `computeReadyNames` helper; add `prevReadyNames?` to `ResourceSnapshotParams`; modify `buildResourceSnapshot` for delta form; modify `resourceSnapshot` closure in `buildMatchTimeline` to track state |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` | Add tests for `buildResourceSnapshot` delta form                                                                                                                                                           |

---

### Task 1: Extract `computeReadyNames` and add delta logic to `buildResourceSnapshot`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

This task makes two related changes to the same region of the file:

1. Extract `computeReadyNames` as an exported helper (placed just before `buildResourceSnapshot`)
2. Add `prevReadyNames?: string[]` to `ResourceSnapshotParams`
3. Use `computeReadyNames` inside `buildResourceSnapshot` and add delta branching

**Step 1: Read the current `buildResourceSnapshot` function**

Open `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`. Read the block from the `ResourceSnapshotParams` interface (line ~1249) through the end of `buildResourceSnapshot` (line ~1388).

The current `buildResourceSnapshot` starts with:

```typescript
export function buildResourceSnapshot({
  timeSeconds,
  ownerCDs,
  ownerName,
  ownerSpec: _ownerSpec,
  teammateCDs,
  ccTrinketSummaries,
  enemyCDTimeline,
  playerIdMap,
}: ResourceSnapshotParams): string {
  function pid(name: string): string { ... }

  // ── rdy / cd ───────────────────────────────────────────────────────────────
  const readyNames: string[] = [];
  const onCDParts: string[] = [];

  const allFriendlyCDs: Array<{ spellName: string; cd: IMajorCooldownInfo }> = [
    ...ownerCDs.map((cd) => ({ spellName: cd.spellName, cd })),
    ...teammateCDs.flatMap(({ cds }) => cds.map((cd) => ({ spellName: cd.spellName, cd }))),
  ];

  for (const { spellName, cd } of allFriendlyCDs) {
    const priorCasts = cd.casts.filter((c) => c.timeSeconds < timeSeconds - 0.5);
    if (priorCasts.length === 0) {
      if (timeSeconds > 5) readyNames.push(spellName);
      continue;
    }
    const charges = cd.maxChargesDetected > 1 ? cd.maxChargesDetected : 1;
    const relevantCasts = priorCasts.slice(-charges);
    const earliestSlotReady = relevantCasts[0].timeSeconds + cd.cooldownSeconds;
    if (earliestSlotReady <= timeSeconds + 0.5) {
      readyNames.push(spellName);
    } else {
      const remaining = Math.round(earliestSlotReady - timeSeconds);
      onCDParts.push(`${spellName}(${remaining}s)`);
    }
  }

  let line =
    `      [RES] rdy:${readyNames.length > 0 ? readyNames.join(',') : '—'}` +
    `  cd:${onCDParts.length > 0 ? onCDParts.join(',') : '—'}`;
```

**Step 2: Add `computeReadyNames` helper immediately before `buildResourceSnapshot`**

Insert the following exported function between the `// ── buildResourceSnapshot ──` comment and the `export interface ResourceSnapshotParams` declaration:

```typescript
/**
 * Returns the names of all friendly major CDs that are ready (available to cast)
 * at the given timeSeconds. Shared between buildResourceSnapshot and the delta
 * state tracker in buildMatchTimeline.
 */
export function computeReadyNames(
  timeSeconds: number,
  ownerCDs: IMajorCooldownInfo[],
  teammateCDs: Array<{ cds: IMajorCooldownInfo[] }>,
): string[] {
  const readyNames: string[] = [];
  const allFriendlyCDs = [
    ...ownerCDs.map((cd) => ({ spellName: cd.spellName, cd })),
    ...teammateCDs.flatMap(({ cds }) => cds.map((cd) => ({ spellName: cd.spellName, cd }))),
  ];
  for (const { spellName, cd } of allFriendlyCDs) {
    const priorCasts = cd.casts.filter((c) => c.timeSeconds < timeSeconds - 0.5);
    if (priorCasts.length === 0) {
      if (timeSeconds > 5) readyNames.push(spellName);
      continue;
    }
    const charges = cd.maxChargesDetected > 1 ? cd.maxChargesDetected : 1;
    const relevantCasts = priorCasts.slice(-charges);
    const earliestSlotReady = relevantCasts[0].timeSeconds + cd.cooldownSeconds;
    if (earliestSlotReady <= timeSeconds + 0.5) readyNames.push(spellName);
  }
  return readyNames;
}
```

**Step 3: Add `prevReadyNames` to `ResourceSnapshotParams`**

In the `ResourceSnapshotParams` interface, add one optional field at the end:

```typescript
export interface ResourceSnapshotParams {
  timeSeconds: number;
  ownerCDs: IMajorCooldownInfo[];
  ownerName: string;
  ownerSpec: string;
  isOwnerHealer?: boolean;
  teammateCDs: Array<{ player: ICombatUnit; spec: string; cds: IMajorCooldownInfo[] }>;
  ccTrinketSummaries: IPlayerCCTrinketSummary[];
  enemyCDTimeline: IEnemyCDTimeline;
  playerIdMap?: Map<string, number>;
  /**
   * Ready CD names from the previous snapshot. When provided, the [RES] line
   * emits a delta form (rdy:Δ+Added,-Removed) instead of the full list.
   */
  prevReadyNames?: string[];
}
```

**Step 4: Modify `buildResourceSnapshot` to use `computeReadyNames` and add delta branching**

In `buildResourceSnapshot`, replace the current `readyNames` / `onCDParts` computation block AND the `let line` assignment with the following:

The new destructuring adds `prevReadyNames`:

```typescript
export function buildResourceSnapshot({
  timeSeconds,
  ownerCDs,
  ownerName,
  ownerSpec: _ownerSpec,
  teammateCDs,
  ccTrinketSummaries,
  enemyCDTimeline,
  playerIdMap,
  prevReadyNames,
}: ResourceSnapshotParams): string {
```

Then replace everything from `// ── rdy / cd ──` through the existing `let line =` assignment with:

```typescript
// ── rdy / cd ───────────────────────────────────────────────────────────────
const readyNames = computeReadyNames(timeSeconds, ownerCDs, teammateCDs);
const onCDParts: string[] = [];

const allFriendlyCDs: Array<{ spellName: string; cd: IMajorCooldownInfo }> = [
  ...ownerCDs.map((cd) => ({ spellName: cd.spellName, cd })),
  ...teammateCDs.flatMap(({ cds }) => cds.map((cd) => ({ spellName: cd.spellName, cd }))),
];

for (const { spellName, cd } of allFriendlyCDs) {
  const priorCasts = cd.casts.filter((c) => c.timeSeconds < timeSeconds - 0.5);
  if (priorCasts.length === 0) continue; // readyNames already captured above
  const charges = cd.maxChargesDetected > 1 ? cd.maxChargesDetected : 1;
  const relevantCasts = priorCasts.slice(-charges);
  const earliestSlotReady = relevantCasts[0].timeSeconds + cd.cooldownSeconds;
  if (earliestSlotReady > timeSeconds + 0.5) {
    const remaining = Math.round(earliestSlotReady - timeSeconds);
    onCDParts.push(`${spellName}(${remaining}s)`);
  }
}

// ── rdy: — full form first time, delta form on subsequent calls ──────────────
let rdyPart: string;
if (prevReadyNames !== undefined) {
  const prevSet = new Set(prevReadyNames);
  const currentSet = new Set(readyNames);
  const added = readyNames.filter((n) => !prevSet.has(n));
  const removed = prevReadyNames.filter((n) => !currentSet.has(n));
  const parts: string[] = [];
  if (added.length > 0) parts.push(`+${added.join(',')}`);
  if (removed.length > 0) parts.push(`-${removed.join(',')}`);
  rdyPart = parts.length > 0 ? `rdy:Δ${parts.join('')}` : 'rdy:Δ';
} else {
  rdyPart = `rdy:${readyNames.length > 0 ? readyNames.join(',') : '—'}`;
}

let line = `      [RES] ${rdyPart}  cd:${onCDParts.length > 0 ? onCDParts.join(',') : '—'}`;
```

**Step 5: Run the test suite to confirm nothing broke**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern timeline 2>&1 | tail -20
```

Expected: all existing tests pass (existing `buildResourceSnapshot` tests don't pass `prevReadyNames` → still full form).

**Step 6: Run lint**

```bash
npm run lint -w @wowarenalogs/shared 2>&1 | tail -5
```

Expected: exit 0.

**Step 7: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git commit -m "feat(timeline): add computeReadyNames helper + [RES] delta form support (F83)"
```

---

### Task 2: Add state tracking in `buildMatchTimeline`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

The `resourceSnapshot` closure inside `buildMatchTimeline` (around line 1645) currently calls `snapshotFn` directly with no state. We add `prevReadyNames` tracking.

**Step 1: Read the current `resourceSnapshot` closure**

The current closure (around line 1643–1657) looks like:

```typescript
const snapshotFn = resourceSnapshotFn ?? buildResourceSnapshot;

function resourceSnapshot(timeSeconds: number): string {
  return snapshotFn({
    timeSeconds,
    ownerCDs,
    ownerName: owner.name,
    ownerSpec,
    isOwnerHealer: isHealer,
    teammateCDs,
    ccTrinketSummaries,
    enemyCDTimeline,
    playerIdMap,
  });
}
```

**Step 2: Replace with state-tracking version**

Replace the `resourceSnapshot` function (keep `const snapshotFn = ...` line unchanged) with:

```typescript
const snapshotFn = resourceSnapshotFn ?? buildResourceSnapshot;

let prevReadyNamesState: string[] | null = null;

function resourceSnapshot(timeSeconds: number): string {
  const currentReadyNames = computeReadyNames(timeSeconds, ownerCDs, teammateCDs);
  const prevReadyNames = prevReadyNamesState ?? undefined;
  prevReadyNamesState = currentReadyNames;
  return snapshotFn({
    timeSeconds,
    ownerCDs,
    ownerName: owner.name,
    ownerSpec,
    isOwnerHealer: isHealer,
    teammateCDs,
    ccTrinketSummaries,
    enemyCDTimeline,
    playerIdMap,
    prevReadyNames,
  });
}
```

`computeReadyNames` is already in scope (exported from the same file, and this is inside the module). `teammateCDs` is available in the `buildMatchTimeline` closure from its destructured params.

**Step 3: Run tests**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern timeline 2>&1 | tail -20
```

Expected: all tests pass.

**Step 4: Run lint**

```bash
npm run lint -w @wowarenalogs/shared 2>&1 | tail -5
```

Expected: exit 0.

**Step 5: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git commit -m "feat(timeline): wire [RES] delta state tracking into buildMatchTimeline (F83)"
```

---

### Task 3: Add tests for `buildResourceSnapshot` delta form

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

The existing `describe('buildResourceSnapshot — F72 compact [RES] format', ...)` block (around line 2709) tests `buildResourceSnapshot` directly. Add a new describe block for the delta form immediately after that block ends.

**Step 1: Find the insertion point**

Open the test file and find the end of `describe('buildResourceSnapshot — F72 compact [RES] format', ...)`. It ends before `describe('buildResourceSnapshot — root/disarm/kick in cc: line', ...)`. Insert the new describe block between them.

Also add `computeReadyNames` to the imports from `'../utils'`:

```typescript
import {
  buildJsonSituationSnapshot,
  buildMatchTimeline,
  BuildMatchTimelineParams,
  buildPlayerLoadout,
  buildResourceSnapshot,
  computeHealingInWindow,
  computeReadyNames,
  extractEnemyMajorBuffIntervals,
  extractOwnerCDBuffExpiry,
  HEALING_AMPLIFIER_SPELL_IDS,
} from '../utils';
```

**Step 2: Add the new describe block**

```typescript
describe('buildResourceSnapshot — delta form (F83)', () => {
  const BASE_ENEMY_TIMELINE = makeEnemyTimeline();

  function makeParams(timeSeconds: number, ownerCDs: IMajorCooldownInfo[], prevReadyNames?: string[]) {
    return {
      timeSeconds,
      ownerCDs,
      ownerName: 'Player1',
      ownerSpec: 'Holy Paladin',
      teammateCDs: [],
      ccTrinketSummaries: [],
      enemyCDTimeline: BASE_ENEMY_TIMELINE,
      prevReadyNames,
    };
  }

  it('emits full rdy: list when prevReadyNames is undefined (first call)', () => {
    const avWr = { ...makeCD('Avenging Wrath', 120), casts: [] };
    const result = buildResourceSnapshot(makeParams(30, [avWr]));
    expect(result).toContain('rdy:Avenging Wrath');
    expect(result).not.toContain('Δ');
  });

  it('emits rdy:Δ when ready list is unchanged from prev', () => {
    const avWr = { ...makeCD('Avenging Wrath', 120), casts: [] };
    const result = buildResourceSnapshot(makeParams(30, [avWr], ['Avenging Wrath']));
    expect(result).toContain('rdy:Δ');
    expect(result).not.toContain('rdy:Avenging Wrath');
  });

  it('emits rdy:Δ-SpellName when a CD was just used (no longer ready)', () => {
    // avWr cast at t=10; at t=30, it was cast at 10 → priorCasts=[{timeSeconds:10}]
    // 10 + 120 = 130 > 30 → on CD → no longer in readyNames
    const avWr = { ...makeCD('Avenging Wrath', 120), casts: [{ timeSeconds: 10 }] };
    // Simulate: previously it was ready, now it's on CD
    const result = buildResourceSnapshot(makeParams(30, [avWr], ['Avenging Wrath']));
    expect(result).toContain('rdy:Δ-Avenging Wrath');
  });

  it('emits rdy:Δ+SpellName when a CD just came off cooldown', () => {
    // avWr cast at t=10; cooldown=30s; at t=45, 10+30=40 ≤ 45 → ready
    const avWr = { ...makeCD('Avenging Wrath', 30), casts: [{ timeSeconds: 10 }] };
    // Simulate: previously it was on CD, now it's ready
    const result = buildResourceSnapshot(makeParams(45, [avWr], []));
    expect(result).toContain('rdy:Δ+Avenging Wrath');
  });

  it('emits rdy:Δ+Added-Removed when one CD became ready and another went on CD', () => {
    // pain suppression cast at t=10 (now on CD): 10+120=130 > 50 → on CD
    const ps = { ...makeCD('Pain Suppression', 120), casts: [{ timeSeconds: 10 }] };
    // avWr cast at t=10, 30s CD: 10+30=40 ≤ 50 → ready
    const avWr = { ...makeCD('Avenging Wrath', 30), casts: [{ timeSeconds: 10 }] };
    // prev: Pain Suppression was ready, Avenging Wrath was on CD
    const result = buildResourceSnapshot(makeParams(50, [ps, avWr], ['Pain Suppression']));
    expect(result).toContain('+Avenging Wrath');
    expect(result).toContain('-Pain Suppression');
    expect(result).toContain('Δ');
  });

  describe('computeReadyNames', () => {
    it('returns empty array when no ownerCDs and no teammateCDs', () => {
      expect(computeReadyNames(30, [], [])).toEqual([]);
    });

    it('returns spell name when CD has no prior casts and timeSeconds > 5', () => {
      const avWr = { ...makeCD('Avenging Wrath', 120), casts: [] };
      expect(computeReadyNames(30, [avWr], [])).toEqual(['Avenging Wrath']);
    });

    it('does NOT return spell when not yet 5s into match', () => {
      const avWr = { ...makeCD('Avenging Wrath', 120), casts: [] };
      expect(computeReadyNames(3, [avWr], [])).toEqual([]);
    });

    it('returns spell name when cooldown has expired', () => {
      // cast at t=5, cd=30 → ready at t=35; query at t=40
      const avWr = { ...makeCD('Avenging Wrath', 30), casts: [{ timeSeconds: 5 }] };
      expect(computeReadyNames(40, [avWr], [])).toContain('Avenging Wrath');
    });

    it('does NOT return spell while still on cooldown', () => {
      // cast at t=5, cd=120 → ready at t=125; query at t=40
      const avWr = { ...makeCD('Avenging Wrath', 120), casts: [{ timeSeconds: 5 }] };
      expect(computeReadyNames(40, [avWr], [])).not.toContain('Avenging Wrath');
    });
  });
});
```

**Step 3: Run tests**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern timeline 2>&1 | tail -20
```

Expected: all tests pass.

**Step 4: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "test(timeline): add [RES] delta form tests and computeReadyNames tests (F83)"
```

---

### Task 4: Mark F83 done in TRACKER

**Files:**

- Modify: `TRACKER.md`

- [ ] **Step 1:** Find `| F83 | Backlog |` in TRACKER.md and change `Backlog` to `✅ Done`.

- [ ] **Step 2: Commit**

```bash
git add TRACKER.md
git commit -m "chore: mark F83 done in TRACKER"
```

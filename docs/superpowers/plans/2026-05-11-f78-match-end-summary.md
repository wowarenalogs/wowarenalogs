# F78 Match-End Final State Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Append a `[MATCH END]` block to every timeline that shows each player's final HP (or `dead(M:SS)`), plus the final dampening %, so the AI has a crisp snapshot of the match's closing state.

**Architecture:** `buildMatchTimeline` in `utils.ts` already has `friends`, `enemies`, `friendlyDeaths`, `enemyDeaths`, `matchEndMs`, and `playerIdMap`/`enemyIdMap`. We add an optional `bracket` field to `BuildMatchTimelineParams` so the function can compute final dampening via `getDampeningPercentage`. The block is appended **after** the sorted timeline entries, not via `addEntry` (it always goes last regardless of timestamp order). Callers in `printMatchPrompts.ts` and `index.tsx` are updated to pass `bracket`.

**Tech Stack:** TypeScript, Jest (`packages/shared`), `utils.ts` (CombatAIAnalysis), `dampening.ts`.

---

## File Map

| File                                                                                      | Change                                                                                                            |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`                   | Add `bracket?: string` to `BuildMatchTimelineParams`; import `getDampeningPercentage`; append `[MATCH END]` block |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` | Tests for `[MATCH END]` block                                                                                     |
| `packages/tools/src/printMatchPrompts.ts`                                                 | Pass `bracket` to `buildMatchTimeline` at two call sites                                                          |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx`                  | Pass `bracket` to `buildMatchTimeline` at one call site                                                           |

---

## Output Format Reference

The `[MATCH END]` block always appears as the last lines of the timeline output:

```
5:00  [MATCH END]   damp: 35%
  friends 1:45% 2:dead(1:23) 3:18% / enemies 4:22% 5:dead(2:45) 6:61%
```

- **Header line**: `{duration}  [MATCH END]   damp: {X}%` — omit `damp:` part when `bracket` is not provided
- **State line**: same `pid:pct%` format as `[STATE]`; dead players shown as `pid:dead(M:SS)` where M:SS is their death time; HP unknown shown as `pid:?`
- **No enemies**: state line shows `friends ...` only, no ` / enemies` part
- **No friends AND no enemies**: header line only (no state line)

---

## Task 1: Write failing tests for `[MATCH END]`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

Context: `buildMatchTimeline` is called via `makeBaseParams()`. The existing `makeBaseParams` sets `matchStartMs: 0` and `matchEndMs: 0`. Tests below use specific values. `makeUnit` is available from `testHelpers.ts` and now supports `advancedActions` overrides for HP snapshots.

- [ ] **Step 1: Add the new test describe block**

Find the end of the existing test file (after the F94 tests or wherever the last describe block ends). Add a new describe block:

```typescript
describe('buildMatchTimeline — [MATCH END] block', () => {
  it('emits [MATCH END] header at match end time', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        matchStartMs: 0,
        matchEndMs: 300_000,
      }),
    );
    expect(result).toContain('[MATCH END]');
    expect(result).toContain('5:00');
  });

  it('shows final dampening when bracket is provided', () => {
    // bracket=undefined → no damp line; bracket provided → damp shown
    const withBracket = buildMatchTimeline(
      makeBaseParams({
        matchStartMs: 0,
        matchEndMs: 300_000,
        bracket: '3v3',
      }),
    );
    expect(withBracket).toContain('damp:');

    const withoutBracket = buildMatchTimeline(
      makeBaseParams({
        matchStartMs: 0,
        matchEndMs: 300_000,
      }),
    );
    // No damp info when bracket is absent
    expect(withoutBracket).not.toContain('damp:');
  });

  it('shows surviving friend HP at match end using playerIdMap', () => {
    const friend = makeUnit('p1', {
      name: 'Feramonk',
      spec: CombatUnitSpec.Monk_Mistweaver,
      advancedActions: [
        makeAdvancedAction(295_000, 0, 0, 500_000, 225_000), // 45% HP at t=295s (5s before end)
      ],
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        matchStartMs: 0,
        matchEndMs: 300_000,
        friends: [friend],
        playerIdMap: new Map([['Feramonk', 1]]),
      }),
    );
    expect(result).toContain('[MATCH END]');
    // Friend shown as pid:pct%
    expect(result).toContain('1:45%');
  });

  it('shows dead friend as dead(M:SS) rather than HP', () => {
    const friend = makeUnit('p1', {
      name: 'Feramonk',
      spec: CombatUnitSpec.Monk_Mistweaver,
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        matchStartMs: 0,
        matchEndMs: 300_000,
        friends: [friend],
        playerIdMap: new Map([['Feramonk', 1]]),
        friendlyDeaths: [{ spec: 'Mistweaver Monk', name: 'Feramonk', atSeconds: 83 }],
      }),
    );
    expect(result).toContain('[MATCH END]');
    expect(result).toContain('1:dead(1:23)');
  });

  it('shows enemy HP and dead enemies using enemyIdMap', () => {
    const enemy = makeUnit('e1', {
      name: 'EnemyMage',
      spec: CombatUnitSpec.Mage_Frost,
      advancedActions: [
        makeAdvancedAction(290_000, 0, 0, 600_000, 132_000), // 22% HP
      ],
    });
    const deadEnemy = makeUnit('e2', {
      name: 'EnemyWarrior',
      spec: CombatUnitSpec.None,
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        matchStartMs: 0,
        matchEndMs: 300_000,
        enemies: [enemy, deadEnemy],
        enemyIdMap: new Map([
          ['EnemyMage', 4],
          ['EnemyWarrior', 5],
        ]),
        enemyDeaths: [{ spec: 'Arms Warrior', name: 'EnemyWarrior', atSeconds: 165 }],
      }),
    );
    expect(result).toContain('[MATCH END]');
    // alive enemy shown as pct%
    expect(result).toContain('4:22%');
    // dead enemy shown as dead(M:SS)
    expect(result).toContain('5:dead(2:45)');
  });

  it('combines friends and enemies in one state line', () => {
    const friend = makeUnit('p1', {
      name: 'Feramonk',
      spec: CombatUnitSpec.Monk_Mistweaver,
      advancedActions: [makeAdvancedAction(295_000, 0, 0, 500_000, 250_000)], // 50%
    });
    const enemy = makeUnit('e1', {
      name: 'EnemyMage',
      spec: CombatUnitSpec.Mage_Frost,
      advancedActions: [makeAdvancedAction(295_000, 0, 0, 600_000, 120_000)], // 20%
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        matchStartMs: 0,
        matchEndMs: 300_000,
        friends: [friend],
        enemies: [enemy],
        playerIdMap: new Map([['Feramonk', 1]]),
        enemyIdMap: new Map([['EnemyMage', 4]]),
      }),
    );
    expect(result).toContain('friends');
    expect(result).toContain('/ enemies');
    expect(result).toContain('1:50%');
    expect(result).toContain('4:20%');
  });

  it('shows ? when HP data is unavailable for an alive player', () => {
    // Unit with no advancedActions — getUnitHpAtTimestamp returns null
    const friend = makeUnit('p1', {
      name: 'Feramonk',
      spec: CombatUnitSpec.Monk_Mistweaver,
      // No advancedActions set — HP data unavailable
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        matchStartMs: 0,
        matchEndMs: 300_000,
        friends: [friend],
        playerIdMap: new Map([['Feramonk', 1]]),
      }),
    );
    expect(result).toContain('[MATCH END]');
    expect(result).toContain('1:?');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm test -- --workspace=@wowarenalogs/shared --testPathPattern="timeline" 2>&1 | tail -20
```

Expected: tests in the new describe block FAIL (specifically the ones checking `bracket` field or `[MATCH END]` content — since the feature isn't implemented yet).

Note: If `bracket` doesn't exist on `BuildMatchTimelineParams` yet, TypeScript will give a compile error. That's expected — proceed to Task 2 to implement.

- [ ] **Step 3: Commit the failing tests**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "test(timeline): add [MATCH END] block tests (F78)"
```

---

## Task 2: Implement `[MATCH END]` block in `utils.ts`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Add `getDampeningPercentage` import**

Find the existing imports from `'../../../utils/dampening'` — there are none currently. Add a new import line after the existing imports block (around line 19):

```typescript
import { getDampeningPercentage } from '../../../utils/dampening';
```

- [ ] **Step 2: Add `bracket` to `BuildMatchTimelineParams`**

Find the `BuildMatchTimelineParams` interface (around line 1576). After `isHealer: boolean;`, add:

```typescript
  /**
   * Arena bracket string (e.g. '3v3', '2v2'). When provided, final dampening %
   * is included in the [MATCH END] block.
   */
  bracket?: string;
```

- [ ] **Step 3: Destructure `bracket` in `buildMatchTimeline`**

Find the destructuring at the top of `buildMatchTimeline` (around line 1621). Add `bracket` to the destructuring:

```typescript
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
  enemies,
  matchStartMs,
  matchEndMs,
  isHealer,
  playerIdMap,
  enemyIdMap,
  outgoingCCChains,
  resourceSnapshotFn,
  bracket,
} = params;
```

- [ ] **Step 4: Append the `[MATCH END]` block**

Find the final section of `buildMatchTimeline` (around line 2088):

```typescript
  // ── Sort and format ───────────────────────────────────────────────────────

  entries.sort((a, b) => a.timeSeconds - b.timeSeconds);

  const outputLines: string[] = ['MATCH TIMELINE', ''];
  for (const entry of entries) {
    outputLines.push(...entry.lines);
  }

  return outputLines.join('\n');
}
```

Replace it with:

```typescript
  // ── Sort and format ───────────────────────────────────────────────────────

  entries.sort((a, b) => a.timeSeconds - b.timeSeconds);

  const outputLines: string[] = ['MATCH TIMELINE', ''];
  for (const entry of entries) {
    outputLines.push(...entry.lines);
  }

  // ── [MATCH END] block ─────────────────────────────────────────────────────

  const matchEndSeconds = (matchEndMs - matchStartMs) / 1000;

  // Final dampening — only when bracket is available
  const finalDampPct = bracket
    ? getDampeningPercentage(bracket, [...friends, ...(enemies ?? [])], matchEndMs)
    : null;
  const dampStr = finalDampPct !== null ? `   damp: ${Math.round(finalDampPct)}%` : '';

  outputLines.push('');
  outputLines.push(`${fmtTime(matchEndSeconds)}  [MATCH END]${dampStr}`);

  // Build sets of dead players for quick lookup
  const deadFriendlyNames = new Set(friendlyDeaths.map((d) => d.name));
  const deadEnemyNames = new Set(enemyDeaths.map((d) => d.name));
  // For players who died multiple times, use the last death timestamp
  const friendDeathTimeByName = new Map<string, number>();
  for (const d of friendlyDeaths) friendDeathTimeByName.set(d.name, d.atSeconds);
  const enemyDeathTimeByName = new Map<string, number>();
  for (const d of enemyDeaths) enemyDeathTimeByName.set(d.name, d.atSeconds);

  // HP lookup window: 30s before match end — generous to handle late-game sparse advanced logs
  const HP_WINDOW_MS = 30_000;

  const friendParts = friends.map((u) => {
    if (deadFriendlyNames.has(u.name)) {
      const deathAt = friendDeathTimeByName.get(u.name)!;
      return `${pid(u.name)}:dead(${fmtTime(deathAt)})`;
    }
    const pct = getUnitHpAtTimestamp(u, matchEndMs, HP_WINDOW_MS);
    return `${pid(u.name)}:${pct !== null ? `${pct}%` : '?'}`;
  });

  const enemyParts = (enemies ?? []).map((u) => {
    if (deadEnemyNames.has(u.name)) {
      const deathAt = enemyDeathTimeByName.get(u.name)!;
      return `${enemyPid(u.name)}:dead(${fmtTime(deathAt)})`;
    }
    const pct = getUnitHpAtTimestamp(u, matchEndMs, HP_WINDOW_MS);
    return `${enemyPid(u.name)}:${pct !== null ? `${pct}%` : '?'}`;
  });

  const stateParts: string[] = [];
  if (friendParts.length > 0) stateParts.push(`friends ${friendParts.join(' ')}`);
  if (enemyParts.length > 0) stateParts.push(`enemies ${enemyParts.join(' ')}`);
  if (stateParts.length > 0) {
    outputLines.push(`  ${stateParts.join(' / ')}`);
  }

  return outputLines.join('\n');
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --workspace=@wowarenalogs/shared --testPathPattern="timeline" 2>&1 | tail -20
```

Expected: all tests in the new `[MATCH END]` describe block pass.

- [ ] **Step 6: Run full shared test suite**

```bash
npm test -- --workspace=@wowarenalogs/shared 2>&1 | tail -10
```

Expected: all 517+ tests pass (or whatever the current count is).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git commit -m "feat(timeline): append [MATCH END] block with final HP and dampening (F78)"
```

---

## Task 3: Wire `bracket` through callers

**Files:**

- Modify: `packages/tools/src/printMatchPrompts.ts` (2 call sites)
- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx` (1 call site)

**Background:** `bracket` is optional in `BuildMatchTimelineParams`, so callers compile without passing it. This task wires it through so production prompts include the final dampening in the `[MATCH END]` block. Since `bracket` is optional, tests that don't pass it continue to work as-is.

- [ ] **Step 1: Update `printMatchPrompts.ts` — `buildMatchPromptNew` call (around line 975)**

Find the `params: BuildMatchTimelineParams` object in `buildMatchPromptNew` (lines 975–995):

```typescript
const params: BuildMatchTimelineParams = {
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
  enemies,
  matchStartMs: combat.startTime,
  matchEndMs: combat.endTime,
  isHealer,
  playerIdMap,
  enemyIdMap,
  outgoingCCChains,
};
```

Add `bracket: combat.startInfo?.bracket ?? '3v3',` after `outgoingCCChains,`:

```typescript
const params: BuildMatchTimelineParams = {
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
  enemies,
  matchStartMs: combat.startTime,
  matchEndMs: combat.endTime,
  isHealer,
  playerIdMap,
  enemyIdMap,
  outgoingCCChains,
  bracket: combat.startInfo?.bracket ?? '3v3',
};
```

- [ ] **Step 2: Update `printMatchPrompts.ts` — `buildMatchPromptJsonSnapshot` call (around line 1103–1145)**

Find the second `buildMatchTimeline` call site in `buildMatchPromptJsonSnapshot`. It builds a similar `params` object. Read the file to find the exact location and add `bracket: combat.startInfo?.bracket ?? '3v3',` to that params object as well.

To find it:

```bash
grep -n "buildMatchTimeline\|const params" /Users/mingjianliu/code/wowarenalogs/packages/tools/src/printMatchPrompts.ts
```

Add `bracket: combat.startInfo?.bracket ?? '3v3',` to that second params object.

- [ ] **Step 3: Update `index.tsx` — `buildMatchTimeline` call (around line 247)**

Find the `buildMatchTimeline({...})` call in `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx` (around line 247). It currently passes:

```typescript
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
        enemies: enemies as ICombatUnit[],
        matchStartMs: combat.startTime,
        matchEndMs: combat.endTime,
        isHealer: healer,
        playerIdMap,
        enemyIdMap,
        outgoingCCChains,
      } as BuildMatchTimelineParams),
```

Add `bracket: combat.startInfo.bracket,` after `outgoingCCChains,`:

```typescript
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
        enemies: enemies as ICombatUnit[],
        matchStartMs: combat.startTime,
        matchEndMs: combat.endTime,
        isHealer: healer,
        playerIdMap,
        enemyIdMap,
        outgoingCCChains,
        bracket: combat.startInfo.bracket,
      } as BuildMatchTimelineParams),
```

- [ ] **Step 4: Run the full test suite**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm test 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/printMatchPrompts.ts
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx
git commit -m "feat(timeline): wire bracket to buildMatchTimeline for [MATCH END] dampening (F78)"
```

---

## Task 4: Update TRACKER.md

**Files:**

- Modify: `TRACKER.md`

- [ ] **Step 1: Remove F78 from the Open/Todo table**

In `TRACKER.md`, delete the F78 row:

```
| F78 | Backlog | Match-end final state summary — emit a closing block listing surviving HP per friend/enemy, dead players with death timestamps, and final dampening %. Especially valuable for high-dampening late games (35–41% observed in audit corpus). Source: 2026-05-02 healer prompt audit (M3). | `printMatchPrompts.ts` |
```

- [ ] **Step 2: Commit**

```bash
git add TRACKER.md
git commit -m "chore: mark F78 done in TRACKER"
```

---

## Self-Review

### Spec coverage

| Requirement                                   | Task                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| Closing block listing surviving HP per friend | Task 2 (`friendParts`)                                                  |
| Closing block listing surviving HP per enemy  | Task 2 (`enemyParts`)                                                   |
| Dead players with death timestamps            | Task 2 (`dead(M:SS)` notation)                                          |
| Final dampening %                             | Task 2 (`getDampeningPercentage` + `dampStr`)                           |
| Useful for high-dampening late games          | Addressed — block always emitted, dampening shown when bracket provided |
| Tests covering all cases                      | Task 1 (7 test cases)                                                   |
| Callers wired through                         | Task 3 (2 in printMatchPrompts, 1 in index.tsx)                         |

### Placeholder scan

No placeholders. All code blocks are complete.

### Type consistency

- `bracket?: string` — optional in `BuildMatchTimelineParams`, matches `combat.startInfo?.bracket` type at call sites
- `getDampeningPercentage(bracket, players, matchEndMs)` — third arg is absolute timestamp (ms), `matchEndMs` is absolute ms ✓
- `getUnitHpAtTimestamp(u, matchEndMs, HP_WINDOW_MS)` — second arg is absolute timestamp ms, `matchEndMs` is absolute ms ✓
- `fmtTime(matchEndSeconds)` — takes seconds, `matchEndSeconds = (matchEndMs - matchStartMs) / 1000` ✓
- `pid(u.name)` and `enemyPid(u.name)` — local functions in `buildMatchTimeline`, same as used by `[CLEANSE]` and `[STATE]` blocks ✓
- `friendDeathTimeByName` / `enemyDeathTimeByName` — typed `Map<string, number>`, values are `atSeconds` ✓

All names and types are consistent across all tasks.

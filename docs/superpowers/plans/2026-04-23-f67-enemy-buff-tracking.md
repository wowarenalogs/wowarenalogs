# F67 Enemy Active Buff Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit a `[ENEMY BUFFS]` line inside every `[RESOURCES]` snapshot block that shows which major buffs are currently active on enemy players — enabling Claude to evaluate whether PI was purgeable, whether purge was missed, and trade equity with stacked enemy buffs.

**Architecture:** Add a `MAJOR_ENEMY_BUFF_IDS` lookup table and a `getActiveEnemyBuffsAtMs()` helper inside `utils.ts`. Extend `ResourceSnapshotParams` with `enemies?: ICombatUnit[]` and `matchStartMs?: number`. The new `[ENEMY BUFFS]` line is appended conditionally (only when ≥1 buff is active) as a 4th line in `buildResourceSnapshot`'s output array. The `resourceSnapshot()` closure in `buildMatchTimeline` already has `enemies` and `matchStartMs` in scope — only the pass-through needs updating.

**Tech Stack:** TypeScript 4.6 strict, Jest (test runner: `npm run test -w @wowarenalogs/shared`)

---

## File Map

- **Modify:** `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`
  - Add `MAJOR_ENEMY_BUFF_IDS` constant (~line 62, after existing module-level constants)
  - Add `getActiveEnemyBuffsAtMs()` helper (after the constant)
  - Extend `ResourceSnapshotParams` interface (add `enemies?`, `matchStartMs?`)
  - Add `[ENEMY BUFFS]` line at end of `buildResourceSnapshot`
  - Update `resourceSnapshot()` closure in `buildMatchTimeline` to pass the new params

- **Modify:** `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`
  - New `describe('buildResourceSnapshot — [ENEMY BUFFS]', ...)` block with 4 tests

---

## Task 1: Write failing tests for [ENEMY BUFFS] line

**Files:**

- Test: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Add the failing test block**

Add this block near the end of the test file, after the existing `buildMatchTimeline` describe blocks:

```typescript
// ── buildResourceSnapshot — [ENEMY BUFFS] ────────────────────────────────────

describe('buildResourceSnapshot — [ENEMY BUFFS]', () => {
  const MATCH_START_MS = 1_000_000;

  function makeParams(enemyAuraEvents: ReturnType<typeof makeAuraEvent>[], timeSeconds: number) {
    const enemy = makeUnit('enemy-1', {
      name: 'Natjkis',
      auraEvents: enemyAuraEvents as any,
    });
    return {
      timeSeconds,
      ownerCDs: [],
      ownerName: 'Feramonk',
      ownerSpec: 'Discipline Priest',
      teammateCDs: [],
      ccTrinketSummaries: [],
      enemyCDTimeline: { alignedBurstWindows: [], players: [] },
      enemies: [enemy],
      matchStartMs: MATCH_START_MS,
    };
  }

  it('emits [ENEMY BUFFS] line when PI is active at snapshot time', () => {
    // PI applied at T=20s, not removed → still active at T=30s
    const lines = buildResourceSnapshot(
      makeParams([makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '10060', MATCH_START_MS + 20_000)], 30),
    );
    const buffsLine = lines.find((l) => l.includes('[ENEMY BUFFS]'));
    expect(buffsLine).toBeDefined();
    expect(buffsLine).toContain('Power Infusion');
    expect(buffsLine).toContain('[purgeable]');
    expect(buffsLine).toContain('Natjkis');
  });

  it('does not emit [ENEMY BUFFS] line when PI was removed before snapshot time', () => {
    // PI applied at T=20s, removed at T=25s → gone by T=30s
    const lines = buildResourceSnapshot(
      makeParams(
        [
          makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '10060', MATCH_START_MS + 20_000),
          makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '10060', MATCH_START_MS + 25_000),
        ],
        30,
      ),
    );
    expect(lines.some((l) => l.includes('[ENEMY BUFFS]'))).toBe(false);
  });

  it('emits [ENEMY BUFFS] without [purgeable] for Bloodlust', () => {
    const lines = buildResourceSnapshot(
      makeParams([makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '2825', MATCH_START_MS + 10_000)], 20),
    );
    const buffsLine = lines.find((l) => l.includes('[ENEMY BUFFS]'));
    expect(buffsLine).toBeDefined();
    expect(buffsLine).toContain('Bloodlust');
    expect(buffsLine).not.toContain('[purgeable]');
  });

  it('does not emit [ENEMY BUFFS] line when no tracked buffs are active', () => {
    // Untracked spell ID 99999 — should not trigger [ENEMY BUFFS]
    const lines = buildResourceSnapshot(
      makeParams([makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '99999', MATCH_START_MS + 5_000)], 30),
    );
    expect(lines.some((l) => l.includes('[ENEMY BUFFS]'))).toBe(false);
  });
});
```

Note: `buildResourceSnapshot` must be added to the imports from `'../utils'`. Check the current import at the top of the test file and add it if missing:

```typescript
import { buildMatchTimeline, BuildMatchTimelineParams, buildPlayerLoadout, buildResourceSnapshot } from '../utils';
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern="timeline.test" 2>&1 | tail -30
```

Expected: 4 new tests fail. `buildResourceSnapshot` may not be exported yet — that's expected. The `[ENEMY BUFFS]` functionality does not exist yet.

- [ ] **Step 3: Commit the failing tests**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "test(F67): add failing tests for [ENEMY BUFFS] in buildResourceSnapshot"
```

---

## Task 2: Add MAJOR_ENEMY_BUFF_IDS constant and getActiveEnemyBuffsAtMs helper

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Add the constant and helper after the DMG_SPIKE_THRESHOLD constant (~line 65)**

Locate the line:

```typescript
/** Minimum total damage for a pressure window to be treated as a [DMG SPIKE] event. */
export const DMG_SPIKE_THRESHOLD = 300_000;
```

Add after it:

```typescript
/** Major buffs on enemy players worth tracking for purge/trade-equity analysis. */
const MAJOR_ENEMY_BUFF_IDS: Record<string, { name: string; purgeable: boolean }> = {
  // Haste/damage amplifiers
  '2825': { name: 'Bloodlust', purgeable: false },
  '32182': { name: 'Heroism', purgeable: false },
  '80353': { name: 'Time Warp', purgeable: false },
  '90355': { name: 'Ancient Hysteria', purgeable: false },
  '264667': { name: 'Primal Rage', purgeable: false },
  // External DPS/healing amplifier
  '10060': { name: 'Power Infusion', purgeable: true },
  // Defensive externals from enemy healers
  '33206': { name: 'Pain Suppression', purgeable: true },
  '47788': { name: 'Guardian Spirit', purgeable: true },
  '6940': { name: 'Blessing of Sacrifice', purgeable: true },
  '1022': { name: 'Blessing of Protection', purgeable: true },
  '116849': { name: 'Life Cocoon', purgeable: true },
  // Personal immunities
  '642': { name: 'Divine Shield', purgeable: false },
  '45438': { name: 'Ice Block', purgeable: false },
};

interface ActiveEnemyBuff {
  playerName: string;
  buffName: string;
  purgeable: boolean;
}

/**
 * Returns major tracked buffs that are active on the given enemy units at `checkMs`.
 * Processes auraEvents linearly (chronological order assumed) and tracks APPLIED/REMOVED pairs.
 */
function getActiveEnemyBuffsAtMs(enemies: ICombatUnit[], checkMs: number): ActiveEnemyBuff[] {
  const result: ActiveEnemyBuff[] = [];
  const trackedIds = new Set(Object.keys(MAJOR_ENEMY_BUFF_IDS));

  for (const enemy of enemies) {
    const activeCount = new Map<string, number>(); // spellId → stack count
    for (const e of enemy.auraEvents) {
      if (!e.spellId || !trackedIds.has(e.spellId)) continue;
      if (e.logLine.timestamp > checkMs) continue;
      const ev = e.logLine.event;
      if (ev === LogEvent.SPELL_AURA_APPLIED) {
        activeCount.set(e.spellId, (activeCount.get(e.spellId) ?? 0) + 1);
      } else if (ev === LogEvent.SPELL_AURA_REMOVED) {
        const n = (activeCount.get(e.spellId) ?? 0) - 1;
        if (n <= 0) activeCount.delete(e.spellId);
        else activeCount.set(e.spellId, n);
      }
    }
    for (const spellId of activeCount.keys()) {
      const buff = MAJOR_ENEMY_BUFF_IDS[spellId];
      result.push({ playerName: enemy.name, buffName: buff.name, purgeable: buff.purgeable });
    }
  }
  return result;
}
```

The `LogEvent` import is already present at the top of the file (it's used in the `[OWNER CAST]` section). Verify it is in the import:

```typescript
import { ICombatUnit, LogEvent } from '@wowarenalogs/parser';
```

- [ ] **Step 2: Run tests (still failing, but should now compile)**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern="timeline.test" 2>&1 | tail -20
```

Expected: compile succeeds, tests still fail because `buildResourceSnapshot` doesn't produce `[ENEMY BUFFS]` yet.

---

## Task 3: Extend ResourceSnapshotParams and add [ENEMY BUFFS] line

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Extend the ResourceSnapshotParams interface**

Locate the interface (around line 992):

```typescript
export interface ResourceSnapshotParams {
  timeSeconds: number;
  ownerCDs: IMajorCooldownInfo[];
  ownerName: string;
  ownerSpec: string;
  teammateCDs: Array<{ player: ICombatUnit; spec: string; cds: IMajorCooldownInfo[] }>;
  ccTrinketSummaries: IPlayerCCTrinketSummary[];
  enemyCDTimeline: IEnemyCDTimeline;
  playerIdMap?: Map<string, number>;
}
```

Replace with:

```typescript
export interface ResourceSnapshotParams {
  timeSeconds: number;
  ownerCDs: IMajorCooldownInfo[];
  ownerName: string;
  ownerSpec: string;
  teammateCDs: Array<{ player: ICombatUnit; spec: string; cds: IMajorCooldownInfo[] }>;
  ccTrinketSummaries: IPlayerCCTrinketSummary[];
  enemyCDTimeline: IEnemyCDTimeline;
  playerIdMap?: Map<string, number>;
  /** Enemy player units for [ENEMY BUFFS] tracking. */
  enemies?: ICombatUnit[];
  /** Match start timestamp (ms) — required to convert timeSeconds → absolute ms for aura lookups. */
  matchStartMs?: number;
}
```

- [ ] **Step 2: Destructure the new params in buildResourceSnapshot**

Locate the function signature:

```typescript
export function buildResourceSnapshot({
  timeSeconds,
  ownerCDs,
  ownerName,
  ownerSpec,
  teammateCDs,
  ccTrinketSummaries,
  enemyCDTimeline,
  playerIdMap,
}: ResourceSnapshotParams): string[] {
```

Replace with:

```typescript
export function buildResourceSnapshot({
  timeSeconds,
  ownerCDs,
  ownerName,
  ownerSpec,
  teammateCDs,
  ccTrinketSummaries,
  enemyCDTimeline,
  playerIdMap,
  enemies,
  matchStartMs,
}: ResourceSnapshotParams): string[] {
```

- [ ] **Step 3: Add the [ENEMY BUFFS] line at the end of buildResourceSnapshot, before the return**

Locate the return statement at the end of `buildResourceSnapshot`:

```typescript
return [friendlyLine, enemyLine, ccLine];
```

Replace with:

```typescript
// ── Line 4: Active major buffs on enemy players ───────────────────────────
const lines: string[] = [friendlyLine, enemyLine, ccLine];

if (enemies && enemies.length > 0 && matchStartMs !== undefined) {
  const checkMs = matchStartMs + timeSeconds * 1000;
  const activeBuffs = getActiveEnemyBuffsAtMs(enemies, checkMs);
  if (activeBuffs.length > 0) {
    const buffParts = activeBuffs.map((b) => {
      const purgeTag = b.purgeable ? ' [purgeable]' : '';
      return `${b.playerName}: ${b.buffName}${purgeTag}`;
    });
    lines.push(`                   Enemy buffs: ${buffParts.join(', ')}`);
  }
}

return lines;
```

- [ ] **Step 4: Ensure buildResourceSnapshot is exported**

It is already exported (`export function buildResourceSnapshot`). No change needed.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern="timeline.test" 2>&1 | tail -30
```

Expected: All 4 new `[ENEMY BUFFS]` tests pass. Existing tests must remain green.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git commit -m "feat(F67): add [ENEMY BUFFS] line to buildResourceSnapshot"
```

---

## Task 4: Wire enemies and matchStartMs through the resourceSnapshot closure

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

The `resourceSnapshot()` closure inside `buildMatchTimeline` calls `buildResourceSnapshot` but does not yet pass `enemies` or `matchStartMs`. Both are already in scope from the outer `params` destructure.

- [ ] **Step 1: Update the resourceSnapshot closure**

Locate the closure (around line 1204):

```typescript
function resourceSnapshot(timeSeconds: number): string[] {
  return buildResourceSnapshot({
    timeSeconds,
    ownerCDs,
    ownerName: owner.name,
    ownerSpec,
    teammateCDs,
    ccTrinketSummaries,
    enemyCDTimeline,
    playerIdMap,
  });
}
```

Replace with:

```typescript
function resourceSnapshot(timeSeconds: number): string[] {
  return buildResourceSnapshot({
    timeSeconds,
    ownerCDs,
    ownerName: owner.name,
    ownerSpec,
    teammateCDs,
    ccTrinketSummaries,
    enemyCDTimeline,
    playerIdMap,
    enemies,
    matchStartMs,
  });
}
```

- [ ] **Step 2: Run the full test suite**

```bash
npm run test -w @wowarenalogs/shared 2>&1 | tail -30
```

Expected: All tests pass, no regressions.

- [ ] **Step 3: Run lint**

```bash
npm run lint 2>&1 | tail -20
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git commit -m "feat(F67): wire enemies+matchStartMs through resourceSnapshot closure in buildMatchTimeline"
```

---

## Task 5: Mark F67 done in TRACKER.md

**Files:**

- Modify: `TRACKER.md`

- [ ] **Step 1: Update TRACKER.md**

In `TRACKER.md`, find the F67 row:

```
| F67     | Backlog | Enemy active buff tracking — emit a `[ENEMY BUFFS]` snapshot ...
```

Change to:

```
| ~~F67~~ | ✅ Done | Enemy active buff tracking — `buildResourceSnapshot` now calls `getActiveEnemyBuffsAtMs` to find major buffs (PI, Bloodlust variants, Pain Suppression, Guardian Spirit, immunities, etc.) active on enemy units at snapshot time. `[ENEMY BUFFS]` line appended to `[RESOURCES]` block when ≥1 buff is active; `[purgeable]` tag marks Magic-dispellable buffs. New fields `enemies?` and `matchStartMs?` added to `ResourceSnapshotParams`; `resourceSnapshot()` closure in `buildMatchTimeline` passes them through. | `utils.ts` (`buildResourceSnapshot`, `buildMatchTimeline`) |
```

- [ ] **Step 2: Commit**

```bash
git add TRACKER.md
git commit -m "chore: mark F67 done in tracker"
```

---

## Self-Review

**Spec coverage check:**

- ✅ `[ENEMY BUFFS]` emitted alongside `[RESOURCES]` blocks — implemented in `buildResourceSnapshot`
- ✅ Shows PI — in `MAJOR_ENEMY_BUFF_IDS` with `purgeable: true`
- ✅ Shows Bloodlust — in `MAJOR_ENEMY_BUFF_IDS` with `purgeable: false`
- ✅ Shows temporary absorbs — Life Cocoon (`116849`) in the table
- ✅ Purgeable annotation — `[purgeable]` tag on each buff where `purgeable: true`
- ✅ Only emitted when ≥1 buff active — conditional emit, no `—` noise when none
- ✅ Wire-through from `buildMatchTimeline` — resourceSnapshot closure updated

**Type consistency check:**

- `getActiveEnemyBuffsAtMs` returns `ActiveEnemyBuff[]` — used directly in the format loop, consistent
- `ResourceSnapshotParams.enemies` is `ICombatUnit[]` — same type as `BuildMatchTimelineParams.enemies`
- `matchStartMs` is `number` in both interfaces — consistent

**Placeholder scan:** No TODOs, no TBDs, no "handle edge cases" stubs — all code is complete.

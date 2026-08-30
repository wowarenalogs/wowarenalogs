# F67 Enemy Active Buff Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit a `[ENEMY BUFFS]` line alongside every `[RESOURCES]` block in the match timeline, showing major buffs (PI, Bloodlust, etc.) currently active on each enemy player, with a `[PURGEABLE]` tag where applicable.

**Architecture:** Pre-compute buff intervals for each enemy unit from their `auraEvents` in `extractEnemyMajorBuffIntervals`, then query those intervals at each resource snapshot time inside `buildResourceSnapshot`. The result is an optional 4th line in the resource block, emitted only when at least one enemy has an active tracked buff. No changes to the prompt shape or CombatAIAnalysis component are required.

**Tech Stack:** TypeScript, Jest, existing `ICombatUnit.auraEvents`, `LogEvent.SPELL_AURA_APPLIED/REMOVED` from `@wowarenalogs/parser`.

---

### Task 1: Write failing tests

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Add the failing test suite at the bottom of timeline.test.ts**

Add this entire block at the end of the file, before the final closing `});` if any, or after the last `describe` block:

```typescript
// ── buildMatchTimeline — F67 [ENEMY BUFFS] line ──────────────────────────────

describe('buildMatchTimeline — F67 [ENEMY BUFFS]', () => {
  function makeEnemyWithAura(
    id: string,
    name: string,
    spellId: string,
    appliedMs: number,
    removedMs: number,
  ): ICombatUnit {
    const { CombatUnitReaction } = require('@wowarenalogs/parser');
    return makeUnit(id, {
      name,
      reaction: CombatUnitReaction.Hostile,
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, spellId, appliedMs, 'src-1', id),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, spellId, removedMs, 'src-1', id),
      ],
    });
  }

  it('emits [ENEMY BUFFS] line on [OWNER CD] when enemy has Power Infusion active', () => {
    // PI active on Natjkis from 20s to 40s; owner CD cast at 30s
    const enemy = makeEnemyWithAura('enemy-1', 'Natjkis', '10060', 20_000, 40_000);
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        matchStartMs: 0,
        matchEndMs: 60_000,
        ownerCDs: [
          {
            spellId: '33206',
            spellName: 'Pain Suppression',
            tag: 'Defensive',
            cooldownSeconds: 180,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 30 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).toContain('[ENEMY BUFFS]');
    expect(result).toContain('Power Infusion');
  });

  it('marks Power Infusion as [PURGEABLE]', () => {
    const enemy = makeEnemyWithAura('enemy-1', 'Natjkis', '10060', 20_000, 40_000);
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        matchStartMs: 0,
        matchEndMs: 60_000,
        ownerCDs: [
          {
            spellId: '33206',
            spellName: 'Pain Suppression',
            tag: 'Defensive',
            cooldownSeconds: 180,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 30 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).toContain('[PURGEABLE]');
  });

  it('emits [ENEMY BUFFS] on [TEAMMATE CD] too', () => {
    const enemy = makeEnemyWithAura('enemy-1', 'Natjkis', '10060', 20_000, 40_000);
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        matchStartMs: 0,
        matchEndMs: 60_000,
        teammateCDs: [
          {
            player: makeOwner('Simplesauce'),
            spec: 'Unholy Death Knight',
            cds: [
              {
                spellId: '48707',
                spellName: 'Anti-Magic Shell',
                tag: 'Defensive',
                cooldownSeconds: 60,
                maxChargesDetected: 1,
                casts: [{ timeSeconds: 25 }],
                availableWindows: [],
                neverUsed: false,
              },
            ],
          },
        ],
      }),
    );
    expect(result).toContain('[ENEMY BUFFS]');
    expect(result).toContain('Power Infusion');
  });

  it('does NOT emit [ENEMY BUFFS] when no tracked buff is active at snapshot time', () => {
    // PI active 20–40s, owner CD at 50s (after PI expired)
    const enemy = makeEnemyWithAura('enemy-1', 'Natjkis', '10060', 20_000, 40_000);
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        matchStartMs: 0,
        matchEndMs: 60_000,
        ownerCDs: [
          {
            spellId: '33206',
            spellName: 'Pain Suppression',
            tag: 'Defensive',
            cooldownSeconds: 180,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 50 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).not.toContain('[ENEMY BUFFS]');
  });

  it('does NOT emit [ENEMY BUFFS] when enemies array is empty', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [],
        matchStartMs: 0,
        matchEndMs: 60_000,
        ownerCDs: [
          {
            spellId: '33206',
            spellName: 'Pain Suppression',
            tag: 'Defensive',
            cooldownSeconds: 180,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 30 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).not.toContain('[ENEMY BUFFS]');
  });

  it('marks Bloodlust as NOT purgeable', () => {
    const enemy = makeEnemyWithAura('enemy-1', 'Natjkis', '2825', 20_000, 40_000);
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        matchStartMs: 0,
        matchEndMs: 60_000,
        ownerCDs: [
          {
            spellId: '33206',
            spellName: 'Pain Suppression',
            tag: 'Defensive',
            cooldownSeconds: 180,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 30 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).toContain('[ENEMY BUFFS]');
    expect(result).toContain('Bloodlust');
    expect(result).not.toContain('[PURGEABLE]');
  });

  it('shows remaining seconds for active buff', () => {
    // PI active 20–50s, owner CD at 30s → 20s remaining
    const enemy = makeEnemyWithAura('enemy-1', 'Natjkis', '10060', 20_000, 50_000);
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        matchStartMs: 0,
        matchEndMs: 60_000,
        ownerCDs: [
          {
            spellId: '33206',
            spellName: 'Pain Suppression',
            tag: 'Defensive',
            cooldownSeconds: 180,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 30 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).toContain('20s left');
  });

  it('uses numeric enemy ID when enemyIdMap is provided', () => {
    const enemy = makeEnemyWithAura('enemy-1', 'Natjkis', '10060', 20_000, 40_000);
    const playerIdMap = new Map([['Feramonk', 1]]);
    const enemyIdMap = new Map([['Natjkis', 3]]);
    const result = buildMatchTimeline(
      makeBaseParams({
        enemies: [enemy],
        matchStartMs: 0,
        matchEndMs: 60_000,
        playerIdMap,
        enemyIdMap,
        ownerCDs: [
          {
            spellId: '33206',
            spellName: 'Pain Suppression',
            tag: 'Defensive',
            cooldownSeconds: 180,
            maxChargesDetected: 1,
            casts: [{ timeSeconds: 30 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).toContain('[ENEMY BUFFS]');
    // numeric ID '3' should appear in the buff line
    const buffLine = result.split('\n').find((l) => l.includes('[ENEMY BUFFS]'));
    expect(buffLine).toBeDefined();
    expect(buffLine).toContain('3');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/mingjianliu/code/wowarenalogs && npm run test -- --testPathPattern="timeline.test" 2>&1 | tail -30
```

Expected: Several failures mentioning `[ENEMY BUFFS]` not found, or test infrastructure issues. The test suite should compile but the `[ENEMY BUFFS]` assertions should fail.

- [ ] **Step 3: Commit the failing tests**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "test(F67): add failing tests for [ENEMY BUFFS] line in match timeline

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Add `ENEMY_MAJOR_BUFF_SPELL_IDS`, `IEnemyBuffInterval`, and `extractEnemyMajorBuffIntervals` to utils.ts

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Add the constant and interface after the `HEALER_CAST_SPELL_ID_TO_NAME` block (around line 62, before `DMG_SPIKE_THRESHOLD`)**

In `utils.ts`, find the line:

```typescript
// ── Module-level constants shared across builders ──────────────────────────
```

Add immediately after the `HEALER_CAST_SPELL_ID_TO_NAME` object closes (after the line `};` that ends it) and before `// ── Module-level constants shared across builders ──`:

```typescript
// ── Enemy major buff tracking (F67) ──────────────────────────────────────────

const ENEMY_MAJOR_BUFF_SPELL_IDS: Record<string, { name: string; purgeable: boolean }> = {
  '10060': { name: 'Power Infusion', purgeable: true },
  '2825': { name: 'Bloodlust', purgeable: false },
  '32182': { name: 'Heroism', purgeable: false },
  '80353': { name: 'Time Warp', purgeable: false },
  '90355': { name: 'Ancient Hysteria', purgeable: false },
  '264667': { name: 'Primal Rage', purgeable: false },
};

export interface IEnemyBuffInterval {
  spellId: string;
  spellName: string;
  startSeconds: number;
  endSeconds: number;
  purgeable: boolean;
}

/**
 * Scans each enemy unit's auraEvents and returns intervals during which a major
 * tracked buff (PI, Bloodlust, etc.) was active.  Unclosed buffs at match end are
 * clamped to matchEndMs so a buff active at the final snapshot is still visible.
 */
export function extractEnemyMajorBuffIntervals(
  enemies: ICombatUnit[],
  matchStartMs: number,
  matchEndMs: number,
): Map<string, IEnemyBuffInterval[]> {
  const result = new Map<string, IEnemyBuffInterval[]>();

  for (const enemy of enemies) {
    const intervals: IEnemyBuffInterval[] = [];
    // key: "${spellId}:${srcUnitId}" → startMs
    const openBuffs = new Map<string, number>();

    for (const event of enemy.auraEvents) {
      const spellId = event.spellId ?? '';
      const buffDef = ENEMY_MAJOR_BUFF_SPELL_IDS[spellId];
      if (!buffDef) continue;

      const stateKey = `${spellId}:${event.srcUnitId}`;
      const ts: number = event.logLine.timestamp;

      if (event.logLine.event === LogEvent.SPELL_AURA_APPLIED) {
        if (!openBuffs.has(stateKey)) {
          openBuffs.set(stateKey, ts);
        }
      } else if (event.logLine.event === LogEvent.SPELL_AURA_REMOVED) {
        const startMs = openBuffs.get(stateKey);
        if (startMs !== undefined) {
          intervals.push({
            spellId,
            spellName: buffDef.name,
            startSeconds: (startMs - matchStartMs) / 1000,
            endSeconds: (ts - matchStartMs) / 1000,
            purgeable: buffDef.purgeable,
          });
          openBuffs.delete(stateKey);
        }
      }
    }

    // Clamp any unclosed buffs to match end
    for (const [stateKey, startMs] of openBuffs) {
      const spellId = stateKey.split(':')[0];
      const buffDef = ENEMY_MAJOR_BUFF_SPELL_IDS[spellId];
      if (buffDef) {
        intervals.push({
          spellId,
          spellName: buffDef.name,
          startSeconds: (startMs - matchStartMs) / 1000,
          endSeconds: (matchEndMs - matchStartMs) / 1000,
          purgeable: buffDef.purgeable,
        });
      }
    }

    if (intervals.length > 0) {
      result.set(enemy.name, intervals);
    }
  }

  return result;
}
```

- [ ] **Step 2: Run lint to confirm no TS errors**

```bash
cd /Users/mingjianliu/code/wowarenalogs && npm run lint -- --max-warnings=0 2>&1 | grep -E "error|warning|✓" | head -20
```

Expected: No new errors from the added code. If there are `no-unused-vars` errors, verify the export is correct.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git commit -m "feat(F67): add ENEMY_MAJOR_BUFF_SPELL_IDS constant and extractEnemyMajorBuffIntervals

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Update `ResourceSnapshotParams` and `buildResourceSnapshot` to emit `[ENEMY BUFFS]` line

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Extend `ResourceSnapshotParams` with enemy buff fields**

Find the `ResourceSnapshotParams` interface in utils.ts (around line 1001). Add two optional fields at the end before the closing `}`:

```typescript
  /**
   * Pre-computed enemy buff intervals from extractEnemyMajorBuffIntervals.
   * When provided, active buffs at timeSeconds are emitted as a [ENEMY BUFFS] line.
   */
  enemyBuffIntervals?: Map<string, IEnemyBuffInterval[]>;
  /**
   * Enemy player name → numeric ID. Used to compress enemy names in [ENEMY BUFFS].
   */
  enemyIdMap?: Map<string, number>;
```

So the full interface becomes:

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
  enemyBuffIntervals?: Map<string, IEnemyBuffInterval[]>;
  enemyIdMap?: Map<string, number>;
}
```

- [ ] **Step 2: Update `buildResourceSnapshot` to destructure the new fields and emit the buff line**

Find the opening of `buildResourceSnapshot`:

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

Replace it with:

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
  enemyBuffIntervals,
  enemyIdMap,
}: ResourceSnapshotParams): string[] {
```

Then find the end of the `buildResourceSnapshot` function, just before the `return [friendlyLine, enemyLine, ccLine];` statement. Add the enemy buff line computation and conditionally include it:

```typescript
// ── Line 4: Enemy active major buffs (F67) ────────────────────────────────
const enemyBuffParts: string[] = [];
if (enemyBuffIntervals) {
  function enemyBuffPid(name: string): string {
    if (!enemyIdMap) return name;
    const id = enemyIdMap.get(name);
    return id !== undefined ? String(id) : name;
  }
  for (const [enemyName, intervals] of enemyBuffIntervals) {
    const activeBuffs = intervals.filter((i) => i.startSeconds <= timeSeconds && timeSeconds < i.endSeconds);
    for (const buff of activeBuffs) {
      const remaining = Math.round(buff.endSeconds - timeSeconds);
      const purgeNote = buff.purgeable ? ' [PURGEABLE]' : '';
      enemyBuffParts.push(`${enemyBuffPid(enemyName)}:${buff.spellName} (${remaining}s left${purgeNote})`);
    }
  }
}

const buffLine = enemyBuffParts.length > 0 ? `                   Enemy buffs: ${enemyBuffParts.join(' | ')}` : null;

return buffLine !== null ? [friendlyLine, enemyLine, ccLine, buffLine] : [friendlyLine, enemyLine, ccLine];
```

Replace the old `return [friendlyLine, enemyLine, ccLine];` with the above block.

- [ ] **Step 3: Run tests to see progress**

```bash
cd /Users/mingjianliu/code/wowarenalogs && npm run test -- --testPathPattern="timeline.test" 2>&1 | tail -40
```

Expected: The tests that check for `[ENEMY BUFFS]` still fail because `buildMatchTimeline` hasn't been updated to pass `enemyBuffIntervals` yet. Tests that check `[ENEMY BUFFS]` is absent (no buffs active) may pass now.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git commit -m "feat(F67): extend ResourceSnapshotParams with enemy buff fields and emit [ENEMY BUFFS] line

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Wire enemy buff intervals through `buildMatchTimeline`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Pre-compute `enemyBuffIntervals` in `buildMatchTimeline`**

Inside `buildMatchTimeline`, after the destructuring block (after `outgoingCCChains,` and `} = params;`), add:

```typescript
const enemyBuffIntervals = extractEnemyMajorBuffIntervals(enemies ?? [], matchStartMs, matchEndMs);
```

- [ ] **Step 2: Update the inner `resourceSnapshot` function to pass the new fields**

Find the `resourceSnapshot` inner function in `buildMatchTimeline`:

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
    enemyBuffIntervals,
    enemyIdMap,
  });
}
```

- [ ] **Step 3: Run the full test suite**

```bash
cd /Users/mingjianliu/code/wowarenalogs && npm run test -- --testPathPattern="timeline.test" 2>&1 | tail -40
```

Expected: All F67 tests pass. All previously-passing tests still pass.

- [ ] **Step 4: Run lint**

```bash
cd /Users/mingjianliu/code/wowarenalogs && npm run lint 2>&1 | tail -20
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git commit -m "feat(F67): wire extractEnemyMajorBuffIntervals into buildMatchTimeline resource snapshots

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Mark F67 done in TRACKER.md

**Files:**

- Modify: `TRACKER.md`

- [ ] **Step 1: Move F67 from Backlog to archive**

In `TRACKER.md`, remove the F67 row from the Features table:

```
| F67 | Backlog | Enemy active buff tracking — emit a `[ENEMY BUFFS]` snapshot alongside `[RESOURCES]` blocks showing major buffs active on each enemy player (PI, Bloodlust, temporary absorbs, etc.). Would allow Claude to evaluate: whether enemy PI was purgeable during a given window, whether purge was used or missed, and trade equity when enemy has stacked buffs active                                                                                             | `utils.ts` (`buildMatchTimeline`)                                        |
```

- [ ] **Step 2: Add F67 to TRACKER_ARCHIVE.md**

Open `TRACKER_ARCHIVE.md` and add to the completed features section:

```
| F67 | ✅ Done | Enemy active buff tracking — [ENEMY BUFFS] line alongside [RESOURCES] blocks; PI/Bloodlust/TW/etc.; [PURGEABLE] tag on magic buffs | `utils.ts` |
```

- [ ] **Step 3: Commit**

```bash
git add TRACKER.md TRACKER_ARCHIVE.md
git commit -m "chore: mark F67 done in tracker

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage check:**

| Requirement                                                  | Covered by                                                                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Emit `[ENEMY BUFFS]` snapshot alongside `[RESOURCES]` blocks | Task 3–4: added as 4th line in `buildResourceSnapshot`, called at every `[OWNER CD]` and `[TEAMMATE CD]` event                    |
| Show major buffs active on each enemy (PI, Bloodlust, etc.)  | Task 2: `ENEMY_MAJOR_BUFF_SPELL_IDS` covers PI, all Bloodlust variants (Bloodlust/Heroism/Time Warp/Ancient Hysteria/Primal Rage) |
| `[PURGEABLE]` tag where applicable                           | Task 3: appended when `buff.purgeable === true`                                                                                   |
| Allow Claude to evaluate whether enemy PI was purgeable      | Covered: PI has `purgeable: true`, appears with `[PURGEABLE]` tag                                                                 |
| Trade equity when enemy has stacked buffs active             | Covered: multiple buffs on multiple enemies each appear on the line                                                               |

**Placeholder scan:** No TBDs, TODOs, or vague instructions remain.

**Type consistency:**

- `IEnemyBuffInterval` defined in Task 2, referenced in Task 3 (`ResourceSnapshotParams`) and Task 4 — consistent.
- `extractEnemyMajorBuffIntervals` defined in Task 2, called in Task 4 — consistent signature `(enemies, matchStartMs, matchEndMs)`.
- `enemyBuffIntervals` in `BuildMatchTimelineParams` is NOT added — it's computed internally in `buildMatchTimeline` from existing `enemies`, `matchStartMs`, `matchEndMs` params (which already exist). No interface change needed for callers.

**Potential issue — `LogEvent` import**: `extractEnemyMajorBuffIntervals` uses `LogEvent.SPELL_AURA_APPLIED` and `LogEvent.SPELL_AURA_REMOVED`. `LogEvent` is already imported at the top of `utils.ts` (line 1: `import { ICombatUnit, LogEvent } from '@wowarenalogs/parser';`). No additional import needed.

**Edge case — buff active at match end (no REMOVED event)**: Handled in Task 2 by clamping open buffs to `matchEndMs`. The buff will correctly appear active in all snapshots from its start until match end.

**Edge case — no enemies or no tracked buffs**: `extractEnemyMajorBuffIntervals` returns an empty Map; `buildResourceSnapshot` skips the buff line (`buffLine === null`). Existing tests for no-buff scenarios confirm this.

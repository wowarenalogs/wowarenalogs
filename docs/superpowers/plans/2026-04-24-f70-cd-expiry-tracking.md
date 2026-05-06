# F70: CD Expiry Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit a `[CD EXPIRED]` timeline event when an owner CD's buff falls off — using the actual `SPELL_AURA_REMOVED` log event instead of forcing Claude to infer expiry from cast time + known duration.

**Architecture:** Add `extractOwnerCDBuffExpiry` to `utils.ts` that scans friendly units' aura events for `SPELL_AURA_REMOVED` events matching tracked owner CD spell IDs, matching each cast to the chronologically-next removal (with fallback to `cast.timeSeconds + spellEffectData[spellId].durationSeconds` when no aura event is found). Wire the resulting expiry events into `buildMatchTimeline` as `[CD EXPIRED]` entries, sorted alongside the existing timeline entries.

**Tech Stack:** TypeScript, Jest, existing `spellEffectData` (already has `durationSeconds` for all major CDs), `LogEvent.SPELL_AURA_REMOVED` from `@wowarenalogs/parser`.

---

### Task 1: Write failing tests for `extractOwnerCDBuffExpiry`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Add the failing test block at the end of `timeline.test.ts`**

Add this block after the last `describe(...)` block in the file:

```typescript
// ── extractOwnerCDBuffExpiry ──────────────────────────────────────────────────
import { extractOwnerCDBuffExpiry } from '../utils';

describe('extractOwnerCDBuffExpiry', () => {
  const MATCH_START_MS = 1_000_000;

  function makeCDWithCast(
    spellId: string,
    spellName: string,
    castAtSeconds: number,
    cooldownSeconds = 180,
  ): IMajorCooldownInfo {
    return {
      spellId,
      spellName,
      tag: 'Defensive',
      cooldownSeconds,
      maxChargesDetected: 1,
      casts: [{ timeSeconds: castAtSeconds }],
      availableWindows: [],
      neverUsed: false,
    };
  }

  it('returns expiry from SPELL_AURA_REMOVED when available (Pain Suppression = spellId 33206)', () => {
    const ownerId = 'owner-1';
    const owner = makeUnit(ownerId, { name: 'Healer' });
    const target = makeUnit('target-1', {
      name: 'Teammate',
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '33206', MATCH_START_MS + 10_000, ownerId, 'target-1'),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '33206', MATCH_START_MS + 17_500, ownerId, 'target-1'),
      ],
    });

    const cd = makeCDWithCast('33206', 'Pain Suppression', 10);
    const result = extractOwnerCDBuffExpiry([cd], ownerId, [owner, target], MATCH_START_MS);

    expect(result).toHaveLength(1);
    expect(result[0].spellId).toBe('33206');
    expect(result[0].spellName).toBe('Pain Suppression');
    expect(result[0].castAtSeconds).toBe(10);
    expect(result[0].expiresAtSeconds).toBeCloseTo(17.5, 1);
    expect(result[0].isEstimated).toBe(false);
  });

  it('falls back to cast + durationSeconds when no SPELL_AURA_REMOVED event exists', () => {
    const ownerId = 'owner-1';
    const owner = makeUnit(ownerId, { name: 'Healer' });
    // No aura events on any friend
    const cd = makeCDWithCast('33206', 'Pain Suppression', 10);
    const result = extractOwnerCDBuffExpiry([cd], ownerId, [owner], MATCH_START_MS);

    expect(result).toHaveLength(1);
    // spellEffectData['33206'].durationSeconds === 8
    expect(result[0].expiresAtSeconds).toBeCloseTo(18, 1); // 10 + 8
    expect(result[0].isEstimated).toBe(true);
  });

  it('skips CDs with no durationSeconds in spellEffectData', () => {
    const ownerId = 'owner-1';
    const owner = makeUnit(ownerId, { name: 'Healer' });
    // spellId '9999999' has no entry in spellEffectData
    const cd = makeCDWithCast('9999999', 'Unknown Spell', 10);
    const result = extractOwnerCDBuffExpiry([cd], ownerId, [owner], MATCH_START_MS);
    expect(result).toHaveLength(0);
  });

  it('ignores SPELL_AURA_REMOVED events cast by a different unit (not the owner)', () => {
    const ownerId = 'owner-1';
    const owner = makeUnit(ownerId, { name: 'Healer' });
    const target = makeUnit('target-1', {
      name: 'Teammate',
      auraEvents: [
        // Cast by 'other-healer', not by owner
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '33206', MATCH_START_MS + 17_500, 'other-healer', 'target-1'),
      ],
    });

    const cd = makeCDWithCast('33206', 'Pain Suppression', 10);
    const result = extractOwnerCDBuffExpiry([cd], ownerId, [owner, target], MATCH_START_MS);

    // Falls back to estimated since the removal was from a different caster
    expect(result[0].isEstimated).toBe(true);
  });

  it('matches two casts to their respective SPELL_AURA_REMOVED events in order', () => {
    const ownerId = 'owner-1';
    // Pain Suppression has maxChargesDetected 2 occasionally
    const target1 = makeUnit('target-1', {
      name: 'Teammate1',
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '33206', MATCH_START_MS + 10_000, ownerId, 'target-1'),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '33206', MATCH_START_MS + 17_500, ownerId, 'target-1'),
      ],
    });
    const target2 = makeUnit('target-2', {
      name: 'Teammate2',
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '33206', MATCH_START_MS + 40_000, ownerId, 'target-2'),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '33206', MATCH_START_MS + 47_000, ownerId, 'target-2'),
      ],
    });
    const owner = makeUnit(ownerId, { name: 'Healer' });

    const cd: IMajorCooldownInfo = {
      spellId: '33206',
      spellName: 'Pain Suppression',
      tag: 'Defensive',
      cooldownSeconds: 180,
      maxChargesDetected: 2,
      casts: [{ timeSeconds: 10 }, { timeSeconds: 40 }],
      availableWindows: [],
      neverUsed: false,
    };

    const result = extractOwnerCDBuffExpiry([cd], ownerId, [owner, target1, target2], MATCH_START_MS);

    expect(result).toHaveLength(2);
    expect(result[0].expiresAtSeconds).toBeCloseTo(17.5, 1);
    expect(result[0].isEstimated).toBe(false);
    expect(result[1].expiresAtSeconds).toBeCloseTo(47, 1);
    expect(result[1].isEstimated).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing tests to confirm they fail with "is not a function" or import error**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -- --testPathPattern="timeline.test.ts" 2>&1 | tail -30
```

Expected: Tests fail — `extractOwnerCDBuffExpiry` is not exported from `../utils`.

---

### Task 2: Implement `extractOwnerCDBuffExpiry`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Add the `spellEffectData` import**

At the top of `utils.ts`, after the existing imports, add:

```typescript
import { spellEffectData } from '../../../data/spellEffectData';
```

- [ ] **Step 2: Add the `ICDExpiryEvent` interface and `extractOwnerCDBuffExpiry` function**

Add this block immediately after the `extractEnemyMajorBuffIntervals` function (around line 145, before the `DMG_SPIKE_THRESHOLD` constant):

```typescript
// ── Owner CD buff expiry tracking (F70) ────────────────────────────────────────

export interface ICDExpiryEvent {
  spellId: string;
  spellName: string;
  castAtSeconds: number;
  expiresAtSeconds: number;
  /** true when no SPELL_AURA_REMOVED was found — expiry estimated from cast + known duration */
  isEstimated: boolean;
}

/**
 * For each owner CD cast, finds when the buff actually expired by matching to the
 * chronologically-next SPELL_AURA_REMOVED event (cast by `ownerId`) across all
 * friendly units.  Falls back to `cast.timeSeconds + spellEffectData[spellId].durationSeconds`
 * when no aura event is present.  Skips CDs with no durationSeconds in spellEffectData.
 */
export function extractOwnerCDBuffExpiry(
  ownerCDs: IMajorCooldownInfo[],
  ownerId: string,
  friends: ICombatUnit[],
  matchStartMs: number,
): ICDExpiryEvent[] {
  const result: ICDExpiryEvent[] = [];

  for (const cd of ownerCDs) {
    const duration = spellEffectData[cd.spellId]?.durationSeconds;
    if (!duration || duration <= 0) continue;

    // Collect all SPELL_AURA_REMOVED timestamps for this spell cast by the owner,
    // across all friendly units, sorted ascending.
    const removalTimestampsMs: number[] = [];
    for (const friend of friends) {
      for (const event of friend.auraEvents) {
        if (
          event.spellId === cd.spellId &&
          event.srcUnitId === ownerId &&
          (event.logLine.event as LogEvent) === LogEvent.SPELL_AURA_REMOVED
        ) {
          removalTimestampsMs.push(event.logLine.timestamp as number);
        }
      }
    }
    removalTimestampsMs.sort((a, b) => a - b);

    // Match each cast (ascending) to the chronologically-next removal after the cast.
    let removalIndex = 0;
    for (const cast of cd.casts) {
      const castMs = matchStartMs + cast.timeSeconds * 1000;

      // Skip removals that happened before this cast started (orphans / prior applications).
      while (removalIndex < removalTimestampsMs.length && removalTimestampsMs[removalIndex] < castMs) {
        removalIndex++;
      }

      let expiresAtSeconds: number;
      let isEstimated: boolean;

      if (removalIndex < removalTimestampsMs.length) {
        expiresAtSeconds = (removalTimestampsMs[removalIndex] - matchStartMs) / 1000;
        isEstimated = false;
        removalIndex++;
      } else {
        expiresAtSeconds = cast.timeSeconds + duration;
        isEstimated = true;
      }

      result.push({
        spellId: cd.spellId,
        spellName: cd.spellName,
        castAtSeconds: cast.timeSeconds,
        expiresAtSeconds,
        isEstimated,
      });
    }
  }

  return result;
}
```

- [ ] **Step 3: Run the extractOwnerCDBuffExpiry tests to verify they pass**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -- --testPathPattern="timeline.test.ts" --testNamePattern="extractOwnerCDBuffExpiry" 2>&1 | tail -20
```

Expected: All 5 tests in the `extractOwnerCDBuffExpiry` describe block pass.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "$(cat <<'EOF'
feat(F70): add extractOwnerCDBuffExpiry — match CD casts to SPELL_AURA_REMOVED events

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Write failing tests for `[CD EXPIRED]` in `buildMatchTimeline`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Add the `[CD EXPIRED]` timeline tests**

Add the following `describe` block after the `extractOwnerCDBuffExpiry` block:

```typescript
describe('buildMatchTimeline [CD EXPIRED] events', () => {
  const MATCH_START_MS = 1_000_000;
  const MATCH_END_MS = 1_120_000; // 120s match

  function baseParams(): BuildMatchTimelineParams {
    return {
      owner: makeUnit('owner-1', { name: 'Healer' }),
      ownerSpec: 'Discipline Priest',
      ownerCDs: [],
      teammateCDs: [],
      enemyCDTimeline: makeEnemyTimeline(),
      ccTrinketSummaries: [],
      dispelSummary: { missedCleanseWindows: [], allyCleanse: [] },
      friendlyDeaths: [],
      enemyDeaths: [],
      pressureWindows: [],
      healingGaps: [],
      friends: [],
      matchStartMs: MATCH_START_MS,
      matchEndMs: MATCH_END_MS,
      isHealer: true,
    };
  }

  it('emits [CD EXPIRED] at the SPELL_AURA_REMOVED timestamp when log event is present', () => {
    const ownerId = 'owner-1';
    const owner = makeUnit(ownerId, { name: 'Healer' });
    const teammate = makeUnit('tm-1', {
      name: 'Teammate',
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '33206', MATCH_START_MS + 10_000, ownerId, 'tm-1'),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '33206', MATCH_START_MS + 17_500, ownerId, 'tm-1'),
      ],
    });

    const cd: IMajorCooldownInfo = {
      spellId: '33206',
      spellName: 'Pain Suppression',
      tag: 'Defensive',
      cooldownSeconds: 180,
      maxChargesDetected: 1,
      casts: [{ timeSeconds: 10 }],
      availableWindows: [],
      neverUsed: false,
    };

    const params: BuildMatchTimelineParams = {
      ...baseParams(),
      owner,
      ownerCDs: [cd],
      friends: [owner, teammate],
    };

    const timeline = buildMatchTimeline(params);
    // Should contain a [CD EXPIRED] line at 0:17 (17.5s)
    expect(timeline).toContain('[CD EXPIRED]');
    expect(timeline).toContain('Pain Suppression');
    // Must NOT include "(estimated)" since the log event was found
    const expiryLine = timeline.split('\n').find((l) => l.includes('[CD EXPIRED]'));
    expect(expiryLine).toBeDefined();
    expect(expiryLine).not.toContain('(estimated)');
  });

  it('emits [CD EXPIRED] with (estimated) when no aura event exists', () => {
    const ownerId = 'owner-1';
    const owner = makeUnit(ownerId, { name: 'Healer' });

    const cd: IMajorCooldownInfo = {
      spellId: '33206',
      spellName: 'Pain Suppression',
      tag: 'Defensive',
      cooldownSeconds: 180,
      maxChargesDetected: 1,
      casts: [{ timeSeconds: 10 }],
      availableWindows: [],
      neverUsed: false,
    };

    const params: BuildMatchTimelineParams = {
      ...baseParams(),
      owner,
      ownerCDs: [cd],
      friends: [owner],
    };

    const timeline = buildMatchTimeline(params);
    expect(timeline).toContain('[CD EXPIRED]');
    const expiryLine = timeline.split('\n').find((l) => l.includes('[CD EXPIRED]'));
    expect(expiryLine).toBeDefined();
    expect(expiryLine).toContain('(estimated)');
    // Fallback: 10 + 8 = 18s → displays as 0:18
    expect(expiryLine).toContain('0:18');
  });

  it('does not emit [CD EXPIRED] for CDs with no durationSeconds in spellEffectData', () => {
    const ownerId = 'owner-1';
    const owner = makeUnit(ownerId, { name: 'Healer' });

    const cd: IMajorCooldownInfo = {
      spellId: '9999999',
      spellName: 'Unknown Spell',
      tag: 'Defensive',
      cooldownSeconds: 180,
      maxChargesDetected: 1,
      casts: [{ timeSeconds: 10 }],
      availableWindows: [],
      neverUsed: false,
    };

    const params: BuildMatchTimelineParams = {
      ...baseParams(),
      owner,
      ownerCDs: [cd],
      friends: [owner],
    };

    const timeline = buildMatchTimeline(params);
    expect(timeline).not.toContain('[CD EXPIRED]');
  });

  it('[CD EXPIRED] appears after [OWNER CD] and before the next CD event in sorted output', () => {
    const ownerId = 'owner-1';
    const owner = makeUnit(ownerId, { name: 'Healer' });

    const cd: IMajorCooldownInfo = {
      spellId: '33206',
      spellName: 'Pain Suppression',
      tag: 'Defensive',
      cooldownSeconds: 180,
      maxChargesDetected: 1,
      casts: [{ timeSeconds: 10 }],
      availableWindows: [],
      neverUsed: false,
    };

    const params: BuildMatchTimelineParams = {
      ...baseParams(),
      owner,
      ownerCDs: [cd],
      friends: [owner],
    };

    const timeline = buildMatchTimeline(params);
    const lines = timeline.split('\n');
    const ownerCDIndex = lines.findIndex((l) => l.includes('[OWNER CD]') && l.includes('Pain Suppression'));
    const expiredIndex = lines.findIndex((l) => l.includes('[CD EXPIRED]'));
    expect(ownerCDIndex).toBeGreaterThanOrEqual(0);
    expect(expiredIndex).toBeGreaterThan(ownerCDIndex);
  });
});
```

- [ ] **Step 2: Run the failing tests to confirm they fail**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -- --testPathPattern="timeline.test.ts" --testNamePattern="\[CD EXPIRED\]" 2>&1 | tail -20
```

Expected: Tests fail — `[CD EXPIRED]` not found in timeline output.

---

### Task 4: Wire `[CD EXPIRED]` events into `buildMatchTimeline`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Add the `[CD EXPIRED]` emission block in `buildMatchTimeline`**

In `buildMatchTimeline`, find the `// ── [OWNER CD] events` block (around line 1389). Immediately after the closing `}` of that block (after the last `}` of the `for (const cd of ownerCDs)` loop), add:

```typescript
// ── [CD EXPIRED] events (F70) ─────────────────────────────────────────────

const cdExpiryEvents = extractOwnerCDBuffExpiry(ownerCDs, owner.id, friends, matchStartMs);
for (const expiry of cdExpiryEvents) {
  const estimatedNote = expiry.isEstimated ? ' (estimated)' : '';
  addEntry(
    expiry.expiresAtSeconds,
    `${fmtTime(expiry.expiresAtSeconds)}  [CD EXPIRED]   ${expiry.spellName}${estimatedNote}`,
  );
}
```

The exact location to insert: find the end of the `[OWNER CD]` section block. In the current file the `[OWNER CD]` section ends around line 1403. The insertion point is the blank line between `[OWNER CD]` and `[OWNER CAST]` sections. Place the new block there:

```
  // ── [OWNER CD] events ───────────────────────────────────────────────────────

  for (const cd of ownerCDs) {
    for (const cast of cd.casts) {
      ...
      addEntry(...)
    }
  }

  // ── [CD EXPIRED] events (F70) ─────────────────────────────────────────────  ← INSERT HERE

  const cdExpiryEvents = extractOwnerCDBuffExpiry(ownerCDs, owner.id, friends, matchStartMs);
  for (const expiry of cdExpiryEvents) {
    const estimatedNote = expiry.isEstimated ? ' (estimated)' : '';
    addEntry(expiry.expiresAtSeconds, `${fmtTime(expiry.expiresAtSeconds)}  [CD EXPIRED]   ${expiry.spellName}${estimatedNote}`);
  }

  // ── [OWNER CAST] healer gap-filler (F61) ────────────────────────────────────
```

- [ ] **Step 2: Run the full `[CD EXPIRED]` test suite**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -- --testPathPattern="timeline.test.ts" 2>&1 | tail -30
```

Expected: All tests in `timeline.test.ts` pass — both `extractOwnerCDBuffExpiry` and `[CD EXPIRED]` describe blocks.

- [ ] **Step 3: Run the full test suite to verify no regressions**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test 2>&1 | tail -20
```

Expected: All existing tests pass, no new failures.

- [ ] **Step 4: Run the linter**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run lint 2>&1 | tail -20
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "$(cat <<'EOF'
feat(F70): emit [CD EXPIRED] in match timeline from SPELL_AURA_REMOVED log events

Uses actual aura removal timestamps when available; falls back to cast + known
duration from spellEffectData and marks estimated. Covers Pain Suppression, Avatar,
Recklessness, Touch of Karma, and all other major CDs with durationSeconds.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Update TRACKER.md

**Files:**

- Modify: `TRACKER.md`

- [ ] **Step 1: Mark F70 done in TRACKER.md**

Move F70 from the "Open / Todo" table to `TRACKER_ARCHIVE.md` and add a `✅ Done` entry in the archive. In `TRACKER.md`, delete the F70 row entirely.

In `TRACKER_ARCHIVE.md`, add under the Features section:

```markdown
| F70 | ✅ Done | Ability duration expiry tracking — `[CD EXPIRED]` events emitted from `SPELL_AURA_REMOVED` log events; fallback to `cast + duration` when no aura event found | `utils.ts` (`buildMatchTimeline`, `extractOwnerCDBuffExpiry`) |
```

- [ ] **Step 2: Commit tracker update**

```bash
git add TRACKER.md TRACKER_ARCHIVE.md
git commit -m "$(cat <<'EOF'
chore: mark F70 done in tracker

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

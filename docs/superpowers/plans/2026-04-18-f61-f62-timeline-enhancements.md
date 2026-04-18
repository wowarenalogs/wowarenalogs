# F61 + F62: Timeline Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `[OWNER CAST]` healer gap-filler entries (F61) and 1s-resolution HP ticks in critical windows (F62) to `buildMatchTimeline`.

**Architecture:** Both changes are self-contained edits to `buildMatchTimeline` in `utils.ts` plus matching tests in `timeline.test.ts`. F61 adds a new timeline section after `[OWNER CD]`; F62 replaces the flat 3s HP tick loop with a pre-computed tick-set algorithm. No interface changes; all required data is already in `BuildMatchTimelineParams`.

**Tech Stack:** TypeScript 4.6 strict, Jest, `@wowarenalogs/parser` (ICombatUnit, LogEvent)

---

## File Map

| File                                                                                      | Change                                                                                                                                |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`                   | Add `HEALER_CAST_SPELL_ID_TO_NAME` constant, add `LogEvent` import, add F61 section, replace HP tick loop with F62 tick-set algorithm |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` | Add F61 and F62 test cases                                                                                                            |

---

## Task 1: F61 — Write failing tests

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Add `makeSpellCastEvent` to the import from testHelpers**

Open `timeline.test.ts`. Change the existing import line:

```typescript
import { makeAdvancedAction, makeUnit } from '../../../../utils/__tests__/testHelpers';
```

To:

```typescript
import { makeAdvancedAction, makeSpellCastEvent, makeUnit } from '../../../../utils/__tests__/testHelpers';
```

- [ ] **Step 2: Append the F61 test suite to the end of the file**

```typescript
describe('buildMatchTimeline — [OWNER CAST] (F61 healer gap-filler)', () => {
  it('emits [OWNER CAST] for healer spell not tracked in ownerCDs when isHealer=true', () => {
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('108280', 30_000, 'team-1')], // HTT at T=30s
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: true,
        ownerCDs: [], // HTT not in ownerCDs
        matchStartMs: 0,
        matchEndMs: 60_000,
      }),
    );
    expect(result).toContain('[OWNER CAST]');
    expect(result).toContain('Healing Tide Totem');
    expect(result).toContain('0:30');
  });

  it('does not emit [OWNER CAST] when spell is already tracked in ownerCDs within ±1s', () => {
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('10060', 20_000, 'team-1')], // PI at T=20s
    });
    const piCD: IMajorCooldownInfo = {
      spellId: '10060',
      spellName: 'Power Infusion',
      tag: 'External',
      cooldownSeconds: 120,
      casts: [{ timeSeconds: 20 }], // already tracked at 20s
      availableWindows: [],
      neverUsed: false,
    };
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: true,
        ownerCDs: [piCD],
        matchStartMs: 0,
        matchEndMs: 60_000,
      }),
    );
    expect(result).not.toContain('[OWNER CAST]');
  });

  it('does not emit [OWNER CAST] when isHealer is false', () => {
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      spellCastEvents: [makeSpellCastEvent('108280', 30_000, 'team-1')], // HTT at T=30s
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: false,
        ownerCDs: [],
        matchStartMs: 0,
        matchEndMs: 60_000,
      }),
    );
    expect(result).not.toContain('[OWNER CAST]');
  });

  it('does not emit [OWNER CAST] for non-healer spell IDs', () => {
    const owner = makeUnit('unit-1', {
      name: 'Feramonk',
      // Spell ID 1 is not in HEALER_CAST_SPELL_ID_TO_NAME
      spellCastEvents: [makeSpellCastEvent('1', 30_000, 'team-1')],
    });
    const result = buildMatchTimeline(
      makeBaseParams({
        owner,
        isHealer: true,
        ownerCDs: [],
        matchStartMs: 0,
        matchEndMs: 60_000,
      }),
    );
    expect(result).not.toContain('[OWNER CAST]');
  });
});
```

- [ ] **Step 3: Run failing tests to confirm they fail for the right reason**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern=timeline.test 2>&1 | tail -30
```

Expected: 4 new failing tests with `TypeError` or `Cannot find name` (implementation not yet written). The existing 34 tests should still pass.

---

## Task 2: F61 — Implement

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Add `LogEvent` to the parser import at line 1**

Current line 1:

```typescript
import { ICombatUnit } from '@wowarenalogs/parser';
```

Replace with:

```typescript
import { ICombatUnit, LogEvent } from '@wowarenalogs/parser';
```

- [ ] **Step 2: Add the spell ID constant after the imports block (before any `export`)**

After the last `import` statement and before the first `export` or `// ──` comment, add:

```typescript
const HEALER_CAST_SPELL_ID_TO_NAME: Record<string, string> = {
  '10060': 'Power Infusion',
  '33206': 'Pain Suppression',
  '108280': 'Healing Tide Totem',
  '98008': 'Spirit Link Totem',
  '200183': 'Apotheosis',
  '265202': 'Holy Word: Salvation',
};
```

- [ ] **Step 3: Add the `[OWNER CAST]` section in `buildMatchTimeline`**

In `buildMatchTimeline`, find the `[OWNER CD]` section (around line 1017) which ends after its `for` loop. Insert the F61 section immediately after it, before the `// ── [TEAMMATE CD]` comment:

```typescript
// ── [OWNER CAST] events (healer gap-filler) ───────────────────────────────

if (isHealer) {
  const trackedCastsBySpellId = new Map<string, Set<number>>();
  for (const cd of ownerCDs) {
    trackedCastsBySpellId.set(cd.spellId, new Set(cd.casts.map((c) => Math.round(c.timeSeconds))));
  }

  for (const e of owner.spellCastEvents) {
    if (e.logLine.event !== LogEvent.SPELL_CAST_SUCCESS) continue;
    if (!e.spellId) continue;
    const spellName = HEALER_CAST_SPELL_ID_TO_NAME[e.spellId];
    if (!spellName) continue;

    const timeSeconds = (e.logLine.timestamp - matchStartMs) / 1000;
    const roundedT = Math.round(timeSeconds);
    const trackedSet = trackedCastsBySpellId.get(e.spellId);
    if (trackedSet && (trackedSet.has(roundedT - 1) || trackedSet.has(roundedT) || trackedSet.has(roundedT + 1))) {
      continue;
    }

    addEntry(timeSeconds, `${fmtTime(timeSeconds)}  [OWNER CAST]   ${spellName}`);
  }
}
```

- [ ] **Step 4: Run tests and confirm all pass**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern=timeline.test 2>&1 | tail -20
```

Expected: `Tests: 38 passed, 38 total` (34 existing + 4 new F61 tests).

- [ ] **Step 5: Run lint**

```bash
npm run lint -w @wowarenalogs/shared 2>&1 | tail -10
```

Expected: no warnings or errors.

---

## Task 3: F61 — Commit

- [ ] **Commit F61**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "$(cat <<'EOF'
feat(F61): emit [OWNER CAST] for healer CDs not captured by extractMajorCooldowns

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: F62 — Write failing tests

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Append the F62 test suite to the end of the file**

```typescript
describe('buildMatchTimeline — [HP] dense ticks in critical windows (F62)', () => {
  // Helper: unit with 1s HP snapshots from 0..N seconds
  function makeUnitWithHpData(durationSeconds: number): ICombatUnit {
    return makeUnit('unit-1', {
      name: 'Feramonk',
      advancedActions: Array.from({ length: durationSeconds + 1 }, (_, i) =>
        makeAdvancedAction(i * 1000, 0, 0, 500_000, 400_000),
      ),
    });
  }

  it('emits 1s-interval ticks inside DEATH window [T-10, T]', () => {
    const owner = makeUnitWithHpData(35);
    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [owner],
        friendlyDeaths: [{ spec: 'Disc Priest', name: 'Feramonk', atSeconds: 30 }],
        matchStartMs: 0,
        matchEndMs: 35_000,
      }),
    );
    // T=21 is inside window [20,30] — should appear
    expect(result).toContain('0:21');
    // T=18 is a multiple of 3 — should appear
    expect(result).toContain('0:18');
    // T=19 is NOT in window and NOT multiple of 3 — should be absent
    const hpLines = result.split('\n').filter((l) => l.includes('[HP]'));
    expect(hpLines.some((l) => l.startsWith('0:19'))).toBe(false);
  });

  it('emits 1s-interval ticks inside CC ON TEAM window [T, T+10]', () => {
    const owner = makeUnitWithHpData(35);
    const cc: ICCInstance = {
      atSeconds: 14,
      durationSeconds: 3,
      spellId: '853',
      spellName: 'Hammer of Justice',
      sourceName: 'Dzinked',
      sourceSpec: 'Holy Paladin',
      damageTakenDuring: 50_000,
      trinketState: 'available_unused',
      drInfo: null,
      distanceYards: null,
      losBlocked: null,
    };
    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [owner],
        ccTrinketSummaries: [{ ...makeEmptyCCTrinketSummary('Feramonk'), ccInstances: [cc] }],
        matchStartMs: 0,
        matchEndMs: 35_000,
      }),
    );
    // T=16 is inside window [14, 24] — should appear
    const hpLines = result.split('\n').filter((l) => l.includes('[HP]'));
    expect(hpLines.some((l) => l.startsWith('0:16'))).toBe(true);
    // T=13 is NOT in window and NOT multiple of 3 — should be absent
    expect(hpLines.some((l) => l.startsWith('0:13'))).toBe(false);
  });

  it('emits 1s-interval ticks inside DMG SPIKE window [T-5, T+5]', () => {
    const owner = makeUnitWithHpData(35);
    const spike: IDamageBucket = {
      fromSeconds: 20,
      toSeconds: 25,
      totalDamage: 400_000, // above 300k threshold
      targetName: 'Feramonk',
      targetSpec: 'Disc Priest',
    };
    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [owner],
        pressureWindows: [spike],
        matchStartMs: 0,
        matchEndMs: 35_000,
      }),
    );
    // T=16 is inside window [15, 25] — should appear
    const hpLines = result.split('\n').filter((l) => l.includes('[HP]'));
    expect(hpLines.some((l) => l.startsWith('0:16'))).toBe(true);
    // T=14 is NOT in window [15,25] and NOT multiple of 3 — should be absent
    expect(hpLines.some((l) => l.startsWith('0:14'))).toBe(false);
    // T=12 IS a multiple of 3 — should appear
    expect(hpLines.some((l) => l.startsWith('0:12'))).toBe(true);
  });

  it('emits no duplicate [HP] ticks when critical windows overlap', () => {
    const owner = makeUnitWithHpData(35);
    const spike: IDamageBucket = {
      fromSeconds: 26,
      toSeconds: 31,
      totalDamage: 400_000,
      targetName: 'Feramonk',
      targetSpec: 'Disc Priest',
    };
    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [owner],
        // DEATH window [20,30], DMG SPIKE window [21,31] — overlap at [21,30]
        friendlyDeaths: [{ spec: 'Disc Priest', name: 'Feramonk', atSeconds: 30 }],
        pressureWindows: [spike],
        matchStartMs: 0,
        matchEndMs: 35_000,
      }),
    );
    const hpLines = result.split('\n').filter((l) => l.includes('[HP]'));
    const tick25Lines = hpLines.filter((l) => l.startsWith('0:25'));
    expect(tick25Lines.length).toBe(1);
  });

  it('emits only 3s-interval ticks when no critical events exist', () => {
    const owner = makeUnitWithHpData(12);
    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [owner],
        matchStartMs: 0,
        matchEndMs: 12_000,
      }),
    );
    const hpLines = result.split('\n').filter((l) => l.includes('[HP]'));
    // Only multiples of 3: 0, 3, 6, 9, 12
    expect(hpLines.some((l) => l.startsWith('0:01'))).toBe(false);
    expect(hpLines.some((l) => l.startsWith('0:02'))).toBe(false);
    expect(hpLines.some((l) => l.startsWith('0:04'))).toBe(false);
    expect(hpLines.some((l) => l.startsWith('0:05'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing tests to confirm they fail for the right reason**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern=timeline.test 2>&1 | tail -30
```

Expected: 5 new failing tests. Existing 38 tests still pass.

---

## Task 5: F62 — Implement

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Replace the HP tick loop in `buildMatchTimeline`**

Find this section near the end of `buildMatchTimeline` (around line 1115):

```typescript
// ── [HP] ticks every 3s ───────────────────────────────────────────────────

const HP_TICK_INTERVAL_S = 3;
const matchDurationS = (matchEndMs - matchStartMs) / 1000;
for (let t = 0; t <= matchDurationS; t += HP_TICK_INTERVAL_S) {
  const tsMs = matchStartMs + t * 1000;
  const parts = friends
    .map((u) => {
      const pct = getUnitHpAtTimestamp(u, tsMs, HP_TICK_INTERVAL_S * 1000);
      return pct !== null ? `${pid(u.name)}:${pct}%` : null;
    })
    .filter((s): s is string => s !== null);
  if (parts.length > 0) {
    addEntry(t, `${fmtTime(t)}  [HP]   ${parts.join(' / ')}`);
  }
}
```

Replace it with:

```typescript
// ── [HP] ticks — 3s baseline, 1s inside critical windows ─────────────────

const matchDurationS = (matchEndMs - matchStartMs) / 1000;

const criticalWindows: Array<[number, number]> = [];
for (const d of friendlyDeaths) {
  criticalWindows.push([Math.max(0, d.atSeconds - 10), d.atSeconds]);
}
for (const pw of pressureWindows) {
  if (pw.totalDamage >= DMG_SPIKE_THRESHOLD) {
    criticalWindows.push([Math.max(0, pw.fromSeconds - 5), Math.min(matchDurationS, pw.fromSeconds + 5)]);
  }
}
for (const summary of ccTrinketSummaries) {
  for (const cc of summary.ccInstances) {
    criticalWindows.push([cc.atSeconds, Math.min(matchDurationS, cc.atSeconds + 10)]);
  }
}

const tickSet = new Set<number>();
for (let t = 0; t <= Math.ceil(matchDurationS); t++) {
  const inCriticalWindow = criticalWindows.some(([from, to]) => t >= from && t <= to);
  if (inCriticalWindow || t % 3 === 0) {
    tickSet.add(t);
  }
}

const HP_SAMPLE_WINDOW_MS = 3_000;
for (const t of [...tickSet].sort((a, b) => a - b)) {
  const tsMs = matchStartMs + t * 1000;
  const parts = friends
    .map((u) => {
      const pct = getUnitHpAtTimestamp(u, tsMs, HP_SAMPLE_WINDOW_MS);
      return pct !== null ? `${pid(u.name)}:${pct}%` : null;
    })
    .filter((s): s is string => s !== null);
  if (parts.length > 0) {
    addEntry(t, `${fmtTime(t)}  [HP]   ${parts.join(' / ')}`);
  }
}
```

Note: `DMG_SPIKE_THRESHOLD` is already defined earlier in `buildMatchTimeline` (as `const DMG_SPIKE_THRESHOLD = 300_000`). The F62 section reuses that same constant, so do NOT redefine it.

- [ ] **Step 2: Run all tests**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern=timeline.test 2>&1 | tail -20
```

Expected: `Tests: 43 passed, 43 total` (38 existing + 5 new F62 tests).

- [ ] **Step 3: Run lint**

```bash
npm run lint -w @wowarenalogs/shared 2>&1 | tail -10
```

Expected: no warnings or errors.

- [ ] **Step 4: Run full test suite to catch any regressions**

```bash
npm run test 2>&1 | tail -10
```

Expected: all tests pass.

---

## Task 6: F62 — Commit

- [ ] **Commit F62**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "$(cat <<'EOF'
feat(F62): dense [HP] ticks in critical windows (1s near deaths/spikes/CC)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update TRACKER.md

**Files:**

- Modify: `TRACKER.md`

- [ ] **Step 1: Mark F61 and F62 as Done in TRACKER.md**

In `TRACKER.md`, find the F61 and F62 rows in the Features table. Change their Sprint column from `Backlog` to `✅ Done` and add strikethrough to the row number (prefix with `~~` and suffix with `~~`), following the existing convention used by F59, F60, F63. The descriptions should stay unchanged.

- [ ] **Step 2: Commit TRACKER update**

```bash
git add TRACKER.md
git commit -m "$(cat <<'EOF'
chore: mark F61 and F62 as done in TRACKER

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

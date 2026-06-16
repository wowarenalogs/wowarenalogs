# F69: Healing Output Per Window — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Append a per-5s HPS block and overhealing % to `[OWNER CD]` timeline entries when the CD is a healing amplifier (PI, Innervate, Ascendance), so Claude can evaluate whether the ability generated real throughput or was wasted on overhealing.

**Architecture:** Add a `HEALING_AMPLIFIER_SPELL_IDS` constant and a `computeHealingInWindow` helper to `utils.ts`. In `buildMatchTimeline`'s `[OWNER CD]` section, check if the CD's `spellId` is in the amplifier set, then compute healing stats from `owner.healOut` over the buff's active window (using `spellEffectData` for duration) and append a `[HEALING]` line.

**Tech Stack:** TypeScript, Jest (existing test suite at `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`)

---

## File Map

| Action | Path                                                                                      | Responsibility                                                                              |
| ------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Modify | `packages/shared/src/utils/__tests__/testHelpers.ts`                                      | Add `makeHealEvent` factory + `healOut` override to `makeUnit`                              |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`                   | Add `HEALING_AMPLIFIER_SPELL_IDS`, `computeHealingInWindow`, wire into `buildMatchTimeline` |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` | Integration tests for `[HEALING]` line in timeline                                          |

---

## Task 1: Add `makeHealEvent` and `healOut` override to testHelpers

**Files:**

- Modify: `packages/shared/src/utils/__tests__/testHelpers.ts:120-165`

- [ ] **Step 1: Add `makeHealEvent` factory and `healOut` override to `makeUnit`**

In `testHelpers.ts`, add after the existing `makeDamageEvent` function (around line 40):

```typescript
/** Minimal SPELL_HEAL event (CombatHpUpdateAction shape). */
export function makeHealEvent(timestamp: number, srcUnitId: string, amount: number, overhealAmount = 0): AnyObj {
  return {
    logLine: { event: LogEvent.SPELL_HEAL, timestamp, parameters: [] },
    timestamp,
    amount,
    effectiveAmount: amount - overhealAmount,
    srcUnitId,
    srcUnitName: 'Healer',
    destUnitId: 'player-1',
    destUnitName: 'Target',
    spellId: '1',
    spellName: 'TestHeal',
    advancedActorMaxHp: 500_000,
    advancedActorCurrentHp: 400_000,
    advancedActorPositionX: 0,
    advancedActorPositionY: 0,
  };
}
```

In `makeUnit`, add `healOut?: AnyObj[]` to the `overrides` parameter object (around line 133):

```typescript
export function makeUnit(
  id: string,
  overrides: {
    name?: string;
    spec?: CombatUnitSpec;
    class?: CombatUnitClass;
    reaction?: CombatUnitReaction;
    spellCastEvents?: AnyObj[];
    auraEvents?: AnyObj[];
    damageIn?: AnyObj[];
    healOut?: AnyObj[]; // ← add this line
    advancedActions?: AnyObj[];
    info?: AnyObj | undefined;
  } = {},
): ICombatUnit {
  return {
    // ... existing fields unchanged ...
    healOut: (overrides.healOut ?? []) as ICombatUnit['healOut'], // ← add this line (replace `healOut: []`)
    // ...
  };
}
```

- [ ] **Step 2: Run tests to confirm nothing broke**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -- --testPathPattern="testHelpers|timeline"
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/utils/__tests__/testHelpers.ts
git commit -m "test: add makeHealEvent factory and healOut override to makeUnit"
```

---

## Task 2: Add `HEALING_AMPLIFIER_SPELL_IDS` and `computeHealingInWindow` to utils.ts

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`
- Test: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

Healing amplifiers tracked: Power Infusion (10060, 15s), Innervate (29166, 8s), Ascendance (114052, 15s).

- [ ] **Step 1: Write the failing tests for `computeHealingInWindow`**

In `timeline.test.ts`, add a new `describe` block after the existing ones:

```typescript
import { makeHealEvent, makeUnit } from '../../../../utils/__tests__/testHelpers';
import { computeHealingInWindow, HEALING_AMPLIFIER_SPELL_IDS } from '../utils';

describe('computeHealingInWindow', () => {
  const matchStartMs = 1_000_000;

  it('returns null when no healing events fall in the window', () => {
    const healOut = [] as any[];
    expect(computeHealingInWindow(healOut, matchStartMs, matchStartMs + 15_000)).toBeNull();
  });

  it('returns null when all healing events are outside the window', () => {
    const healOut = [makeHealEvent(matchStartMs - 1, 'healer-1', 50_000)];
    expect(computeHealingInWindow(healOut as any, matchStartMs, matchStartMs + 15_000)).toBeNull();
  });

  it('calculates HPS per 5s bucket for a 15s PI window', () => {
    // 150k healing at t=2s (bucket 0–5s), 100k at t=7s (bucket 5–10s), 50k at t=12s (bucket 10–15s)
    const healOut = [
      makeHealEvent(matchStartMs + 2_000, 'healer-1', 150_000),
      makeHealEvent(matchStartMs + 7_000, 'healer-1', 100_000),
      makeHealEvent(matchStartMs + 12_000, 'healer-1', 50_000),
    ];
    const result = computeHealingInWindow(healOut as any, matchStartMs, matchStartMs + 15_000);
    expect(result).not.toBeNull();
    expect(result!.buckets).toHaveLength(3);
    expect(result!.buckets[0]).toEqual({ fromSeconds: 0, toSeconds: 5, hps: 30_000 }); // 150k / 5s
    expect(result!.buckets[1]).toEqual({ fromSeconds: 5, toSeconds: 10, hps: 20_000 }); // 100k / 5s
    expect(result!.buckets[2]).toEqual({ fromSeconds: 10, toSeconds: 15, hps: 10_000 }); // 50k / 5s
  });

  it('handles a short 8s Innervate window with two buckets', () => {
    const healOut = [
      makeHealEvent(matchStartMs + 3_000, 'healer-1', 100_000),
      makeHealEvent(matchStartMs + 7_000, 'healer-1', 60_000),
    ];
    const result = computeHealingInWindow(healOut as any, matchStartMs, matchStartMs + 8_000);
    expect(result).not.toBeNull();
    expect(result!.buckets).toHaveLength(2);
    expect(result!.buckets[0]).toEqual({ fromSeconds: 0, toSeconds: 5, hps: 20_000 }); // 100k / 5s
    expect(result!.buckets[1]).toEqual({ fromSeconds: 5, toSeconds: 8, hps: 20_000 }); // 60k / 3s
  });

  it('calculates overheal % correctly', () => {
    const healOut = [
      makeHealEvent(matchStartMs + 2_000, 'healer-1', 100_000, 30_000), // 30k overheal
      makeHealEvent(matchStartMs + 7_000, 'healer-1', 100_000, 70_000), // 70k overheal
    ];
    const result = computeHealingInWindow(healOut as any, matchStartMs, matchStartMs + 15_000);
    expect(result).not.toBeNull();
    // total amount = 200k, total effective = 100k → 50% overheal
    expect(result!.overhealPct).toBe(50);
  });

  it('reports 0% overheal when no overheal', () => {
    const healOut = [makeHealEvent(matchStartMs + 2_000, 'healer-1', 100_000, 0)];
    const result = computeHealingInWindow(healOut as any, matchStartMs, matchStartMs + 15_000);
    expect(result!.overhealPct).toBe(0);
  });

  it('HEALING_AMPLIFIER_SPELL_IDS contains PI, Innervate, and Ascendance', () => {
    expect(HEALING_AMPLIFIER_SPELL_IDS.has('10060')).toBe(true); // PI
    expect(HEALING_AMPLIFIER_SPELL_IDS.has('29166')).toBe(true); // Innervate
    expect(HEALING_AMPLIFIER_SPELL_IDS.has('114052')).toBe(true); // Ascendance
    expect(HEALING_AMPLIFIER_SPELL_IDS.has('9999')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npm run test -- --testPathPattern="timeline"
```

Expected: FAIL — `computeHealingInWindow` and `HEALING_AMPLIFIER_SPELL_IDS` are not yet exported.

- [ ] **Step 3: Add `HEALING_AMPLIFIER_SPELL_IDS` constant to utils.ts**

In `utils.ts`, add after the `DMG_SPIKE_THRESHOLD` constant (around line 234):

```typescript
/**
 * Spell IDs for healing-amplifier CDs where we want to measure actual throughput
 * during the buff window (per-5s HPS + overheal %) and append a [HEALING] line.
 * Restricted to pure healing amps — excludes damage/utility hybrids.
 */
export const HEALING_AMPLIFIER_SPELL_IDS = new Set([
  '10060', // Power Infusion (15s)
  '29166', // Innervate (8s)
  '114052', // Ascendance (15s)
]);
```

- [ ] **Step 4: Add `computeHealingInWindow` function to utils.ts**

Add immediately after `HEALING_AMPLIFIER_SPELL_IDS` (after line 244):

```typescript
/**
 * Computes healing throughput during a CD's active window.
 * Returns per-5s HPS buckets and overall overheal % from `healOut` events.
 * Returns null if no healing events fall within [fromMs, toMs].
 *
 * Bucket boundaries use exclusive upper bound except for the last bucket which is inclusive,
 * so all events in the window are accounted for exactly once.
 */
export function computeHealingInWindow(
  healOut: ICombatUnit['healOut'],
  fromMs: number,
  toMs: number,
): { buckets: Array<{ fromSeconds: number; toSeconds: number; hps: number }>; overhealPct: number } | null {
  const events = healOut.filter((h) => h.logLine.timestamp >= fromMs && h.logLine.timestamp <= toMs);
  if (events.length === 0) return null;

  let totalAmount = 0;
  let totalEffective = 0;
  for (const h of events) {
    totalAmount += h.amount;
    totalEffective += h.effectiveAmount;
  }

  const windowSeconds = (toMs - fromMs) / 1000;
  const BUCKET_SIZE = 5;
  const buckets: Array<{ fromSeconds: number; toSeconds: number; hps: number }> = [];

  for (let bucketStart = 0; bucketStart < windowSeconds; bucketStart += BUCKET_SIZE) {
    const bucketEnd = Math.min(bucketStart + BUCKET_SIZE, windowSeconds);
    const isLastBucket = bucketEnd >= windowSeconds;
    const bucketFromMs = fromMs + bucketStart * 1000;
    const bucketToMs = fromMs + bucketEnd * 1000;
    const bucketDuration = bucketEnd - bucketStart;

    const bucketEffective = events
      .filter(
        (h) =>
          h.logLine.timestamp >= bucketFromMs &&
          (isLastBucket ? h.logLine.timestamp <= bucketToMs : h.logLine.timestamp < bucketToMs),
      )
      .reduce((sum, h) => sum + h.effectiveAmount, 0);

    buckets.push({ fromSeconds: bucketStart, toSeconds: bucketEnd, hps: bucketEffective / bucketDuration });
  }

  const overhealPct = totalAmount > 0 ? Math.round(((totalAmount - totalEffective) / totalAmount) * 100) : 0;
  return { buckets, overhealPct };
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
npm run test -- --testPathPattern="timeline"
```

Expected: all `computeHealingInWindow` and `HEALING_AMPLIFIER_SPELL_IDS` tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "feat(F69): add computeHealingInWindow and HEALING_AMPLIFIER_SPELL_IDS"
```

---

## Task 3: Wire `[HEALING]` line into `buildMatchTimeline` [OWNER CD] section

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts:1473-1487`
- Test: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Write failing integration tests for `[HEALING]` in timeline**

Add a new `describe` block in `timeline.test.ts` (after the `computeHealingInWindow` tests):

```typescript
describe('buildMatchTimeline — [HEALING] line on healing amplifier CDs', () => {
  const matchStartMs = 1_000_000;
  const matchEndMs = matchStartMs + 120_000;

  function makeBaseParams(ownerOverrides = {}, extraOwnerCDs: IMajorCooldownInfo[] = []): BuildMatchTimelineParams {
    const owner = makeUnit('healer-1', {
      name: 'Healer',
      ...ownerOverrides,
    });
    return {
      owner,
      ownerSpec: 'Holy Priest',
      ownerCDs: extraOwnerCDs,
      teammateCDs: [],
      enemyCDTimeline: makeEnemyTimeline(),
      ccTrinketSummaries: [],
      dispelSummary: { missedCleanseWindows: [], allyCleanse: [] },
      friendlyDeaths: [],
      enemyDeaths: [],
      pressureWindows: [],
      healingGaps: [],
      friends: [owner],
      matchStartMs,
      matchEndMs,
      isHealer: true,
    };
  }

  function makePICD(castAtSeconds: number): IMajorCooldownInfo {
    return {
      spellId: '10060',
      spellName: 'Power Infusion',
      tag: 'Healing',
      cooldownSeconds: 120,
      maxChargesDetected: 1,
      neverUsed: false,
      casts: [
        {
          timeSeconds: castAtSeconds,
          timingLabel: 'Unknown',
          timingContext: undefined,
          targetName: undefined,
          targetHpPct: undefined,
        },
      ],
      availableWindows: [],
    };
  }

  it('appends a [HEALING] line to [OWNER CD] entries for PI when healing occurred', () => {
    // PI cast at 10s; 150k healing at 12s (bucket 0–5 from cast), 100k at 17s (bucket 5–10), 50k at 22s (bucket 10–15)
    // Overheal: 0% (no overheal)
    const healEvents = [
      makeHealEvent(matchStartMs + 12_000, 'healer-1', 150_000),
      makeHealEvent(matchStartMs + 17_000, 'healer-1', 100_000),
      makeHealEvent(matchStartMs + 22_000, 'healer-1', 50_000),
    ];
    const params = makeBaseParams({ healOut: healEvents }, [makePICD(10)]);
    const timeline = buildMatchTimeline(params);

    expect(timeline).toContain('[OWNER CD]   Power Infusion');
    expect(timeline).toContain('[HEALING]');
    // 0–5s bucket: 150k / 5s = 30.0k HPS
    expect(timeline).toContain('0–5s: 30.0k HPS');
    // 5–10s bucket: 100k / 5s = 20.0k HPS
    expect(timeline).toContain('5–10s: 20.0k HPS');
    // 10–15s bucket: 50k / 5s = 10.0k HPS
    expect(timeline).toContain('10–15s: 10.0k HPS');
    expect(timeline).toContain('Overheal: 0%');
  });

  it('appends [HEALING] with overheal % when some healing was wasted', () => {
    // 100k raw, 40k overheal → 60% overheal
    const healEvents = [makeHealEvent(matchStartMs + 12_000, 'healer-1', 100_000, 60_000)];
    const params = makeBaseParams({ healOut: healEvents }, [makePICD(10)]);
    const timeline = buildMatchTimeline(params);
    expect(timeline).toContain('Overheal: 60%');
  });

  it('appends "No healing logged" when no healing events fall in the window', () => {
    // Healing event outside PI window (PI cast at 10s, duration 15s → window 10–25s; event at 30s)
    const healEvents = [makeHealEvent(matchStartMs + 30_000, 'healer-1', 100_000)];
    const params = makeBaseParams({ healOut: healEvents }, [makePICD(10)]);
    const timeline = buildMatchTimeline(params);
    expect(timeline).toContain('[HEALING]');
    expect(timeline).toContain('No healing logged during this window');
  });

  it('does NOT append [HEALING] for non-amplifier CDs like Pain Suppression (33206)', () => {
    const painSuppCD: IMajorCooldownInfo = {
      spellId: '33206',
      spellName: 'Pain Suppression',
      tag: 'Defensive',
      cooldownSeconds: 180,
      maxChargesDetected: 1,
      neverUsed: false,
      casts: [
        {
          timeSeconds: 10,
          timingLabel: 'Unknown',
          timingContext: undefined,
          targetName: undefined,
          targetHpPct: undefined,
        },
      ],
      availableWindows: [],
    };
    const healEvents = [makeHealEvent(matchStartMs + 12_000, 'healer-1', 100_000)];
    const params = makeBaseParams({ healOut: healEvents }, [painSuppCD]);
    const timeline = buildMatchTimeline(params);
    expect(timeline).not.toContain('[HEALING]');
  });
});
```

- [ ] **Step 2: Run to confirm the tests fail**

```bash
npm run test -- --testPathPattern="timeline"
```

Expected: FAIL — `[HEALING]` lines are not yet emitted.

- [ ] **Step 3: Wire healing stats into `buildMatchTimeline`'s `[OWNER CD]` section**

In `utils.ts`, find the `[OWNER CD] events` section (around line 1473). Replace:

```typescript
// ── [OWNER CD] events ───────────────────────────────────────────────────────

for (const cd of ownerCDs) {
  for (const cast of cd.casts) {
    const targetPart =
      cast.targetName !== undefined
        ? ` → ${pid(cast.targetName)}${cast.targetHpPct !== undefined ? ` (${cast.targetHpPct}% HP)` : ''}`
        : '';
    addEntry(
      cast.timeSeconds,
      `${fmtTime(cast.timeSeconds)}  [OWNER CD]   ${cd.spellName}${targetPart}`,
      ...resourceSnapshot(cast.timeSeconds),
    );
  }
}
```

With:

```typescript
// ── [OWNER CD] events ───────────────────────────────────────────────────────

for (const cd of ownerCDs) {
  for (const cast of cd.casts) {
    const targetPart =
      cast.targetName !== undefined
        ? ` → ${pid(cast.targetName)}${cast.targetHpPct !== undefined ? ` (${cast.targetHpPct}% HP)` : ''}`
        : '';

    const extraLines: string[] = [...resourceSnapshot(cast.timeSeconds)];

    if (HEALING_AMPLIFIER_SPELL_IDS.has(cd.spellId)) {
      const duration = spellEffectData[cd.spellId]?.durationSeconds;
      if (duration) {
        const fromMs = matchStartMs + cast.timeSeconds * 1000;
        const toMs = fromMs + duration * 1000;
        const healStats = computeHealingInWindow(owner.healOut, fromMs, toMs);
        if (healStats) {
          const bucketParts = healStats.buckets.map(
            (b) => `${b.fromSeconds}–${b.toSeconds}s: ${(b.hps / 1000).toFixed(1)}k HPS`,
          );
          extraLines.push(`      [HEALING]    ${bucketParts.join(' | ')} | Overheal: ${healStats.overhealPct}%`);
        } else {
          extraLines.push(`      [HEALING]    No healing logged during this window`);
        }
      }
    }

    addEntry(
      cast.timeSeconds,
      `${fmtTime(cast.timeSeconds)}  [OWNER CD]   ${cd.spellName}${targetPart}`,
      ...extraLines,
    );
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npm run test -- --testPathPattern="timeline"
```

Expected: all tests PASS.

- [ ] **Step 5: Run the full test suite and lint**

```bash
npm run test && npm run lint
```

Expected: 0 failures, 0 lint warnings.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "feat(F69): emit [HEALING] HPS block on healing-amplifier [OWNER CD] events"
```

---

## Task 4: Validate `[HEALING]` output across 20 real matches — fix until clean

**Files:**

- May modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

This task has no fixed steps — it is a **fix loop**. Run the prompt generator, read the output, identify issues, fix them in code, repeat. Stop when 20 consecutive matches produce no issues.

---

### What to look for

When inspecting the output, grep for `[HEALING]` and verify:

1. **Appears for healer matches with PI/Innervate/Ascendance only** — if `[HEALING]` appears under a non-amplifier CD (e.g., Pain Suppression, Life Cocoon), something is wrong with the `HEALING_AMPLIFIER_SPELL_IDS` check.
2. **Format is correct** — buckets look like `0–5s: 34.2k HPS | 5–10s: 28.1k HPS | Overheal: 12%`. Check for NaN, Infinity, or malformed numbers (e.g., if a bucket has zero duration due to a very short window).
3. **"No healing logged" appears occasionally but not excessively** — if every single match shows "No healing logged" for PI, the window calculation is likely wrong (off-by-one on matchStartMs, wrong duration, wrong unit's healOut).
4. **HPS numbers are plausible** — for a Resto Shaman Ascendance, expect 50–200k HPS range. If values are suspiciously low (sub-1k) or zero across all buckets, the healOut filter is broken.
5. **Non-healer matches do NOT emit `[HEALING]`** — the `[HEALING]` line should only appear when the log owner used one of the three amplifier spells as their CD.

---

### Iteration steps

- [ ] **Iteration: Run 20 matches and inspect**

```bash
npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 20 --new-prompt --healer 2>&1 | grep -A2 "\[HEALING\]" | head -80
```

Read every `[HEALING]` block in the output. If there are fewer than expected (e.g., a Holy Priest log has PI but no `[HEALING]`), also check:

```bash
npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 20 --new-prompt --healer 2>&1 | grep "\[OWNER CD\]\|\\[HEALING\]" | head -80
```

- [ ] **Fix any issues found** — edit `utils.ts` and re-run tests:

```bash
npm run test -- --testPathPattern="timeline"
```

- [ ] **Re-run the 20-match sweep** — repeat the grep commands above. Continue iterating until you complete one full 20-match sweep with no issues in the checklist above.

- [ ] **Commit all fixes as one commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git commit -m "fix(F69): prompt validation fixes from 20-match sweep"
```

(Skip this commit step if no fixes were needed.)

---

## Task 5: Mark F69 done in TRACKER.md

**Files:**

- Modify: `TRACKER.md`

- [ ] **Step 1: Move F69 from Backlog to Archive**

In `TRACKER.md`, remove the F69 row from the Features table.

In `TRACKER_ARCHIVE.md`, add F69 to the completed features section:

```
| F69 | ✅ Done | Healing output per window — [HEALING] HPS block + overheal % appended to [OWNER CD] events for PI, Innervate, Ascendance | `utils.ts` (`buildMatchTimeline`, `computeHealingInWindow`) |
```

- [ ] **Step 2: Commit**

```bash
git add TRACKER.md TRACKER_ARCHIVE.md
git commit -m "chore: mark F69 done in tracker"
```

---

## Self-Review

**Spec coverage:**

- ✅ Per-5s HPS block appended to PI, Innervate, Ascendance `[OWNER CD]` events
- ✅ Overhealing % included in the [HEALING] line
- ✅ Non-amplifier CDs are not affected
- ✅ Window uses actual buff duration from `spellEffectData` (PI: 15s, Innervate: 8s, Ascendance: 15s)
- ✅ "No healing logged" emitted when no events fall in the window (graceful fallback)
- ✅ Prompt validation loop: 20 real matches inspected for format correctness, plausible HPS values, and correct CD targeting

**Placeholder check:** No TODOs, TBDs, or "implement later" in any step. All code is shown in full.

**Type consistency:** `computeHealingInWindow` uses `ICombatUnit['healOut']` which matches the `owner.healOut` field in `buildMatchTimeline`. `HEALING_AMPLIFIER_SPELL_IDS` is a `Set<string>` matched against `cd.spellId: string`.

**Edge cases handled:**

- Innervate (8s): produces 2 buckets (`0–5s` and `5–8s`), last bucket HPS = healing / 3s
- Events exactly at window boundary (`toMs`): included by the `<= toMs` filter and the `isLastBucket` inclusive check
- No healing events in window: `null` return → "No healing logged" fallback line

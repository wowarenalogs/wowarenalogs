# F81: [OFFENSIVE WINDOW] Synthesized Marker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit a `[OFFENSIVE WINDOW]` header entry in the match timeline whenever an enemy aligned burst window (2+ enemy offensive CDs overlapping) coincides with a `[DMG SPIKE]` on a friendly target, so an AI reader immediately sees "kill attempt at 0:14–0:24" rather than having to reconstruct it from primitives.

**Architecture:** Inside `buildMatchTimeline` in `utils.ts`, we add an `[OFFENSIVE WINDOW]` section before the `[DEATH]` events section. For each `IAlignedBurstWindow` that has an overlapping `IDamageBucket` (damage ≥ 300k, within ±5s of burst start/end), we emit one header entry. Since entries are stable-sorted by timestamp and this section is added first, the header naturally appears before other events at the same timestamp.

**Tech Stack:** TypeScript, Jest (existing test suite in `timeline.test.ts`)

---

## File Map

| File                                                                                      | Change                                                                                      |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`                   | Add `[OFFENSIVE WINDOW]` section inside `buildMatchTimeline`, before `// ── [DEATH] events` |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` | Add tests for the new `[OFFENSIVE WINDOW]` behavior                                         |

---

### Task 1: Implement `[OFFENSIVE WINDOW]` entries in `buildMatchTimeline`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

The `buildMatchTimeline` function is around line 1580. Inside it, after the `addEntry` function definition (around line 1661) and BEFORE the `// ── [DEATH] events` comment (around line 1665), we insert the new section.

**Context — what's already in scope at the insertion point:**

- `enemyCDTimeline` — destructured from params, has `.alignedBurstWindows: IAlignedBurstWindow[]`
- `pressureWindows` — destructured from params, is `IDamageBucket[]`
- `DMG_SPIKE_THRESHOLD` — constant defined at top of file (`300_000`)
- `addEntry(timeSeconds, ...lines)` — closure just defined above
- `pid(name)` — closure for resolving friendly player name → numeric ID
- `fmtTime(seconds)` — imported utility

**Step 1: Read the file to confirm the exact insertion point**

Open `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` and find the line:

```typescript
// ── [DEATH] events ────────────────────────────────────────────────────────
```

(around line 1665). The insertion goes immediately BEFORE this comment.

**Step 2: Insert the `[OFFENSIVE WINDOW]` section**

Insert the following block immediately before `// ── [DEATH] events`:

```typescript
// ── [OFFENSIVE WINDOW] synthesized headers ─────────────────────────────────

for (const burst of enemyCDTimeline.alignedBurstWindows) {
  const overlappingSpike = pressureWindows.find(
    (pw) =>
      pw.totalDamage >= DMG_SPIKE_THRESHOLD &&
      pw.fromSeconds >= burst.fromSeconds - 5 &&
      pw.fromSeconds <= burst.toSeconds + 5,
  );
  if (!overlappingSpike) continue;
  const dmgM = (overlappingSpike.totalDamage / 1_000_000).toFixed(2);
  const cdNames = burst.activeCDs.map((c) => c.spellName).join(' + ');
  addEntry(
    burst.fromSeconds,
    `${fmtTime(burst.fromSeconds)}  [OFFENSIVE WINDOW]   ${fmtTime(burst.fromSeconds)}–${fmtTime(burst.toSeconds)} | ${burst.dangerLabel} | ${dmgM}M on ${pid(overlappingSpike.targetName)} (${overlappingSpike.targetSpec}) | CDs: ${cdNames}`,
  );
}
```

**Step 3: Run lint**

```bash
npm run lint -w @wowarenalogs/shared 2>&1 | tail -5
```

Expected: exit 0, no errors.

**Step 4: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts
git commit -m "feat(timeline): emit [OFFENSIVE WINDOW] header when burst+spike overlap (F81)"
```

---

### Task 2: Add tests for `[OFFENSIVE WINDOW]`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

The test file already imports `IEnemyCDTimeline` from `'../../../../utils/enemyCDs'`. The `makeBaseParams` helper at line 306 accepts overrides including `enemyCDTimeline` and `pressureWindows`. The `makeEnemyTimeline()` helper at line 48 creates an `IEnemyCDTimeline` with empty `alignedBurstWindows`.

An `IAlignedBurstWindow` has these fields (all required except `mostPressuredTarget`):

```typescript
{
  fromSeconds: number;
  toSeconds: number;
  activeCDs: Array<{ playerName: string; spellName: string; spellId: string }>;
  dangerScore: number;
  dangerLabel: 'Low' | 'Moderate' | 'High' | 'Critical';
  dampeningPct: number;
  damageInWindow: number;
  damageRatio: number;
  healerCCed: boolean;
}
```

**Step 1: Find where to insert the tests**

Open the test file and find the `describe` block that contains `'emits [DMG SPIKE] only for windows ≥300k'` (around line 770). Add the new `[OFFENSIVE WINDOW]` describe block immediately after the `[DMG SPIKE]` describe block (which ends before `'emits [HEALING GAP] only when isHealer is true'`).

**Step 2: Add the new describe block**

After the closing `});` of the `[DMG SPIKE]` test (around line 787), and before `it('damage unit legend string is self-consistent', ...)` (line 789), insert:

```typescript
describe('[OFFENSIVE WINDOW] synthesized headers', () => {
  const makeBurst = (
    fromSeconds: number,
    toSeconds: number,
    dangerLabel: 'Low' | 'Moderate' | 'High' | 'Critical' = 'Critical',
  ): IAlignedBurstWindow => ({
    fromSeconds,
    toSeconds,
    activeCDs: [
      { playerName: 'EnemyRogue', spellName: 'Shadow Blades', spellId: '121471' },
      { playerName: 'EnemyWarrior', spellName: 'Bladestorm', spellId: '227847' },
    ],
    dangerScore: 7.2,
    dangerLabel,
    dampeningPct: 0,
    damageInWindow: 840_000,
    damageRatio: 1.2,
    healerCCed: false,
  });

  const makeSpike = (fromSeconds: number, totalDamage = 840_000): IDamageBucket => ({
    fromSeconds,
    toSeconds: fromSeconds + 10,
    totalDamage,
    targetName: 'Feramonk',
    targetSpec: 'Holy Paladin',
  });

  it('emits [OFFENSIVE WINDOW] when burst window overlaps a qualifying spike', () => {
    const enemyCDTimeline: IEnemyCDTimeline = {
      players: [],
      alignedBurstWindows: [makeBurst(14, 24)],
    };
    const pressureWindows = [makeSpike(15)];
    const result = buildMatchTimeline(makeBaseParams({ enemyCDTimeline, pressureWindows }));
    expect(result).toContain('[OFFENSIVE WINDOW]');
    expect(result).toContain('0:14–0:24');
    expect(result).toContain('Critical');
    expect(result).toContain('0.84M');
    expect(result).toContain('Shadow Blades + Bladestorm');
  });

  it('does NOT emit [OFFENSIVE WINDOW] when spike is below DMG_SPIKE_THRESHOLD', () => {
    const enemyCDTimeline: IEnemyCDTimeline = {
      players: [],
      alignedBurstWindows: [makeBurst(14, 24)],
    };
    const pressureWindows = [makeSpike(15, 200_000)]; // below 300k threshold
    const result = buildMatchTimeline(makeBaseParams({ enemyCDTimeline, pressureWindows }));
    expect(result).not.toContain('[OFFENSIVE WINDOW]');
  });

  it('does NOT emit [OFFENSIVE WINDOW] when spike is outside burst window ±5s', () => {
    const enemyCDTimeline: IEnemyCDTimeline = {
      players: [],
      alignedBurstWindows: [makeBurst(14, 24)],
    };
    const pressureWindows = [makeSpike(31)]; // 31 > 24 + 5 = 29 → no overlap
    const result = buildMatchTimeline(makeBaseParams({ enemyCDTimeline, pressureWindows }));
    expect(result).not.toContain('[OFFENSIVE WINDOW]');
  });

  it('does NOT emit [OFFENSIVE WINDOW] when no aligned burst windows exist', () => {
    const pressureWindows = [makeSpike(15)];
    const result = buildMatchTimeline(makeBaseParams({ pressureWindows }));
    expect(result).not.toContain('[OFFENSIVE WINDOW]');
  });

  it('[OFFENSIVE WINDOW] sorts before [DMG SPIKE] at the same timestamp', () => {
    const enemyCDTimeline: IEnemyCDTimeline = {
      players: [],
      alignedBurstWindows: [makeBurst(15, 25)],
    };
    const pressureWindows = [makeSpike(15)];
    const result = buildMatchTimeline(makeBaseParams({ enemyCDTimeline, pressureWindows }));
    const offIdx = result.indexOf('[OFFENSIVE WINDOW]');
    const spikeIdx = result.indexOf('[DMG SPIKE]');
    expect(offIdx).toBeGreaterThanOrEqual(0);
    expect(spikeIdx).toBeGreaterThanOrEqual(0);
    expect(offIdx).toBeLessThan(spikeIdx);
  });
});
```

You'll also need to import `IAlignedBurstWindow` at the top of the test file. The current imports from `enemyCDs` are:

```typescript
import { IEnemyCDTimeline } from '../../../../utils/enemyCDs';
```

Change it to:

```typescript
import { IAlignedBurstWindow, IEnemyCDTimeline } from '../../../../utils/enemyCDs';
```

**Step 3: Run tests**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern timeline 2>&1 | tail -20
```

Expected: all tests pass.

**Step 4: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "test(timeline): add [OFFENSIVE WINDOW] tests (F81)"
```

---

### Task 3: Mark F81 done in TRACKER

**Files:**

- Modify: `TRACKER.md`

- [ ] **Step 1: Find and update the F81 row**

In `TRACKER.md`, find the row:

```
| F81 | Backlog | ...
```

Change `Backlog` to `✅ Done`.

- [ ] **Step 2: Commit**

```bash
git add TRACKER.md
git commit -m "chore: mark F81 done in TRACKER"
```

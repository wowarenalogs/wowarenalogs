# F66: AoE CC Target List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit `[CC CAST]` timeline events for AoE CC spells cast by friendly players, showing which enemy unit(s) were affected and how many.

**Architecture:** AoE CC spells (Psychic Scream, Intimidating Shout, Shockwave, etc.) produce multiple `SPELL_AURA_APPLIED` events — one per target hit — within milliseconds of each other. The existing `analyzeOutgoingCCChains` in `drAnalysis.ts` already collects per-enemy CC applications from friendly casters. This plan adds: (1) an `AOE_CC_SPELL_IDS` constant identifying which spells are AoE, (2) an `extractAoeCCEvents()` function that groups simultaneous applications into per-cast events, and (3) a `[CC CAST]` section in `buildMatchTimeline` that emits one line per AoE CC cast listing its targets.

**Tech Stack:** TypeScript, Jest (tests in `__tests__/drAnalysis.test.ts` and `__tests__/timeline.test.ts`), `IOutgoingCCChain[]` from `drAnalysis.ts`.

---

## File Map

| File                                                                                      | Change                                                                                       |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `packages/shared/src/utils/drAnalysis.ts`                                                 | Add `AOE_CC_SPELL_IDS` constant + `IAoeCCEvent` type + `extractAoeCCEvents()` function       |
| `packages/shared/src/utils/__tests__/drAnalysis.test.ts`                                  | New tests for `extractAoeCCEvents`                                                           |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`                   | Add optional `outgoingCCChains` param to `BuildMatchTimelineParams`; emit `[CC CAST]` events |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` | New tests for `[CC CAST]` in `buildMatchTimeline`                                            |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx`                  | Pass `outgoingCCChains` into `buildMatchTimeline` call                                       |

---

## Task 1: Define `AOE_CC_SPELL_IDS` and `IAoeCCEvent` in drAnalysis.ts

**Files:**

- Modify: `packages/shared/src/utils/drAnalysis.ts` (after the `DR_CATEGORY_MAP` constant, ~line 110)

These are spells that apply to **multiple** enemy targets from a single cast. Single-target CCs (Polymorph, Cyclone, Hex) are excluded — they already log one target.

- [ ] **Step 1: Add the constant and type to `drAnalysis.ts`**

Insert immediately after the closing brace of `DR_CATEGORY_MAP` (after line 110 of the current file):

```typescript
/**
 * Spell IDs whose single cast can apply CC to multiple enemy targets simultaneously.
 * Used to group SPELL_AURA_APPLIED events from analyzeOutgoingCCChains into per-cast AoE events.
 */
export const AOE_CC_SPELL_IDS = new Set<string>([
  '8122', // Psychic Scream (Priest)
  '5246', // Intimidating Shout (Warrior)
  '316593', // Intimidating Shout (rank 2)
  '316595', // Intimidating Shout (rank 3)
  '5484', // Howl of Terror (Warlock)
  '77505', // Shockwave (Warrior)
  '119381', // Leg Sweep (Monk)
  '20549', // War Stomp (Tauren racial)
  '99', // Incapacitating Roar (Druid Bear)
  '30283', // Shadowfury (Warlock) — small AoE on impact
  '255941', // Bursting Shot (Hunter) — disorients group
]);

export interface IAoeCCEvent {
  casterName: string;
  spellId: string;
  spellName: string;
  atSeconds: number;
  /** Each enemy target affected, in order of atSeconds */
  targets: Array<{ name: string; durationSeconds: number }>;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/src/utils/drAnalysis.ts
git commit -m "feat(F66): add AOE_CC_SPELL_IDS constant and IAoeCCEvent type"
```

---

## Task 2: Implement `extractAoeCCEvents()` in drAnalysis.ts

**Files:**

- Modify: `packages/shared/src/utils/drAnalysis.ts` (add after `analyzeOutgoingCCChains`, ~line 366)
- Test: `packages/shared/src/utils/__tests__/drAnalysis.test.ts`

**How grouping works:** Collect all applications from all chains where `spellId` is in `AOE_CC_SPELL_IDS`. Sort by `atSeconds`. Group by `(casterName, spellId)` where timestamps are within 0.5s of the first application in the group. Emit one `IAoeCCEvent` per group.

- [ ] **Step 1: Write the failing tests**

Add to `packages/shared/src/utils/__tests__/drAnalysis.test.ts`:

```typescript
import {
  AOE_CC_SPELL_IDS,
  computeIncomingDR,
  DR_RESET_MS,
  extractAoeCCEvents,
  getDRCategory,
  getDRLevel,
  getDRLevelAtTime,
  IAoeCCEvent,
  IDRInfo,
  IOutgoingCCChain,
} from '../drAnalysis';

// ── extractAoeCCEvents ────────────────────────────────────────────────────────

describe('extractAoeCCEvents', () => {
  function makeChain(
    targetName: string,
    applications: Array<{
      atSeconds: number;
      spellId: string;
      spellName: string;
      casterName: string;
      durationSeconds: number;
    }>,
  ): IOutgoingCCChain {
    return {
      targetName,
      targetSpec: 'Unknown',
      applications: applications.map((a) => ({
        ...a,
        casterSpec: 'Holy Priest',
        drInfo: { category: 'Disorient', level: 'Full' as const, sequenceIndex: 0 },
      })),
      hasWastedApplications: false,
    };
  }

  it('returns empty array when no chains provided', () => {
    expect(extractAoeCCEvents([])).toEqual([]);
  });

  it('returns empty array when no applications are AoE spells', () => {
    // Cyclone (33786) is single-target, not in AOE_CC_SPELL_IDS
    const chains = [
      makeChain('Enemy1', [
        { atSeconds: 10, spellId: '33786', spellName: 'Cyclone', casterName: 'Caster', durationSeconds: 6 },
      ]),
    ];
    expect(extractAoeCCEvents(chains)).toEqual([]);
  });

  it('groups two targets hit by Psychic Scream at the same timestamp', () => {
    const chains = [
      makeChain('Enemy1', [
        { atSeconds: 21, spellId: '8122', spellName: 'Psychic Scream', casterName: 'Caster', durationSeconds: 8 },
      ]),
      makeChain('Enemy2', [
        { atSeconds: 21, spellId: '8122', spellName: 'Psychic Scream', casterName: 'Caster', durationSeconds: 8 },
      ]),
    ];
    const result = extractAoeCCEvents(chains);
    expect(result).toHaveLength(1);
    expect(result[0].spellId).toBe('8122');
    expect(result[0].spellName).toBe('Psychic Scream');
    expect(result[0].atSeconds).toBe(21);
    expect(result[0].casterName).toBe('Caster');
    expect(result[0].targets).toHaveLength(2);
    expect(result[0].targets.map((t) => t.name)).toContain('Enemy1');
    expect(result[0].targets.map((t) => t.name)).toContain('Enemy2');
  });

  it('groups targets within 0.5s as the same cast', () => {
    const chains = [
      makeChain('Enemy1', [
        { atSeconds: 21.0, spellId: '8122', spellName: 'Psychic Scream', casterName: 'Caster', durationSeconds: 8 },
      ]),
      makeChain('Enemy2', [
        { atSeconds: 21.4, spellId: '8122', spellName: 'Psychic Scream', casterName: 'Caster', durationSeconds: 8 },
      ]),
    ];
    const result = extractAoeCCEvents(chains);
    expect(result).toHaveLength(1);
    expect(result[0].targets).toHaveLength(2);
  });

  it('does NOT group targets more than 0.5s apart (two separate casts)', () => {
    const chains = [
      makeChain('Enemy1', [
        { atSeconds: 21.0, spellId: '8122', spellName: 'Psychic Scream', casterName: 'Caster', durationSeconds: 8 },
      ]),
      makeChain('Enemy1', [
        { atSeconds: 35.0, spellId: '8122', spellName: 'Psychic Scream', casterName: 'Caster', durationSeconds: 8 },
      ]),
    ];
    const result = extractAoeCCEvents(chains);
    expect(result).toHaveLength(2);
  });

  it('does NOT group applications from different casters', () => {
    const chains = [
      makeChain('Enemy1', [
        { atSeconds: 21, spellId: '8122', spellName: 'Psychic Scream', casterName: 'CasterA', durationSeconds: 8 },
      ]),
      makeChain('Enemy2', [
        { atSeconds: 21, spellId: '8122', spellName: 'Psychic Scream', casterName: 'CasterB', durationSeconds: 8 },
      ]),
    ];
    const result = extractAoeCCEvents(chains);
    expect(result).toHaveLength(2);
    expect(result[0].casterName).toBe('CasterA');
    expect(result[1].casterName).toBe('CasterB');
  });

  it('does NOT group applications from different AoE spells', () => {
    const chains = [
      makeChain('Enemy1', [
        { atSeconds: 21, spellId: '8122', spellName: 'Psychic Scream', casterName: 'Caster', durationSeconds: 8 },
      ]),
      makeChain('Enemy2', [
        { atSeconds: 21, spellId: '5246', spellName: 'Intimidating Shout', casterName: 'Caster', durationSeconds: 8 },
      ]),
    ];
    const result = extractAoeCCEvents(chains);
    expect(result).toHaveLength(2);
  });

  it('only hit one enemy — still returns an event with 1 target', () => {
    const chains = [
      makeChain('Enemy1', [
        { atSeconds: 21, spellId: '8122', spellName: 'Psychic Scream', casterName: 'Caster', durationSeconds: 8 },
      ]),
    ];
    const result = extractAoeCCEvents(chains);
    expect(result).toHaveLength(1);
    expect(result[0].targets).toHaveLength(1);
  });

  it('returns events sorted by atSeconds', () => {
    const chains = [
      makeChain('Enemy1', [
        { atSeconds: 45, spellId: '8122', spellName: 'Psychic Scream', casterName: 'Caster', durationSeconds: 8 },
        { atSeconds: 21, spellId: '8122', spellName: 'Psychic Scream', casterName: 'Caster', durationSeconds: 8 },
      ]),
    ];
    const result = extractAoeCCEvents(chains);
    expect(result).toHaveLength(2);
    expect(result[0].atSeconds).toBe(21);
    expect(result[1].atSeconds).toBe(45);
  });

  it('records per-target durationSeconds', () => {
    const chains = [
      makeChain('Enemy1', [
        { atSeconds: 21, spellId: '5246', spellName: 'Intimidating Shout', casterName: 'Caster', durationSeconds: 8 },
      ]),
      makeChain('Enemy2', [
        { atSeconds: 21, spellId: '5246', spellName: 'Intimidating Shout', casterName: 'Caster', durationSeconds: 4 },
      ]),
    ];
    const result = extractAoeCCEvents(chains);
    expect(result[0].targets.find((t) => t.name === 'Enemy1')?.durationSeconds).toBe(8);
    expect(result[0].targets.find((t) => t.name === 'Enemy2')?.durationSeconds).toBe(4);
  });
});
```

- [ ] **Step 2: Run failing tests to verify they fail**

```bash
cd packages/shared && npx jest __tests__/drAnalysis.test.ts --testNamePattern="extractAoeCCEvents" --no-coverage 2>&1 | tail -20
```

Expected: FAIL with "extractAoeCCEvents is not a function" or similar.

- [ ] **Step 3: Implement `extractAoeCCEvents` in drAnalysis.ts**

Add after `analyzeOutgoingCCChains` (after line ~366):

```typescript
/**
 * Groups simultaneous AoE CC applications from outgoing CC chains into per-cast events.
 *
 * AoE CC (Psychic Scream, Intimidating Shout, etc.) produces one SPELL_AURA_APPLIED per
 * target hit within a single server tick (~50ms). This function groups applications from
 * the same caster and spell within a 0.5s window so Claude sees one event per cast with
 * all targets listed.
 *
 * Only spells in AOE_CC_SPELL_IDS are included; single-target CCs are skipped.
 */
export function extractAoeCCEvents(chains: IOutgoingCCChain[]): IAoeCCEvent[] {
  // Flatten all AoE applications from all chains, tagged with target name
  const flat: Array<{
    casterName: string;
    spellId: string;
    spellName: string;
    atSeconds: number;
    targetName: string;
    durationSeconds: number;
  }> = [];

  for (const chain of chains) {
    for (const app of chain.applications) {
      if (!AOE_CC_SPELL_IDS.has(app.spellId)) continue;
      flat.push({
        casterName: app.casterName,
        spellId: app.spellId,
        spellName: app.spellName,
        atSeconds: app.atSeconds,
        targetName: chain.targetName,
        durationSeconds: app.durationSeconds,
      });
    }
  }

  flat.sort((a, b) => a.atSeconds - b.atSeconds);

  const events: IAoeCCEvent[] = [];
  const GROUPING_WINDOW_S = 0.5;

  for (const app of flat) {
    // Find an existing event with the same caster+spell within the grouping window
    const existing = events.find(
      (e) =>
        e.casterName === app.casterName &&
        e.spellId === app.spellId &&
        Math.abs(e.atSeconds - app.atSeconds) <= GROUPING_WINDOW_S,
    );

    if (existing) {
      existing.targets.push({ name: app.targetName, durationSeconds: app.durationSeconds });
    } else {
      events.push({
        casterName: app.casterName,
        spellId: app.spellId,
        spellName: app.spellName,
        atSeconds: app.atSeconds,
        targets: [{ name: app.targetName, durationSeconds: app.durationSeconds }],
      });
    }
  }

  return events;
}
```

Also add `extractAoeCCEvents` and `IAoeCCEvent` to the import in the test file (update the import statement added in Step 1).

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/shared && npx jest __tests__/drAnalysis.test.ts --testNamePattern="extractAoeCCEvents" --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/utils/drAnalysis.ts packages/shared/src/utils/__tests__/drAnalysis.test.ts
git commit -m "feat(F66): implement extractAoeCCEvents to group AoE CC applications by cast"
```

---

## Task 3: Add `[CC CAST]` events to `buildMatchTimeline`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`
  - `BuildMatchTimelineParams` interface: add optional `outgoingCCChains?: IOutgoingCCChain[]`
  - `buildMatchTimeline`: destructure `outgoingCCChains`; emit `[CC CAST]` section
- Test: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

**Output format** for the new event type:

```
0:21  [CC CAST]   Psychic Scream (by 1) → 4, 5 [2 enemies]
```

- Caster name is compressed via `pid()` (or `enemyPid()` if enemy — but AoE CC is cast by friendlies, so `pid()`)
- Target names are compressed via `enemyPid()`
- `[N enemies]` count appended when N > 1 (single target omits count)

- [ ] **Step 1: Write failing tests**

Add to `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`:

```typescript
import { IOutgoingCCChain } from '../../../../utils/drAnalysis';

// ── buildMatchTimeline — [CC CAST] events ────────────────────────────────────

describe('buildMatchTimeline — [CC CAST] events', () => {
  function makeAoeCCChain(
    targetName: string,
    casterName: string,
    spellId: string,
    spellName: string,
    atSeconds: number,
    durationSeconds: number,
  ): IOutgoingCCChain {
    return {
      targetName,
      targetSpec: 'Shadow Priest',
      applications: [
        {
          atSeconds,
          durationSeconds,
          spellId,
          spellName,
          casterName,
          casterSpec: 'Holy Priest',
          drInfo: { category: 'Disorient', level: 'Full', sequenceIndex: 0 },
        },
      ],
      hasWastedApplications: false,
    };
  }

  it('emits nothing when outgoingCCChains is not provided', () => {
    const result = buildMatchTimeline(makeBaseParams());
    expect(result).not.toContain('[CC CAST]');
  });

  it('emits nothing when outgoingCCChains is empty', () => {
    const result = buildMatchTimeline(makeBaseParams({ outgoingCCChains: [] }));
    expect(result).not.toContain('[CC CAST]');
  });

  it('does not emit [CC CAST] for single-target CC (Cyclone 33786)', () => {
    const chains: IOutgoingCCChain[] = [makeAoeCCChain('EnemyA', 'Feramonk', '33786', 'Cyclone', 21, 6)];
    const result = buildMatchTimeline(makeBaseParams({ outgoingCCChains: chains }));
    expect(result).not.toContain('[CC CAST]');
  });

  it('emits [CC CAST] for Psychic Scream hitting 1 enemy', () => {
    const chains: IOutgoingCCChain[] = [makeAoeCCChain('EnemyA', 'Feramonk', '8122', 'Psychic Scream', 21, 8)];
    const result = buildMatchTimeline(makeBaseParams({ outgoingCCChains: chains }));
    expect(result).toContain('[CC CAST]');
    expect(result).toContain('Psychic Scream');
    expect(result).toContain('0:21');
  });

  it('emits [CC CAST] for Psychic Scream hitting 2 enemies, listing both targets and count', () => {
    const chains: IOutgoingCCChain[] = [
      makeAoeCCChain('EnemyA', 'Feramonk', '8122', 'Psychic Scream', 21, 8),
      makeAoeCCChain('EnemyB', 'Feramonk', '8122', 'Psychic Scream', 21, 8),
    ];
    const result = buildMatchTimeline(makeBaseParams({ outgoingCCChains: chains }));
    expect(result).toContain('[CC CAST]');
    expect(result).toContain('EnemyA');
    expect(result).toContain('EnemyB');
    expect(result).toContain('[2 enemies]');
  });

  it('emits one [CC CAST] line per cast event, not per target', () => {
    const chains: IOutgoingCCChain[] = [
      makeAoeCCChain('EnemyA', 'Feramonk', '8122', 'Psychic Scream', 21, 8),
      makeAoeCCChain('EnemyB', 'Feramonk', '8122', 'Psychic Scream', 21, 8),
      makeAoeCCChain('EnemyC', 'Feramonk', '8122', 'Psychic Scream', 21, 8),
    ];
    const result = buildMatchTimeline(makeBaseParams({ outgoingCCChains: chains }));
    const castLines = result.split('\n').filter((l) => l.includes('[CC CAST]'));
    expect(castLines).toHaveLength(1);
    expect(result).toContain('[3 enemies]');
  });

  it('uses enemyPid to compress enemy target names when idMaps are provided', () => {
    const chains: IOutgoingCCChain[] = [makeAoeCCChain('EnemyA', 'Feramonk', '8122', 'Psychic Scream', 21, 8)];
    const playerIdMap = new Map([['Feramonk', 1]]);
    const enemyIdMap = new Map([['EnemyA', 4]]);
    const result = buildMatchTimeline(makeBaseParams({ outgoingCCChains: chains, playerIdMap, enemyIdMap }));
    expect(result).toContain('[CC CAST]');
    // Caster compressed with pid (friendly)
    expect(result).toContain('1');
    // Target compressed with enemyPid
    expect(result).toContain('4');
  });

  it('emits separate [CC CAST] lines for separate casts of the same spell (> 0.5s apart)', () => {
    const chains: IOutgoingCCChain[] = [
      makeAoeCCChain('EnemyA', 'Feramonk', '8122', 'Psychic Scream', 21, 8),
      makeAoeCCChain('EnemyA', 'Feramonk', '8122', 'Psychic Scream', 45, 8),
    ];
    const result = buildMatchTimeline(makeBaseParams({ outgoingCCChains: chains }));
    const castLines = result.split('\n').filter((l) => l.includes('[CC CAST]'));
    expect(castLines).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
cd packages/shared && npx jest timeline.test.ts --testNamePattern="\[CC CAST\]" --no-coverage 2>&1 | tail -20
```

Expected: FAIL with "outgoingCCChains is not a recognized property" or missing `[CC CAST]` content.

- [ ] **Step 3: Add `outgoingCCChains` to `BuildMatchTimelineParams` in `utils.ts`**

Find the `BuildMatchTimelineParams` interface (around line 1119). Add the new optional field at the end:

```typescript
export interface BuildMatchTimelineParams {
  owner: ICombatUnit;
  ownerSpec: string;
  ownerCDs: IMajorCooldownInfo[];
  teammateCDs: Array<{ player: ICombatUnit; spec: string; cds: IMajorCooldownInfo[] }>;
  enemyCDTimeline: IEnemyCDTimeline;
  ccTrinketSummaries: IPlayerCCTrinketSummary[];
  dispelSummary: IDispelSummary;
  friendlyDeaths: Array<{ spec: string; name: string; atSeconds: number }>;
  enemyDeaths: Array<{ spec: string; name: string; atSeconds: number }>;
  pressureWindows: IDamageBucket[];
  healingGaps: IHealingGap[];
  friends: ICombatUnit[];
  enemies?: ICombatUnit[];
  matchStartMs: number;
  matchEndMs: number;
  isHealer: boolean;
  playerIdMap?: Map<string, number>;
  enemyIdMap?: Map<string, number>;
  /**
   * Outgoing CC chains from analyzeOutgoingCCChains. When provided, AoE CC spells
   * (Psychic Scream, Intimidating Shout, etc.) appear as [CC CAST] timeline events
   * showing which enemy units were affected.
   */
  outgoingCCChains?: IOutgoingCCChain[];
}
```

Also add the import at the top of `utils.ts`:

```typescript
import { extractAoeCCEvents, IOutgoingCCChain } from '../../../utils/drAnalysis';
```

(Check if `drAnalysis` is already imported; if so, add `extractAoeCCEvents` and `IOutgoingCCChain` to the existing import.)

- [ ] **Step 4: Destructure and emit `[CC CAST]` events in `buildMatchTimeline`**

In the `buildMatchTimeline` function, destructure `outgoingCCChains` from params:

```typescript
const {
  // ... existing destructures ...
  outgoingCCChains,
} = params;
```

Then add the new `[CC CAST]` section. Insert it **after** the `[TEAMMATE CD]` section and **before** the `[ENEMY CD]` section (around line 1336 in the current file):

```typescript
// ── [CC CAST] events — AoE CC cast by friendly players on enemies ─────────

if (outgoingCCChains && outgoingCCChains.length > 0) {
  for (const event of extractAoeCCEvents(outgoingCCChains)) {
    const casterLabel = pid(event.casterName);
    const targetLabels = event.targets.map((t) => enemyPid(t.name)).join(', ');
    const countNote = event.targets.length > 1 ? ` [${event.targets.length} enemies]` : '';
    addEntry(
      event.atSeconds,
      `${fmtTime(event.atSeconds)}  [CC CAST]   ${event.spellName} (by ${casterLabel}) → ${targetLabels}${countNote}`,
    );
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/shared && npx jest timeline.test.ts --testNamePattern="\[CC CAST\]" --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
cd packages/shared && npx jest --no-coverage 2>&1 | tail -30
```

Expected: All tests PASS (no regressions in existing `[CC ON TEAM]`, `[TRINKET]`, etc. tests).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/utils/drAnalysis.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "feat(F66): emit [CC CAST] for AoE CC in buildMatchTimeline"
```

---

## Task 4: Wire `outgoingCCChains` into `buildMatchTimeline` call site in `index.tsx`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx` (around line 222–241)

`outgoingCCChains` is already computed at line 122 of `index.tsx` via `analyzeOutgoingCCChains(...)`. It just needs to be passed into `buildMatchTimeline`.

- [ ] **Step 1: Add `outgoingCCChains` to the `buildMatchTimeline` call**

Find the `buildMatchTimeline({ ... })` call (around line 222). Add the new param:

```typescript
tLines.push(
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
    outgoingCCChains, // ← add this line
  } as BuildMatchTimelineParams),
);
```

- [ ] **Step 2: Run linter to verify no TypeScript errors**

```bash
npm run lint 2>&1 | grep -E "error|warning" | head -20
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx
git commit -m "feat(F66): pass outgoingCCChains into buildMatchTimeline call"
```

---

## Task 5: Observe prompt output and verify [CC CAST] events appear correctly

**Files:**

- Read-only: run `printMatchPrompts` against a real log to observe the generated timeline

This task verifies the feature works end-to-end on real match data — not just unit tests. The goal is to confirm that `[CC CAST]` events appear in the timeline, target counts are accurate, and no other events are broken.

- [ ] **Step 1: Run the prompt printer on a recent match log**

```bash
cd packages/shared && npx ts-node --project tsconfig.json ../../packages/tools/src/printMatchPrompts.ts 2>&1 | head -200
```

If that path doesn't work, find the script:

```bash
find /Users/mingjianliu/code/wowarenalogs/packages/tools/src -name "printMatch*" -o -name "analyzeMatch*" | head -5
```

Then run it with the correct path.

- [ ] **Step 2: Search output for `[CC CAST]` events**

Scan the printed timeline for lines containing `[CC CAST]`. For each one, verify:

- The spell name is one of the AoE spells (Psychic Scream, Intimidating Shout, Shockwave, etc.)
- The caster label is a numeric ID or player name (not empty)
- The target list contains at least one enemy ID
- `[N enemies]` appears when N > 1

**If no `[CC CAST]` lines appear:** this may be expected if the match log doesn't contain Priests, Warriors, Warlocks, Monks, or Druids on the friendly team. Try a different log or confirm by checking which specs are in the PLAYER LOADOUT section.

- [ ] **Step 3: Verify no regressions in other event types**

Scan the same output to confirm these events still appear correctly:

- `[CC ON TEAM]` — enemy CC landing on friendly players
- `[TRINKET]` — PvP trinket uses
- `[OWNER CD]` — owner's major cooldowns
- `[ENEMY CD]` — enemy offensive CDs
- `[HP]` — HP tick lines

If any of these are missing or malformed, investigate before proceeding.

- [ ] **Step 4: If match has a Warrior or Priest — spot-check target count**

Find a `[CC CAST]   Psychic Scream` or `[CC CAST]   Intimidating Shout` event in the output. Cross-reference the timestamp against the `[CC ON TEAM]` events around the same time — the number of enemy targets in `[CC CAST]` should match how many friendly players had CC applied at that time (from the enemy perspective, the AoE should hit 1–3 enemy players which are the friendly team).

Note: `[CC ON TEAM]` shows CC landing on **friendly** players (inbound), while `[CC CAST]` shows the **owner/team** casting CC on **enemies** (outbound). These are different directions — don't confuse them. Just sanity-check that the count (1, 2, or 3) looks reasonable for the match.

- [ ] **Step 5: Document observations**

Write a 2–3 line note here (inline in the plan or as a commit message) describing:

- Whether `[CC CAST]` events appeared
- Any spec that produced them
- Any concern or oddity noticed

---

## Task 6: Mark F66 done in TRACKER.md

**Files:**

- Modify: `TRACKER.md` — move F66 row from Backlog to completed
- Modify: `TRACKER_ARCHIVE.md` — add F66 row

- [ ] **Step 1: Move F66 from TRACKER.md to TRACKER_ARCHIVE.md**

In `TRACKER.md`, delete the F66 row:

```
| F66 | Backlog | AoE CC target list — for Psychic Scream, Intimidating Shout, and other AoE fears/stuns, log which enemy unit(s) were affected. Currently `[CC ON TEAM]` captures inbound CC targets but outbound CC targets are unknown. Claude cannot determine whether a Scream landed on 1, 2, or all 3 enemies — affects kill-setup vs. defensive-peel evaluation | `utils.ts` (`buildMatchTimeline`), `cooldowns.ts` |
```

In `TRACKER_ARCHIVE.md`, add under the Features / Done section:

```
| F66 | ✅ Done | AoE CC target list — emit `[CC CAST]` events for AoE fears/stuns showing which enemy unit(s) were affected | `utils/drAnalysis.ts`, `CombatAIAnalysis/utils.ts`, `CombatAIAnalysis/index.tsx` |
```

- [ ] **Step 2: Commit**

```bash
git add TRACKER.md TRACKER_ARCHIVE.md
git commit -m "chore: mark F66 done in tracker"
```

---

## Self-Review Checklist

**Spec coverage:**

- [x] AoE CC spells defined — `AOE_CC_SPELL_IDS` covers Psychic Scream, Intimidating Shout, Howl of Terror, Shockwave, Leg Sweep, War Stomp, Incapacitating Roar, Shadowfury, Bursting Shot
- [x] Grouping logic — `extractAoeCCEvents` groups same-caster+spell within 0.5s window
- [x] Timeline event emitted — `[CC CAST]` section in `buildMatchTimeline`
- [x] Target count shown — `[N enemies]` appended for multi-target events
- [x] Name compression — `pid()` for caster, `enemyPid()` for targets
- [x] Wired to real call site — `index.tsx` passes `outgoingCCChains`
- [x] Single-target CCs excluded — `AOE_CC_SPELL_IDS` check skips Cyclone, Polymorph, etc.
- [x] Backward compatible — `outgoingCCChains` is optional; existing tests using `makeBaseParams()` without it still pass

**No placeholder scan:** All steps include concrete code. No TBDs.

**Type consistency:**

- `IAoeCCEvent` defined in Task 1, used in Task 2 (`extractAoeCCEvents` return type) and Task 3 (consumed in `buildMatchTimeline`)
- `IOutgoingCCChain` imported in `utils.ts` in Task 3 matches what `index.tsx` already has from `analyzeOutgoingCCChains`
- `extractAoeCCEvents` exported from `drAnalysis.ts` in Task 2, imported in `utils.ts` in Task 3

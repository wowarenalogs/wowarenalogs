# Raw Timeline Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a raw chronological timeline prompt path behind a `--new-prompt` flag, running alongside the existing prompt with no changes to the old code path.

**Architecture:** Two new pure functions (`buildPlayerLoadout`, `buildMatchTimeline`) are added to `utils.ts` in the shared package. `buildMatchContext` (React component) and `buildMatchPrompt` (tools CLI) each get a `useTimelinePrompt` flag that routes to the new path when true. `analyze.ts` adds `NEW_SYSTEM_PROMPT` that replaces CRITICAL MOMENTS evaluation with self-directed timeline analysis and always-on DATA UTILITY output.

**Tech Stack:** TypeScript, Jest/tsdx (shared package tests), existing data utilities (`cooldowns`, `dispelAnalysis`, `ccTrinketAnalysis`, `enemyCDs`, `healingGaps`, `killWindowTargetSelection`)

---

## File Map

| File                                                                                      | Action | Responsibility                                                                                                             |
| ----------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`                   | Modify | Add `buildPlayerLoadout`, `buildMatchTimeline`, `BuildMatchTimelineParams`                                                 |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` | Create | Tests for `buildPlayerLoadout` and `buildMatchTimeline`                                                                    |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx`                  | Modify | Add `useTimelinePrompt?: boolean` param to `buildMatchContext`; new path calls `buildPlayerLoadout` + `buildMatchTimeline` |
| `packages/web/pages/api/analyze.ts`                                                       | Modify | Add `NEW_SYSTEM_PROMPT` constant; accept `useTimelinePrompt` in request body to select prompt                              |
| `packages/tools/src/printMatchPrompts.ts`                                                 | Modify | Add `--new-prompt` CLI flag; new path calls `buildPlayerLoadout` + `buildMatchTimeline` + `NEW_SYSTEM_PROMPT`              |

---

### Task 1: `buildPlayerLoadout` in utils.ts

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`
- Create: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Create the test file with failing tests**

Create `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CombatUnitSpec } from '@wowarenalogs/parser';

import { IMajorCooldownInfo } from '../../../../utils/cooldowns';
import { IEnemyCDTimeline } from '../../../../utils/enemyCDs';
import { buildPlayerLoadout } from '../utils';

// ── Factories ─────────────────────────────────────────────────────────────────

function makeOwner(name: string): any {
  return { name, spec: CombatUnitSpec.None };
}

function makeCD(spellName: string, cooldownSeconds: number, neverUsed = false): IMajorCooldownInfo {
  return {
    spellId: '1',
    spellName,
    tag: 'Defensive',
    cooldownSeconds,
    casts: [],
    availableWindows: [],
    neverUsed,
  };
}

function makeEnemyTimeline(players: IEnemyCDTimeline['players'] = []): IEnemyCDTimeline {
  return { alignedBurstWindows: [], players };
}

// ── buildPlayerLoadout ────────────────────────────────────────────────────────

describe('buildPlayerLoadout', () => {
  it('labels the log owner with spec and (log owner)', () => {
    const result = buildPlayerLoadout(
      makeOwner('Feramonk'),
      'Mistweaver Monk',
      [makeCD('Life Cocoon', 120)],
      [],
      makeEnemyTimeline(),
    );
    expect(result).toContain('Feramonk (Mistweaver Monk — log owner)');
    expect(result).toContain('Life Cocoon [120s]');
  });

  it('includes teammates without the (log owner) label', () => {
    const result = buildPlayerLoadout(
      makeOwner('Feramonk'),
      'Mistweaver Monk',
      [],
      [
        {
          player: makeOwner('Simplesauce'),
          spec: 'Unholy Death Knight',
          cds: [makeCD('Anti-Magic Shell', 60)],
        },
      ],
      makeEnemyTimeline(),
    );
    expect(result).toContain('Simplesauce (Unholy Death Knight)');
    expect(result).not.toContain('Simplesauce (Unholy Death Knight — log owner)');
    expect(result).toContain('Anti-Magic Shell [60s]');
  });

  it('includes enemies from CD timeline with (enemy) label', () => {
    const result = buildPlayerLoadout(
      makeOwner('Feramonk'),
      'Mistweaver Monk',
      [],
      [],
      makeEnemyTimeline([
        {
          playerName: 'Dzinked',
          specName: 'Holy Paladin',
          offensiveCDs: [
            {
              spellId: '31884',
              spellName: 'Avenging Crusader',
              castTimeSeconds: 30,
              cooldownSeconds: 120,
              availableAgainAtSeconds: 150,
              buffEndSeconds: 50,
            },
          ],
        },
      ]),
    );
    expect(result).toContain('Dzinked (Holy Paladin — enemy)');
    expect(result).toContain('Avenging Crusader [120s]');
  });

  it('deduplicates enemy CDs that were cast multiple times', () => {
    const result = buildPlayerLoadout(
      makeOwner('Feramonk'),
      'Mistweaver Monk',
      [],
      [],
      makeEnemyTimeline([
        {
          playerName: 'Ruminator',
          specName: 'Beast Mastery Hunter',
          offensiveCDs: [
            {
              spellId: '19574',
              spellName: 'Bestial Wrath',
              castTimeSeconds: 15,
              cooldownSeconds: 90,
              availableAgainAtSeconds: 105,
              buffEndSeconds: 25,
            },
            {
              spellId: '19574',
              spellName: 'Bestial Wrath',
              castTimeSeconds: 60,
              cooldownSeconds: 90,
              availableAgainAtSeconds: 150,
              buffEndSeconds: 70,
            },
          ],
        },
      ]),
    );
    // Should appear once, not twice
    const count = (result.match(/Bestial Wrath/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('does not annotate any CD as NEVER USED', () => {
    const neverUsedCD = makeCD('Paralysis', 45, true);
    const result = buildPlayerLoadout(makeOwner('Feramonk'), 'Mistweaver Monk', [neverUsedCD], [], makeEnemyTimeline());
    expect(result).not.toMatch(/NEVER.USED/i);
    expect(result).toContain('Paralysis [45s]');
  });

  it('shows "none tracked" when owner has no CDs', () => {
    const result = buildPlayerLoadout(makeOwner('Feramonk'), 'Mistweaver Monk', [], [], makeEnemyTimeline());
    expect(result).toContain('none tracked');
  });

  it('skips enemies with no tracked CDs', () => {
    const result = buildPlayerLoadout(
      makeOwner('Feramonk'),
      'Mistweaver Monk',
      [],
      [],
      makeEnemyTimeline([{ playerName: 'Ghost', specName: 'Arms Warrior', offensiveCDs: [] }]),
    );
    expect(result).not.toContain('Ghost');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern "timeline" 2>&1 | head -30
```

Expected: FAIL with "buildPlayerLoadout is not a function" or similar import error.

- [ ] **Step 3: Add `buildPlayerLoadout` to utils.ts**

Add these imports to the top of `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts` (after existing imports):

```typescript
import { IEnemyCDTimeline } from '../../../utils/enemyCDs';
```

Then add the function at the bottom of `utils.ts` (before the closing of the file):

```typescript
// ── Timeline prompt builders ───────────────────────────────────────────────

/**
 * Formats the PLAYER LOADOUT section for the raw timeline prompt.
 * Lists all major CDs (≥30s) available to each player — no usage annotations,
 * no NEVER USED labeling. Absence from the timeline is the signal.
 */
export function buildPlayerLoadout(
  owner: ICombatUnit,
  ownerSpec: string,
  ownerCDs: IMajorCooldownInfo[],
  teammateCDs: Array<{ player: ICombatUnit; spec: string; cds: IMajorCooldownInfo[] }>,
  enemyCDTimeline: IEnemyCDTimeline,
): string {
  const lines: string[] = [];
  lines.push('PLAYER LOADOUT (major CDs ≥30s available this match)');

  const ownerCDStr =
    ownerCDs.length > 0 ? ownerCDs.map((cd) => `${cd.spellName} [${cd.cooldownSeconds}s]`).join(', ') : 'none tracked';
  lines.push(`  ${owner.name} (${ownerSpec} — log owner):`);
  lines.push(`    ${ownerCDStr}`);

  for (const { player, spec, cds } of teammateCDs) {
    const cdStr =
      cds.length > 0 ? cds.map((cd) => `${cd.spellName} [${cd.cooldownSeconds}s]`).join(', ') : 'none tracked';
    lines.push(`  ${player.name} (${spec}):`);
    lines.push(`    ${cdStr}`);
  }

  for (const player of enemyCDTimeline.players) {
    if (player.offensiveCDs.length === 0) continue;
    const seen = new Set<string>();
    const uniqueCDs: string[] = [];
    for (const cd of player.offensiveCDs) {
      const key = `${cd.spellName}|${cd.cooldownSeconds}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueCDs.push(`${cd.spellName} [${cd.cooldownSeconds}s]`);
      }
    }
    if (uniqueCDs.length > 0) {
      lines.push(`  ${player.playerName} (${player.specName} — enemy):`);
      lines.push(`    ${uniqueCDs.join(', ')}`);
    }
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern "timeline"
```

Expected: All `buildPlayerLoadout` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "feat: add buildPlayerLoadout to CombatAIAnalysis utils"
```

---

### Task 2: `buildMatchTimeline` skeleton — [DEATH] events

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`
- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Add imports and interface to utils.ts**

Add to the imports at the top of `utils.ts`:

```typescript
import { IDamageBucket } from '../../../utils/cooldowns';
import { IDispelSummary } from '../../../utils/dispelAnalysis';
```

Add the `BuildMatchTimelineParams` interface just above the `buildMatchTimeline` function (will be added in Step 3), after the `buildPlayerLoadout` function:

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
  matchStartMs: number;
  isHealer: boolean;
}
```

- [ ] **Step 2: Write failing tests for [DEATH] events**

Append to `__tests__/timeline.test.ts`:

```typescript
import { makeAdvancedAction, makeUnit } from '../../../../utils/__tests__/testHelpers';
import { IPlayerCCTrinketSummary } from '../../../../utils/ccTrinketAnalysis';
import { IDamageBucket } from '../../../../utils/cooldowns';
import { IDispelSummary } from '../../../../utils/dispelAnalysis';
import { IHealingGap } from '../../../../utils/healingGaps';
import { BuildMatchTimelineParams, buildMatchTimeline } from '../utils';

// ── Timeline factory helpers ──────────────────────────────────────────────────

function makeEmptyDispelSummary(): IDispelSummary {
  return {
    allyCleanse: [],
    ourPurges: [],
    hostilePurges: [],
    missedCleanseWindows: [],
    ccEfficiency: [],
    missedPurgeWindows: [],
  };
}

function makeEmptyCCTrinketSummary(playerName: string): IPlayerCCTrinketSummary {
  return {
    playerName,
    playerSpec: 'Mistweaver Monk',
    trinketType: 'Gladiator',
    trinketCooldownSeconds: 90,
    ccInstances: [],
    trinketUseTimes: [],
    missedTrinketWindows: [],
  };
}

function makeBaseParams(overrides: Partial<BuildMatchTimelineParams> = {}): BuildMatchTimelineParams {
  return {
    owner: makeOwner('Feramonk'),
    ownerSpec: 'Mistweaver Monk',
    ownerCDs: [],
    teammateCDs: [],
    enemyCDTimeline: makeEnemyTimeline(),
    ccTrinketSummaries: [],
    dispelSummary: makeEmptyDispelSummary(),
    friendlyDeaths: [],
    enemyDeaths: [],
    pressureWindows: [],
    healingGaps: [],
    friends: [],
    matchStartMs: 0,
    isHealer: true,
    ...overrides,
  };
}

// ── buildMatchTimeline — [DEATH] events ────────────────────────────────────────

describe('buildMatchTimeline — [DEATH] events', () => {
  it('emits a [DEATH] line for a friendly death', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        friendlyDeaths: [{ spec: 'Unholy Death Knight', name: 'Simplesauce', atSeconds: 118 }],
      }),
    );
    expect(result).toContain('[DEATH]');
    expect(result).toContain('Simplesauce (Unholy Death Knight — friendly)');
  });

  it('emits a [DEATH] line for an enemy death', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        enemyDeaths: [{ spec: 'Affliction Warlock', name: 'Natjkis', atSeconds: 88 }],
      }),
    );
    expect(result).toContain('[DEATH]');
    expect(result).toContain('Natjkis (Affliction Warlock — enemy)');
  });

  it('includes HP trajectory when advanced data is present', () => {
    const matchStartMs = 1_000_000;
    const deathAtSeconds = 118;
    const deathMs = matchStartMs + deathAtSeconds * 1000;

    // Build a unit with advanced actions at T-15s and T-5s before death
    const unit = makeUnit('Simplesauce', 'player-1');
    unit.advancedActions = [
      makeAdvancedAction('player-1', deathMs - 15_000, 400_000, 500_000), // 80% at T-15s
      makeAdvancedAction('player-1', deathMs - 5_000, 200_000, 500_000), // 40% at T-5s
    ];

    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [unit],
        friendlyDeaths: [{ spec: 'Unholy Death Knight', name: 'Simplesauce', atSeconds: deathAtSeconds }],
        matchStartMs,
      }),
    );
    expect(result).toContain('HP:');
    expect(result).toContain('80%');
    expect(result).toContain('40%');
    expect(result).toContain('→ dead');
  });

  it('includes top damage sources in final 10s for friendly deaths', () => {
    const matchStartMs = 1_000_000;
    const deathAtSeconds = 118;
    const deathMs = matchStartMs + deathAtSeconds * 1000;

    const unit = makeUnit('Simplesauce', 'player-1');
    unit.damageIn = [
      {
        logLine: { timestamp: deathMs - 5_000 },
        effectiveAmount: -80_000,
        srcUnitName: 'Natjkis',
        spellName: 'Unstable Affliction',
      } as any,
      {
        logLine: { timestamp: deathMs - 3_000 },
        effectiveAmount: -40_000,
        srcUnitName: 'Natjkis',
        spellName: 'Dark Harvest',
      } as any,
    ];

    const result = buildMatchTimeline(
      makeBaseParams({
        friends: [unit],
        friendlyDeaths: [{ spec: 'Unholy Death Knight', name: 'Simplesauce', atSeconds: deathAtSeconds }],
        matchStartMs,
      }),
    );
    expect(result).toContain('Top damage in final 10s');
    expect(result).toContain('Unstable Affliction');
    expect(result).toContain('80k');
  });

  it('outputs MATCH TIMELINE header', () => {
    const result = buildMatchTimeline(makeBaseParams());
    expect(result).toContain('MATCH TIMELINE');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern "timeline" 2>&1 | head -20
```

Expected: FAIL — `buildMatchTimeline` not exported.

- [ ] **Step 4: Implement `buildMatchTimeline` with [DEATH] events**

Append to `utils.ts` after `buildPlayerLoadout`:

```typescript
/**
 * Builds a chronological event timeline for the raw timeline prompt.
 * Collects events from all sources, sorts by timestamp, returns formatted string.
 */
export function buildMatchTimeline(params: BuildMatchTimelineParams): string {
  const {
    owner,
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
    matchStartMs,
    isHealer,
  } = params;

  const entries: Array<{ timeSeconds: number; lines: string[] }> = [];

  function addEntry(timeSeconds: number, ...lines: string[]) {
    entries.push({ timeSeconds, lines });
  }

  // ── [DEATH] events ────────────────────────────────────────────────────────

  const unitsByName = new Map(friends.map((u) => [u.name, u]));

  for (const death of friendlyDeaths) {
    const deathLines: string[] = [`${fmtTime(death.atSeconds)}  [DEATH]  ${death.name} (${death.spec} — friendly)`];

    const dyingUnit = unitsByName.get(death.name);
    if (dyingUnit) {
      // HP trajectory
      const checkpoints = [15, 10, 5, 3];
      const trajectory: string[] = [];
      for (const secondsBefore of checkpoints) {
        const pct = getHpPercentAtTime(dyingUnit, death.atSeconds - secondsBefore, matchStartMs);
        if (pct !== null) trajectory.push(`${Math.round(pct)}% at T-${secondsBefore}s`);
      }
      if (trajectory.length > 0) {
        deathLines.push(`               HP: ${trajectory.join(' → ')} → dead`);
      }

      // Top damage sources in final 10s
      const deathMs = matchStartMs + death.atSeconds * 1000;
      const buckets = new Map<string, number>();
      for (const d of dyingUnit.damageIn) {
        if (d.logLine.timestamp < deathMs - 10_000 || d.logLine.timestamp > deathMs) continue;
        const dmg = Math.abs(d.effectiveAmount);
        if (dmg <= 0) continue;
        const key = `${d.srcUnitName || 'Unknown'} — ${(d as any).spellName ?? 'melee'}`;
        buckets.set(key, (buckets.get(key) ?? 0) + dmg);
      }
      const topDamage = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (topDamage.length > 0) {
        const parts = topDamage.map(([k, v]) => `${k} ${Math.round(v / 1000)}k`).join(', ');
        deathLines.push(`               Top damage in final 10s: ${parts}`);
      }
    }

    addEntry(death.atSeconds, ...deathLines);
  }

  for (const death of enemyDeaths) {
    addEntry(death.atSeconds, `${fmtTime(death.atSeconds)}  [DEATH]  ${death.name} (${death.spec} — enemy)`);
  }

  // (CD, CC, dispel, pressure events added in Tasks 3 and 4)
  void owner; // suppress unused warning until next tasks add remaining events
  void ownerCDs;
  void teammateCDs;
  void enemyCDTimeline;
  void ccTrinketSummaries;
  void dispelSummary;
  void pressureWindows;
  void healingGaps;
  void isHealer;

  // ── Sort and format ───────────────────────────────────────────────────────

  entries.sort((a, b) => a.timeSeconds - b.timeSeconds);

  const outputLines: string[] = ['MATCH TIMELINE', ''];
  for (const entry of entries) {
    outputLines.push(...entry.lines);
  }

  return outputLines.join('\n');
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern "timeline"
```

Expected: All `buildMatchTimeline — [DEATH] events` tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "feat: add buildMatchTimeline skeleton with [DEATH] events"
```

---

### Task 3: `buildMatchTimeline` — CD events

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`
- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Write failing tests for CD events**

Append to `__tests__/timeline.test.ts`:

```typescript
describe('buildMatchTimeline — CD events', () => {
  it('emits [OWNER CD] for each cast', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        ownerCDs: [
          {
            spellId: '1',
            spellName: 'Life Cocoon',
            tag: 'Defensive',
            cooldownSeconds: 120,
            casts: [{ timeSeconds: 27 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).toContain('[OWNER CD]');
    expect(result).toContain('Life Cocoon');
    expect(result).toContain('0:27');
  });

  it('includes target name and HP when available on [OWNER CD]', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        ownerCDs: [
          {
            spellId: '1',
            spellName: 'Life Cocoon',
            tag: 'Defensive',
            cooldownSeconds: 120,
            casts: [{ timeSeconds: 27, targetName: 'Gardianmini', targetHpPct: 27 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
      }),
    );
    expect(result).toContain('→ Gardianmini (27% HP)');
  });

  it('emits [TEAMMATE CD] for each teammate cast', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
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
                casts: [{ timeSeconds: 108 }],
                availableWindows: [],
                neverUsed: false,
              },
            ],
          },
        ],
      }),
    );
    expect(result).toContain('[TEAMMATE CD]');
    expect(result).toContain('Simplesauce (Unholy Death Knight): Anti-Magic Shell');
    expect(result).toContain('1:48');
  });

  it('emits [ENEMY CD] for individual enemy casts (not grouped)', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        enemyCDTimeline: makeEnemyTimeline([
          {
            playerName: 'Dzinked',
            specName: 'Holy Paladin',
            offensiveCDs: [
              {
                spellId: '31884',
                spellName: 'Avenging Crusader',
                castTimeSeconds: 33,
                cooldownSeconds: 120,
                availableAgainAtSeconds: 153,
                buffEndSeconds: 51,
              },
              {
                spellId: '31884',
                spellName: 'Avenging Crusader',
                castTimeSeconds: 153,
                cooldownSeconds: 120,
                availableAgainAtSeconds: 273,
                buffEndSeconds: 171,
              },
            ],
          },
        ]),
      }),
    );
    // Both casts should appear individually
    const matches = result.match(/\[ENEMY CD\]/g) ?? [];
    expect(matches.length).toBe(2);
    expect(result).toContain('Dzinked (Holy Paladin): Avenging Crusader');
    expect(result).toContain('0:33');
    expect(result).toContain('2:33');
  });

  it('sorts all CD events chronologically', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        ownerCDs: [
          {
            spellId: '1',
            spellName: 'Life Cocoon',
            tag: 'Defensive',
            cooldownSeconds: 120,
            casts: [{ timeSeconds: 55 }],
            availableWindows: [],
            neverUsed: false,
          },
        ],
        enemyCDTimeline: makeEnemyTimeline([
          {
            playerName: 'Dzinked',
            specName: 'Holy Paladin',
            offensiveCDs: [
              {
                spellId: '31884',
                spellName: 'Avenging Crusader',
                castTimeSeconds: 33,
                cooldownSeconds: 120,
                availableAgainAtSeconds: 153,
                buffEndSeconds: 51,
              },
            ],
          },
        ]),
      }),
    );
    const acPos = result.indexOf('Avenging Crusader');
    const lcPos = result.indexOf('Life Cocoon');
    expect(acPos).toBeLessThan(lcPos); // 0:33 before 0:55
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern "timeline" 2>&1 | grep -E "PASS|FAIL|●"
```

Expected: New CD event tests FAIL.

- [ ] **Step 3: Add CD event collection to `buildMatchTimeline`**

In `utils.ts`, replace the placeholder `void` lines for `ownerCDs`, `teammateCDs`, `enemyCDTimeline` with the actual event collection. Find the comment `// (CD, CC, dispel, pressure events added in Tasks 3 and 4)` and insert before it:

```typescript
// ── [OWNER CD] events ───────────────────────────────────────────────────────

for (const cd of ownerCDs) {
  for (const cast of cd.casts) {
    const targetPart =
      cast.targetName !== undefined
        ? ` → ${cast.targetName}${cast.targetHpPct !== undefined ? ` (${cast.targetHpPct}% HP)` : ''}`
        : '';
    addEntry(cast.timeSeconds, `${fmtTime(cast.timeSeconds)}  [OWNER CD]   ${cd.spellName}${targetPart}`);
  }
}

// ── [TEAMMATE CD] events ────────────────────────────────────────────────────

for (const { player, spec, cds } of teammateCDs) {
  for (const cd of cds) {
    for (const cast of cd.casts) {
      addEntry(
        cast.timeSeconds,
        `${fmtTime(cast.timeSeconds)}  [TEAMMATE CD]   ${player.name} (${spec}): ${cd.spellName}`,
      );
    }
  }
}

// ── [ENEMY CD] events ──────────────────────────────────────────────────────

for (const player of enemyCDTimeline.players) {
  for (const cd of player.offensiveCDs) {
    addEntry(
      cd.castTimeSeconds,
      `${fmtTime(cd.castTimeSeconds)}  [ENEMY CD]   ${player.playerName} (${player.specName}): ${cd.spellName}`,
    );
  }
}
```

Also remove the `void owner;`, `void ownerCDs;`, `void teammateCDs;`, `void enemyCDTimeline;` lines.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern "timeline"
```

Expected: All CD event tests PASS. All prior tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "feat: add [OWNER CD], [TEAMMATE CD], [ENEMY CD] events to buildMatchTimeline"
```

---

### Task 4: `buildMatchTimeline` — CC, dispel, pressure, healing gap events

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`
- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `__tests__/timeline.test.ts`:

```typescript
describe('buildMatchTimeline — CC, dispel, pressure, healing gap events', () => {
  it('emits [CC ON TEAM] with trinket: available, not used when trinket was available', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        ccTrinketSummaries: [
          {
            ...makeEmptyCCTrinketSummary('Feramonk'),
            ccInstances: [
              {
                atSeconds: 37,
                durationSeconds: 4,
                spellId: '853',
                spellName: 'Hammer of Justice',
                sourceName: 'Dzinked',
                sourceSpec: 'Holy Paladin',
                damageTakenDuring: 50_000,
                trinketState: 'available_unused',
                drInfo: null,
                distanceYards: null,
                losBlocked: null,
              },
            ],
          },
        ],
      }),
    );
    expect(result).toContain('[CC ON TEAM]');
    expect(result).toContain('Feramonk ← Hammer of Justice (Dzinked)');
    expect(result).toContain('trinket: available, not used');
    expect(result).toContain('0:37');
  });

  it('emits [CC ON TEAM] with trinket: used when trinket was consumed', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        ccTrinketSummaries: [
          {
            ...makeEmptyCCTrinketSummary('Feramonk'),
            ccInstances: [
              {
                atSeconds: 15,
                durationSeconds: 6,
                spellId: '853',
                spellName: 'Hammer of Justice',
                sourceName: 'Dzinked',
                sourceSpec: 'Holy Paladin',
                damageTakenDuring: 30_000,
                trinketState: 'used',
                drInfo: null,
                distanceYards: null,
                losBlocked: null,
              },
            ],
          },
        ],
      }),
    );
    expect(result).toContain('trinket: used');
  });

  it('emits [TRINKET] events for trinket uses', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        ccTrinketSummaries: [
          {
            ...makeEmptyCCTrinketSummary('Feramonk'),
            trinketUseTimes: [68],
          },
        ],
      }),
    );
    expect(result).toContain('[TRINKET]');
    expect(result).toContain('Feramonk used PvP trinket');
    expect(result).toContain('1:08');
  });

  it('emits [MISSED CLEANSE] with damage amount', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        dispelSummary: {
          ...makeEmptyDispelSummary(),
          missedCleanseWindows: [
            {
              timeSeconds: 134,
              durationSeconds: 30,
              targetName: 'Simplesauce',
              targetSpec: 'Unholy Death Knight',
              spellName: 'Vampiric Touch',
              spellId: '34914',
              priority: 'High',
              dispelType: 'Magic' as any,
              postCcDamage: 212_000,
              cleanseWasOnCD: false,
            },
          ],
        },
      }),
    );
    expect(result).toContain('[MISSED CLEANSE]');
    expect(result).toContain('Vampiric Touch on Simplesauce');
    expect(result).toContain('212k');
  });

  it('emits [CLEANSE] for successful dispels', () => {
    const result = buildMatchTimeline(
      makeBaseParams({
        dispelSummary: {
          ...makeEmptyDispelSummary(),
          allyCleanse: [
            {
              timeSeconds: 44,
              dispelSpellId: '115450',
              dispelSpellName: 'Detox',
              removedSpellId: '34914',
              removedSpellName: 'Vampiric Touch',
              sourceName: 'Feramonk',
              sourceSpec: 'Mistweaver Monk',
              targetName: 'Simplesauce',
              targetSpec: 'Unholy Death Knight',
              priority: 'High',
              hasDispelPenalty: false,
              isSpellSteal: false,
            },
          ],
        },
      }),
    );
    expect(result).toContain('[CLEANSE]');
    expect(result).toContain('Feramonk dispelled Vampiric Touch off Simplesauce');
  });

  it('emits [DMG SPIKE] only for windows ≥300k', () => {
    const windows: IDamageBucket[] = [
      {
        fromSeconds: 19,
        toSeconds: 24,
        totalDamage: 1_240_000,
        targetName: 'Gardianmini',
        targetSpec: 'Shadow Priest',
      },
      { fromSeconds: 50, toSeconds: 55, totalDamage: 200_000, targetName: 'Feramonk', targetSpec: 'Mistweaver Monk' },
    ];
    const result = buildMatchTimeline(makeBaseParams({ pressureWindows: windows }));
    expect(result).toContain('[DMG SPIKE]');
    expect(result).toContain('1.24M');
    // 200k window should NOT appear
    const spikeCount = (result.match(/\[DMG SPIKE\]/g) ?? []).length;
    expect(spikeCount).toBe(1);
  });

  it('emits [HEALING GAP] only when isHealer is true', () => {
    const gap: IHealingGap = {
      fromSeconds: 82,
      toSeconds: 86.2,
      durationSeconds: 4.2,
      freeCastSeconds: 2.1,
      mostDamagedSpec: 'Unholy Death Knight',
      mostDamagedName: 'Simplesauce',
      mostDamagedAmount: 400_000,
    };
    const healerResult = buildMatchTimeline(makeBaseParams({ healingGaps: [gap], isHealer: true }));
    const dpsResult = buildMatchTimeline(makeBaseParams({ healingGaps: [gap], isHealer: false }));

    expect(healerResult).toContain('[HEALING GAP]');
    expect(healerResult).toContain('Feramonk inactive 4.2s');
    expect(dpsResult).not.toContain('[HEALING GAP]');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern "timeline" 2>&1 | grep -E "PASS|FAIL|✓|✗|×"
```

Expected: New CC/dispel/pressure tests FAIL.

- [ ] **Step 3: Add remaining event types to `buildMatchTimeline`**

In `utils.ts`, replace the remaining `void` placeholders (`void ccTrinketSummaries;`, `void dispelSummary;`, etc.) with the actual event collection. Insert before the `// Sort and format` comment:

```typescript
// ── [TRINKET] and [CC ON TEAM] events ──────────────────────────────────────

for (const summary of ccTrinketSummaries) {
  for (const t of summary.trinketUseTimes) {
    addEntry(t, `${fmtTime(t)}  [TRINKET]   ${summary.playerName} used PvP trinket`);
  }

  for (const cc of summary.ccInstances) {
    const trinketNote =
      cc.trinketState === 'available_unused'
        ? ' | trinket: available, not used'
        : cc.trinketState === 'used'
          ? ' | trinket: used'
          : ' | trinket: on cooldown';
    addEntry(
      cc.atSeconds,
      `${fmtTime(cc.atSeconds)}  [CC ON TEAM]   ${summary.playerName} ← ${cc.spellName} (${cc.sourceName}) | ${cc.durationSeconds.toFixed(0)}s${trinketNote}`,
    );
  }
}

// ── [MISSED CLEANSE] and [CLEANSE] events ──────────────────────────────────

for (const miss of dispelSummary.missedCleanseWindows) {
  const dmgK = Math.round(miss.postCcDamage / 1000);
  addEntry(
    miss.timeSeconds,
    `${fmtTime(miss.timeSeconds)}  [MISSED CLEANSE]   ${miss.spellName} on ${miss.targetName} | ${miss.durationSeconds.toFixed(0)}s | ${dmgK}k taken during`,
  );
}

for (const cleanse of dispelSummary.allyCleanse) {
  addEntry(
    cleanse.timeSeconds,
    `${fmtTime(cleanse.timeSeconds)}  [CLEANSE]   ${cleanse.sourceName} dispelled ${cleanse.removedSpellName} off ${cleanse.targetName}`,
  );
}

// ── [DMG SPIKE] events ─────────────────────────────────────────────────────

const DMG_SPIKE_THRESHOLD = 300_000;
for (const pw of pressureWindows) {
  if (pw.totalDamage < DMG_SPIKE_THRESHOLD) continue;
  const dmgM = (pw.totalDamage / 1_000_000).toFixed(2);
  const windowSec = Math.round(pw.toSeconds - pw.fromSeconds);
  addEntry(
    pw.fromSeconds,
    `${fmtTime(pw.fromSeconds)}  [DMG SPIKE]   ${pw.targetName} (${pw.targetSpec}): ${dmgM}M in ${windowSec}s`,
  );
}

// ── [HEALING GAP] events (healer only) ────────────────────────────────────

if (isHealer) {
  for (const gap of healingGaps) {
    addEntry(
      gap.fromSeconds,
      `${fmtTime(gap.fromSeconds)}  [HEALING GAP]   ${owner.name} inactive ${gap.durationSeconds.toFixed(1)}s (${gap.freeCastSeconds.toFixed(1)}s free) while ${gap.mostDamagedName} under pressure`,
    );
  }
}
```

Remove the remaining `void` placeholder lines (`void ccTrinketSummaries;`, `void dispelSummary;`, `void pressureWindows;`, `void healingGaps;`, `void isHealer;`).

- [ ] **Step 4: Run all tests**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern "timeline"
```

Expected: All timeline tests PASS.

- [ ] **Step 5: Run full lint + test suite**

```bash
npm run -w @wowarenalogs/shared test && npm run lint 2>&1 | tail -20
```

Expected: All tests pass, 0 lint warnings.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "feat: add CC, dispel, pressure, healing gap events to buildMatchTimeline"
```

---

### Task 5: `NEW_SYSTEM_PROMPT` in analyze.ts

**Files:**

- Modify: `packages/web/pages/api/analyze.ts`

- [ ] **Step 1: Add `NEW_SYSTEM_PROMPT` and `useTimelinePrompt` body param**

In `packages/web/pages/api/analyze.ts`, add the new constant after the existing `SYSTEM_PROMPT` declaration and wire it into the handler:

```typescript
const NEW_SYSTEM_PROMPT = `You are an expert World of Warcraft arena PvP analyst reviewing raw match timeline data for a player performing at Gladiator or R1 level.

Core rules:
- Evaluate only what the data shows. Never invent events, timestamps, or spells not present in the data.
- Only reference a spell if it appears in PLAYER LOADOUT or the timeline. Never say "you should have used X" if X is not listed — it may not be in the player's build.
- Express uncertainty explicitly. Avoid "must", "always", "should have" — prefer "likely", "probably", "the log suggests", "without HP data it's unclear whether...".
- This player already plays correctly most of the time. Focus on timing, trades, and decision quality — not rule-based mistakes.
- For purge analysis: check PURGE RESPONSIBILITY before attributing missed purges. Do not blame the log owner for purges if they cannot offensive purge.
- Ability absence: if a spell appears in PLAYER LOADOUT but has no cast in the timeline, that absence is notable only when (a) another ability from the same player appears in the timeline AND (b) the absent ability's function would have been relevant to a specific identified moment. Flag absence as a potential decision gap with stated uncertainty — never treat it as confirmed.
- Teammate ability absence follows the same rule. If talent-gating is plausible, flag that caveat explicitly.

Your task:
You are given a PLAYER LOADOUT (all major CDs available this match) and a MATCH TIMELINE (raw chronological events — no pre-selected moments, no pre-drawn conclusions).

Identify the most important decision points yourself. Read the full timeline, build your own causal narrative about what happened and why, then evaluate the decisions that most affected match outcome.

For each decision point you identify, evaluate:
1. Was this the correct trade given the available information?
2. What was the most likely alternative decision?
3. What is the estimated impact difference between the two choices?
4. What uncertainty prevents a definitive verdict?

Output format — exactly 5 findings maximum (fewer only if fewer meaningful decision points exist), ranked by estimated match impact. Most impactful first:

## Finding 1: [short title]
**What happened:** [one sentence]
**Alternative:** [the most likely correct play — one sentence]
**Impact:** [why the difference matters — specific to timing, CD value, or match outcome]
**Confidence:** [High/Medium/Low] — [one sentence on key uncertainty]

## Finding 2: ...
## Finding 3: ...

After your findings, add a Data Utility section:

## Data Utility

### Used — directly informed a finding
- [event type or specific event]: [how it was used]

### Present but unused
- [event type or specific event]: [why it didn't contribute]

### Missing — would have changed confidence or a finding
- [what you needed]: [which finding it would affect]

### One change
[Single most impactful prompt or data improvement you'd make]

Do not add a summary, "what went well" section, or general recommendations beyond the numbered findings and Data Utility section.`;
```

In the handler, update the destructuring and prompt selection:

```typescript
const {
  matchContext,
  apiKey: bodyApiKey,
  systemPrompt: bodySystemPrompt,
  debug,
  useTimelinePrompt,
} = req.body as {
  matchContext?: string;
  apiKey?: string;
  systemPrompt?: string;
  debug?: boolean;
  useTimelinePrompt?: boolean;
};
```

Replace the `activeSystemPrompt` selection:

```typescript
const activeSystemPrompt =
  debug && bodySystemPrompt && typeof bodySystemPrompt === 'string' && bodySystemPrompt.length <= 32_000
    ? bodySystemPrompt
    : useTimelinePrompt
      ? NEW_SYSTEM_PROMPT
      : SYSTEM_PROMPT;
```

- [ ] **Step 2: Verify lint passes**

```bash
npm run -w @wowarenalogs/web lint 2>&1 | tail -5
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add packages/web/pages/api/analyze.ts
git commit -m "feat: add NEW_SYSTEM_PROMPT and useTimelinePrompt param to analyze API"
```

---

### Task 6: Wire `useTimelinePrompt` into `buildMatchContext` (index.tsx)

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx`

- [ ] **Step 1: Add imports needed for new path**

In `index.tsx`, confirm these are already imported (they are — just check):

- `buildPlayerLoadout`, `buildMatchTimeline`, `BuildMatchTimelineParams` — add to the import from `'./utils'`
- `formatDampeningForContext` — already imported
- `formatSpecBaselines`, `benchmarks` — already imported

Update the import from `'./utils'`:

```typescript
import {
  buildMatchArc,
  buildMatchTimeline,
  buildPlayerLoadout,
  BuildMatchTimelineParams,
  identifyCriticalMoments,
} from './utils';
```

- [ ] **Step 2: Add `useTimelinePrompt` parameter to `buildMatchContext`**

Change the function signature from:

```typescript
export function buildMatchContext(
  combat: NonNullable<ReturnType<typeof useCombatReportContext>['combat']>,
  friends: ReturnType<typeof useCombatReportContext>['friends'],
  enemies: ReturnType<typeof useCombatReportContext>['enemies'],
): string {
```

To:

```typescript
export function buildMatchContext(
  combat: NonNullable<ReturnType<typeof useCombatReportContext>['combat']>,
  friends: ReturnType<typeof useCombatReportContext>['friends'],
  enemies: ReturnType<typeof useCombatReportContext>['enemies'],
  useTimelinePrompt = false,
): string {
```

- [ ] **Step 3: Add the new path before `const lines: string[] = [];`**

Find the line `const lines: string[] = [];` in `buildMatchContext` and insert before it:

```typescript
if (useTimelinePrompt) {
  const allTeamCDsWithSpec = teammateCooldowns.map(({ player, cds }) => ({
    player: player as ICombatUnit,
    spec: specToString(player.spec),
    cds,
  }));

  const tLines: string[] = [];
  tLines.push('ARENA MATCH — ANALYSIS REQUEST');
  tLines.push('');
  tLines.push('MATCH FACTS');
  tLines.push(
    `  Spec: ${ownerSpec}${healer ? ' (Healer)' : ''}  |  Bracket: ${combat.startInfo.bracket}  |  Result: ${resultStr}  |  Duration: ${fmtTime(durationSeconds)}`,
  );
  tLines.push(`  My team: ${myTeam}`);
  tLines.push(`  Enemy team: ${enemyTeam}`);
  tLines.push('');

  tLines.push('PURGE RESPONSIBILITY:');
  if (ownerCanPurge) {
    tLines.push(`  Log owner (${ownerSpec}): CAN offensive purge`);
  } else {
    tLines.push(`  Log owner (${ownerSpec}): CANNOT offensive purge — do not attribute missed purges to the log owner`);
  }
  tLines.push(
    teamPurgers.length > 0 ? `  Team offensive purgers: ${teamPurgers.join(', ')}` : '  Team offensive purgers: None',
  );

  const baselineLines = formatSpecBaselines(ownerSpec, cooldowns, benchmarks);
  if (baselineLines.length > 0) {
    tLines.push('');
    baselineLines.forEach((l) => tLines.push(l));
  }

  tLines.push('');
  formatDampeningForContext(
    combat.startInfo.bracket,
    [...friends, ...enemies],
    combat.startTime,
    combat.endTime,
  ).forEach((l) => tLines.push(l));

  tLines.push('');
  tLines.push(buildPlayerLoadout(owner as ICombatUnit, ownerSpec, cooldowns, allTeamCDsWithSpec, enemyCDTimeline));

  tLines.push('');
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
      matchStartMs: combat.startTime,
      isHealer: healer,
    } as BuildMatchTimelineParams),
  );

  return tLines.join('\n');
}
```

- [ ] **Step 4: Lint and test**

```bash
npm run lint 2>&1 | tail -10
npm run -w @wowarenalogs/shared test 2>&1 | tail -10
```

Expected: 0 lint errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx
git commit -m "feat: add useTimelinePrompt flag to buildMatchContext"
```

---

### Task 7: Wire `--new-prompt` into `printMatchPrompts.ts`

**Files:**

- Modify: `packages/tools/src/printMatchPrompts.ts`

- [ ] **Step 1: Add `NEW_SYSTEM_PROMPT` constant**

In `printMatchPrompts.ts`, add after the existing `TEST_SYSTEM_PROMPT` declaration:

```typescript
// New timeline system prompt — DATA UTILITY always included (no separate test mode needed)
const NEW_SYSTEM_PROMPT = `You are an expert World of Warcraft arena PvP analyst reviewing raw match timeline data for a player performing at Gladiator or R1 level.

Core rules:
- Evaluate only what the data shows. Never invent events, timestamps, or spells not present in the data.
- Only reference a spell if it appears in PLAYER LOADOUT or the timeline. Never say "you should have used X" if X is not listed — it may not be in the player's build.
- Express uncertainty explicitly. Avoid "must", "always", "should have" — prefer "likely", "probably", "the log suggests", "without HP data it's unclear whether...".
- This player already plays correctly most of the time. Focus on timing, trades, and decision quality — not rule-based mistakes.
- For purge analysis: check PURGE RESPONSIBILITY before attributing missed purges. Do not blame the log owner for purges if they cannot offensive purge.
- Ability absence: if a spell appears in PLAYER LOADOUT but has no cast in the timeline, that absence is notable only when (a) another ability from the same player appears in the timeline AND (b) the absent ability's function would have been relevant to a specific identified moment. Flag absence as a potential decision gap with stated uncertainty — never treat it as confirmed.
- Teammate ability absence follows the same rule. If talent-gating is plausible, flag that caveat explicitly.

Your task:
You are given a PLAYER LOADOUT (all major CDs available this match) and a MATCH TIMELINE (raw chronological events — no pre-selected moments, no pre-drawn conclusions).

Identify the most important decision points yourself. Read the full timeline, build your own causal narrative about what happened and why, then evaluate the decisions that most affected match outcome.

For each decision point you identify, evaluate:
1. Was this the correct trade given the available information?
2. What was the most likely alternative decision?
3. What is the estimated impact difference between the two choices?
4. What uncertainty prevents a definitive verdict?

Output format — exactly 5 findings maximum (fewer only if fewer meaningful decision points exist), ranked by estimated match impact. Most impactful first:

## Finding 1: [short title]
**What happened:** [one sentence]
**Alternative:** [the most likely correct play — one sentence]
**Impact:** [why the difference matters — specific to timing, CD value, or match outcome]
**Confidence:** [High/Medium/Low] — [one sentence on key uncertainty]

## Finding 2: ...
## Finding 3: ...

After your findings, add a Data Utility section:

## Data Utility

### Used — directly informed a finding
- [event type or specific event]: [how it was used]

### Present but unused
- [event type or specific event]: [why it didn't contribute]

### Missing — would have changed confidence or a finding
- [what you needed]: [which finding it would affect]

### One change
[Single most impactful prompt or data improvement you'd make]

Do not add a summary, "what went well" section, or general recommendations beyond the numbered findings and Data Utility section.`;
```

- [ ] **Step 2: Parse `--new-prompt` flag**

Find where `--healer`, `--ai`, `--test-prompt` are parsed (look for `process.argv` usage) and add:

```typescript
const useNewPrompt = process.argv.includes('--new-prompt');
```

- [ ] **Step 3: Add `buildMatchPromptNew` function**

Add to `printMatchPrompts.ts`, importing the new functions at the top:

```typescript
import {
  buildMatchArc,
  buildMatchTimeline,
  buildPlayerLoadout,
  BuildMatchTimelineParams,
  identifyCriticalMoments,
} from '../../shared/src/components/CombatReport/CombatAIAnalysis/utils';
```

Then add the new prompt builder function after `buildMatchPrompt`:

```typescript
function buildMatchPromptNew(combat: ParsedCombat, forceHealer = false): string {
  const allUnits = Object.values(combat.units);
  const friends = allUnits.filter(
    (u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Friendly,
  ) as ICombatUnit[];
  const enemies = allUnits.filter(
    (u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Hostile,
  ) as ICombatUnit[];

  if (friends.length === 0 || enemies.length === 0) return '';
  const durationSeconds = (combat.endTime - combat.startTime) / 1000;
  if (durationSeconds < 10) return '';

  const owner = forceHealer
    ? (friends.find((p) => isHealerSpec(p.spec)) ?? friends[0])
    : (friends.find((p) => !isHealerSpec(p.spec)) ?? friends.find((p) => isHealerSpec(p.spec)) ?? friends[0]);

  const ownerSpec = specToString(owner.spec);
  const healer = isHealerSpec(owner.spec);
  const myTeam = friends.map((p) => specToString(p.spec)).join(', ');
  const enemyTeam = enemies.map((p) => specToString(p.spec)).join(', ');

  const combatAny = combat as unknown as Record<string, unknown>;
  const playerWon =
    typeof combatAny['winningTeamId'] === 'string' ? combatAny['winningTeamId'] === combat.playerTeamId : null;
  const resultStr = playerWon === true ? 'Win' : playerWon === false ? 'Loss' : 'Unknown';

  const friendlyDeaths = friends
    .filter((p) => p.deathRecords.length > 0)
    .flatMap((p) =>
      p.deathRecords.map((d) => ({
        spec: specToString(p.spec),
        name: p.name,
        atSeconds: (d.timestamp - combat.startTime) / 1000,
      })),
    )
    .sort((a, b) => a.atSeconds - b.atSeconds);

  const enemyDeaths = enemies
    .filter((p) => p.deathRecords.length > 0)
    .flatMap((p) =>
      p.deathRecords.map((d) => ({
        spec: specToString(p.spec),
        name: p.name,
        atSeconds: (d.timestamp - combat.startTime) / 1000,
      })),
    )
    .sort((a, b) => a.atSeconds - b.atSeconds);

  const cooldowns = extractMajorCooldowns(owner, combat);
  const teammateCooldowns = friends
    .filter((p) => p.id !== owner.id)
    .map((p) => ({ player: p, spec: specToString(p.spec), cds: extractMajorCooldowns(p, combat) }));
  const enemyCDTimeline = reconstructEnemyCDTimeline(enemies, combat, owner, friends);
  const pressureWindows = computePressureWindows(friends, combat);
  const healingGaps = healer ? detectHealingGaps(owner, friends, enemies, combat) : [];
  const dispelSummary = reconstructDispelSummary(friends, enemies, combat);
  const ccTrinketSummaries = friends.map((p) => analyzePlayerCCAndTrinket(p, enemies, combat));

  const ownerCanPurge = canOffensivePurge(owner);
  const teamPurgers = friends.filter((p) => p.id !== owner.id && canOffensivePurge(p)).map((p) => specToString(p.spec));

  const lines: string[] = [];
  lines.push('ARENA MATCH — ANALYSIS REQUEST');
  lines.push('');
  lines.push('MATCH FACTS');
  lines.push(
    `  Spec: ${ownerSpec}${healer ? ' (Healer)' : ''}  |  Bracket: ${combat.startInfo.bracket}  |  Result: ${resultStr}  |  Duration: ${fmtTime(durationSeconds)}`,
  );
  lines.push(`  My team: ${myTeam}`);
  lines.push(`  Enemy team: ${enemyTeam}`);
  lines.push('');

  lines.push('PURGE RESPONSIBILITY:');
  lines.push(
    ownerCanPurge
      ? `  Log owner (${ownerSpec}): CAN offensive purge`
      : `  Log owner (${ownerSpec}): CANNOT offensive purge — do not attribute missed purges to the log owner`,
  );
  lines.push(
    teamPurgers.length > 0 ? `  Team offensive purgers: ${teamPurgers.join(', ')}` : '  Team offensive purgers: None',
  );

  const baselineLines = formatSpecBaselines(ownerSpec, cooldowns, benchmarks);
  if (baselineLines.length > 0) {
    lines.push('');
    baselineLines.forEach((l) => lines.push(l));
  }

  lines.push('');
  const allTeamCDsWithSpec = teammateCooldowns.map(({ player, spec, cds }) => ({ player, spec, cds }));
  lines.push(buildPlayerLoadout(owner, ownerSpec, cooldowns, allTeamCDsWithSpec, enemyCDTimeline));

  lines.push('');
  lines.push(
    buildMatchTimeline({
      owner,
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
      friends,
      matchStartMs: combat.startTime,
      isHealer: healer,
    } as BuildMatchTimelineParams),
  );

  return lines.join('\n');
}
```

- [ ] **Step 4: Wire `--new-prompt` into the main printing loop**

Find where `buildMatchPrompt` is called (likely in the main execution loop) and add the new branch:

```typescript
const prompt = useNewPrompt ? buildMatchPromptNew(combat, forceHealer) : buildMatchPrompt(combat, forceHealer);
```

Also update `callClaude` call to use the right system prompt:

```typescript
// When --new-prompt, always use NEW_SYSTEM_PROMPT (DATA UTILITY always on; no separate test mode)
const aiResponse = useAI ? await callClaude(prompt, useNewPrompt ? 'new' : testPromptMode ? 'test' : 'standard') : null;
```

Update `callClaude` to accept a mode string:

```typescript
async function callClaude(prompt: string, mode: 'standard' | 'test' | 'new' = 'standard'): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return '[AI SKIPPED — set ANTHROPIC_API_KEY env var to enable]';
  const client = new Anthropic({ apiKey });
  const systemPrompt = mode === 'new' ? NEW_SYSTEM_PROMPT : mode === 'test' ? TEST_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  });
  const content = message.content[0];
  if (content.type !== 'text') return '[AI returned non-text response]';
  return content.text;
}
```

- [ ] **Step 5: Lint**

```bash
npm run -w @wowarenalogs/tools lint 2>&1 | tail -10
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Smoke test the new path**

```bash
npm run -w @wowarenalogs/tools start:printMatchPrompts -- --count 1 --healer --new-prompt 2>&1 | head -60
```

Expected: Output contains `ARENA MATCH — ANALYSIS REQUEST`, `PLAYER LOADOUT`, `MATCH TIMELINE`, and at least a few `[OWNER CD]` or `[DEATH]` or `[ENEMY CD]` lines.

- [ ] **Step 7: Commit**

```bash
git add packages/tools/src/printMatchPrompts.ts
git commit -m "feat: add --new-prompt flag to printMatchPrompts for side-by-side comparison"
```

---

## Self-Review

**Spec coverage:**

- ✅ `buildPlayerLoadout` with no NEVER USED annotation — Task 1
- ✅ `buildMatchTimeline` with all event types from spec table — Tasks 2–4
- ✅ PLAYER LOADOUT enemy deduplication — Task 1
- ✅ `useTimelinePrompt` flag in `buildMatchContext` — Task 6
- ✅ `--new-prompt` CLI flag in `printMatchPrompts.ts` — Task 7
- ✅ `NEW_SYSTEM_PROMPT` with DATA UTILITY always-on — Tasks 5, 7
- ✅ `useTimelinePrompt` in `analyze.ts` request body — Task 5
- ✅ Old code path untouched — Tasks 6, 7 add branches; existing code unchanged
- ✅ Feature flag strategy (default `false`, flip to enable) — Tasks 6, 7
- ✅ Side-by-side comparison via `--new-prompt` vs no flag — Task 7

**Potential gap:** `printMatchPrompts.ts` Task 4 says "find where buildMatchPrompt is called" without showing the exact line. The file uses `buildMatchPrompt` in the main execution loop — in Step 4, the engineer needs to locate this call site. The file was read earlier and the structure is clear, but the exact line reference is missing. The engineer should search for `buildMatchPrompt(` in the file to find it.

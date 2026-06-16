# F74: CC Coverage Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track Root, Disarm, and Kick/Interrupt events on friendly players and surface them in the `[RES] cc:` line alongside existing Stun/Silence/Fear/Cyclone/Blind entries.

**Architecture:** Roots and disarms arrive as `SPELL_AURA_APPLIED/REMOVED` events in `player.auraEvents` — same approach as existing hard CC. Kicks arrive as `SPELL_INTERRUPT` events in `player.actionIn` as `CombatExtraSpellAction` objects (where `extraSpellId`/`extraSpellName` is the kick ability, `spellId`/`spellName` is the interrupted spell). New fields on `IPlayerCCTrinketSummary` feed the updated `cc:` formatter in `buildResourceSnapshot` and `buildJsonSituationSnapshot`.

**Tech Stack:** TypeScript, existing `@wowarenalogs/parser` types, Jest/TSDX, `spells.json`, `spellTags.ts`, `ccTrinketAnalysis.ts`, `CombatAIAnalysis/utils.ts`.

---

## File Map

| Action | Path                                                                                      | Responsibility                                                                                                                                     |
| ------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modify | `packages/shared/src/data/spells.json`                                                    | Add 3 disarm spell IDs with type `"disarms"`                                                                                                       |
| Modify | `packages/shared/src/data/spellTags.ts`                                                   | Add `'disarms'` to `ISpellMetadata.type`; export `rootSpellIds`, `interruptSpellIds`, `disarmSpellIds`                                             |
| Create | `packages/shared/src/utils/__tests__/spellTags.test.ts`                                   | Verify the 3 new exports                                                                                                                           |
| Modify | `packages/shared/src/utils/__tests__/testHelpers.ts`                                      | Add `actionIn` override to `makeUnit`                                                                                                              |
| Modify | `packages/shared/src/utils/ccTrinketAnalysis.ts`                                          | Add `IRootInstance`, `IInterruptInstance`; add 3 new arrays to `IPlayerCCTrinketSummary`; track roots/disarms/kicks in `analyzePlayerCCAndTrinket` |
| Modify | `packages/shared/src/utils/__tests__/ccTrinketAnalysis.test.ts`                           | Tests for root/disarm/interrupt tracking                                                                                                           |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`                   | Update `buildResourceSnapshot` and `buildJsonSituationSnapshot` to emit roots/disarms/kicks in `cc:`                                               |
| Modify | `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` | Tests for updated `cc:` output                                                                                                                     |

---

## Task 1: Export rootSpellIds, interruptSpellIds, disarmSpellIds

**Files:**

- Modify: `packages/shared/src/data/spells.json`
- Modify: `packages/shared/src/data/spellTags.ts`
- Create: `packages/shared/src/utils/__tests__/spellTags.test.ts`

### Background

`spells.json` already has `type: "roots"` entries (29 IDs, e.g. `"122"` Frost Nova, `"339"` Entangling Roots) and `type: "interrupts"` entries (18 IDs with `duration` field). It has **no** `type: "disarms"` entries. Three disarm spell IDs come from `spellClassMap.json > diminishingReturns > disarm`: `209749` Faerie Swarm (Druid), `233759` Grapple Weapon (Monk), `236077` Disarm (Warrior). The fourth entry in that list (`207777`) is **excluded** — it's already classified as `Incapacitate` CC in `DR_CATEGORY_MAP` and adding it to disarms would create a double-tracking conflict.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/utils/__tests__/spellTags.test.ts`:

```typescript
import { disarmSpellIds, interruptSpellIds, rootSpellIds } from '../../data/spellTags';

describe('rootSpellIds', () => {
  it('contains Frost Nova (122)', () => expect(rootSpellIds.has('122')).toBe(true));
  it('contains Entangling Roots (339)', () => expect(rootSpellIds.has('339')).toBe(true));
  it('contains Freeze / Water Ele (33395)', () => expect(rootSpellIds.has('33395')).toBe(true));
  it('does not contain a CC spell (Kidney Shot 408)', () => expect(rootSpellIds.has('408')).toBe(false));
});

describe('interruptSpellIds', () => {
  it('contains Kick/Rogue (1766)', () => expect(interruptSpellIds.has('1766')).toBe(true));
  it('contains Counterspell/Mage (2139)', () => expect(interruptSpellIds.has('2139')).toBe(true));
  it('contains Pummel/Warrior (6552)', () => expect(interruptSpellIds.has('6552')).toBe(true));
  it('does not contain a CC spell (Polymorph 118)', () => expect(interruptSpellIds.has('118')).toBe(false));
});

describe('disarmSpellIds', () => {
  it('contains Faerie Swarm/Druid (209749)', () => expect(disarmSpellIds.has('209749')).toBe(true));
  it('contains Grapple Weapon/Monk (233759)', () => expect(disarmSpellIds.has('233759')).toBe(true));
  it('contains Disarm/Warrior (236077)', () => expect(disarmSpellIds.has('236077')).toBe(true));
  it('does not contain 207777 (already classified as Incapacitate CC)', () => {
    expect(disarmSpellIds.has('207777')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd packages/shared && npx tsdx test --testPathPattern="spellTags" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `rootSpellIds`, `interruptSpellIds`, `disarmSpellIds` are not exported.

- [ ] **Step 3: Add disarm spell IDs to spells.json**

In `packages/shared/src/data/spells.json`, add these three entries (JSON object — order doesn't matter):

```json
"209749": { "type": "disarms" },
"233759": { "type": "disarms" },
"236077": { "type": "disarms" }
```

- [ ] **Step 4: Update spellTags.ts**

In `packages/shared/src/data/spellTags.ts`, change the `type` union and add three exports:

```typescript
interface ISpellMetadata {
  type:
    | 'cc'
    | 'roots'
    | 'disarms'
    | 'immunities'
    | 'buffs_offensive'
    | 'buffs_defensive'
    | 'buffs_other'
    | 'debuffs_offensive'
    | 'debuffs_defensive'
    | 'debuffs_other'
    | 'interrupts';
  duration?: number;
  priority?: boolean;
  nounitFrames?: boolean;
  nonameplates?: boolean;
}
```

After the existing `ccSpellIds` export, add:

```typescript
export const rootSpellIds = new Set<string>(Object.keys(spells).filter((id) => spells[id].type === 'roots'));

export const interruptSpellIds = new Set<string>(Object.keys(spells).filter((id) => spells[id].type === 'interrupts'));

export const disarmSpellIds = new Set<string>(Object.keys(spells).filter((id) => spells[id].type === 'disarms'));
```

- [ ] **Step 5: Run tests and confirm they pass**

```bash
cd packages/shared && npx tsdx test --testPathPattern="spellTags" --no-coverage 2>&1 | tail -20
```

Expected: PASS — 11 passing assertions.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/data/spells.json \
        packages/shared/src/data/spellTags.ts \
        packages/shared/src/utils/__tests__/spellTags.test.ts
git commit -m "feat(spellTags): export rootSpellIds, interruptSpellIds, disarmSpellIds; add disarm spell IDs to spells.json (F74)"
```

---

## Task 2: Root/disarm/interrupt tracking in ccTrinketAnalysis.ts

**Files:**

- Modify: `packages/shared/src/utils/__tests__/testHelpers.ts`
- Modify: `packages/shared/src/utils/ccTrinketAnalysis.ts`
- Modify: `packages/shared/src/utils/__tests__/ccTrinketAnalysis.test.ts`

### Background

`IPlayerCCTrinketSummary` currently has `ccInstances: ICCInstance[]`. We add:

- `rootInstances: IRootInstance[]` — tracked via `SPELL_AURA_APPLIED/REMOVED` for `rootSpellIds`
- `disarmInstances: IRootInstance[]` — same shape, tracked for `disarmSpellIds`
- `interruptInstances: IInterruptInstance[]` — tracked via `SPELL_INTERRUPT` events in `player.actionIn`

For kicks, `player.actionIn` holds `CombatExtraSpellAction` objects when `event === SPELL_INTERRUPT`. Cast to `CombatExtraSpellAction` to access `extraSpellId` (the kick spell) and `extraSpellName`. Lockout duration comes from `spells[extraSpellId]?.duration ?? 3`.

- [ ] **Step 1: Add `actionIn` override to `makeUnit` in testHelpers.ts**

Open `packages/shared/src/utils/__tests__/testHelpers.ts`.

In the `makeUnit` overrides type (around line 144), add `actionIn?: AnyObj[]`:

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
    actionIn?: AnyObj[];
    damageIn?: AnyObj[];
    healOut?: AnyObj[];
    advancedActions?: AnyObj[];
    info?: AnyObj | undefined;
  } = {},
): ICombatUnit {
```

And in the returned object, change:

```typescript
    actionIn: [],
```

to:

```typescript
    actionIn: (overrides.actionIn ?? []) as ICombatUnit['actionIn'],
```

Also add a helper for SPELL_INTERRUPT events at the bottom of testHelpers.ts:

```typescript
/** Minimal SPELL_INTERRUPT event (CombatExtraSpellAction shape). */
export function makeInterruptEvent(
  kickSpellId: string,
  kickSpellName: string,
  interruptedSpellId: string,
  interruptedSpellName: string,
  timestamp: number,
  srcUnitId = 'enemy-1',
  srcUnitName = 'Enemy',
): AnyObj {
  return {
    logLine: { event: LogEvent.SPELL_INTERRUPT, timestamp, parameters: [] },
    timestamp,
    spellId: interruptedSpellId,
    spellName: interruptedSpellName,
    extraSpellId: kickSpellId,
    extraSpellName: kickSpellName,
    srcUnitId,
    srcUnitName,
    destUnitId: 'player-1',
    destUnitName: 'Target',
    effectiveAmount: 0,
    advancedActorMaxHp: 0,
    advancedActorCurrentHp: 0,
  };
}
```

- [ ] **Step 2: Write failing tests in ccTrinketAnalysis.test.ts**

Open `packages/shared/src/utils/__tests__/ccTrinketAnalysis.test.ts` and add a new `describe` block after the existing `detectTrinketType` tests:

```typescript
import { CombatUnitReaction, CombatUnitSpec, CombatUnitType, LogEvent } from '@wowarenalogs/parser';

import { analyzePlayerCCAndTrinket } from '../ccTrinketAnalysis';
import { makeAuraEvent, makeInterruptEvent, makeUnit } from './testHelpers';

// Keep existing mock at top of file
// jest.mock('../../data/trinketItemIds.json', () => ({...}));

describe('analyzePlayerCCAndTrinket — root/disarm/interrupt tracking', () => {
  const MATCH_START = 1_000_000;
  const MATCH_END = 1_300_000;

  function makeCombat() {
    return { startTime: MATCH_START, endTime: MATCH_END, startInfo: { zoneId: '1672' } };
  }

  function makeEnemy(id: string, name: string) {
    return makeUnit(id, {
      name,
      reaction: CombatUnitReaction.Hostile,
      spec: CombatUnitSpec.Rogue_Subtlety,
    });
  }

  it('tracks a root applied by an enemy', () => {
    // Entangling Roots = spellId '339'
    const apply = makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '339', MATCH_START + 5_000, 'enemy-1', 'player-1');
    const removed = makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '339', MATCH_START + 8_000, 'enemy-1', 'player-1');
    const player = makeUnit('player-1', { auraEvents: [apply, removed] });
    const enemy = makeEnemy('enemy-1', 'EnemyA');

    const result = analyzePlayerCCAndTrinket(player, [enemy], makeCombat());

    expect(result.rootInstances).toHaveLength(1);
    expect(result.rootInstances[0].spellId).toBe('339');
    expect(result.rootInstances[0].durationSeconds).toBeCloseTo(3);
    expect(result.rootInstances[0].atSeconds).toBeCloseTo(5);
  });

  it('does not track roots from friendly sources', () => {
    const apply = makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '339', MATCH_START + 5_000, 'friend-1', 'player-1');
    const player = makeUnit('player-1', { auraEvents: [apply] });
    const enemy = makeEnemy('enemy-1', 'EnemyA');

    const result = analyzePlayerCCAndTrinket(player, [enemy], makeCombat());

    expect(result.rootInstances).toHaveLength(0);
  });

  it('tracks a disarm applied by an enemy', () => {
    // Disarm (Warrior) = spellId '236077'
    const apply = makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '236077', MATCH_START + 10_000, 'enemy-1', 'player-1');
    const removed = makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '236077', MATCH_START + 15_000, 'enemy-1', 'player-1');
    const player = makeUnit('player-1', { auraEvents: [apply, removed] });
    const enemy = makeEnemy('enemy-1', 'EnemyA');

    const result = analyzePlayerCCAndTrinket(player, [enemy], makeCombat());

    expect(result.disarmInstances).toHaveLength(1);
    expect(result.disarmInstances[0].spellId).toBe('236077');
    expect(result.disarmInstances[0].durationSeconds).toBeCloseTo(5);
  });

  it('tracks a kick from an enemy (SPELL_INTERRUPT)', () => {
    // Kick (Rogue) = extraSpellId '1766', lockout 5s; interrupted = Frost Bolt
    const kick = makeInterruptEvent('1766', 'Kick', '116', 'Frostbolt', MATCH_START + 20_000, 'enemy-1', 'EnemyA');
    const player = makeUnit('player-1', { actionIn: [kick] });
    const enemy = makeEnemy('enemy-1', 'EnemyA');

    const result = analyzePlayerCCAndTrinket(player, [enemy], makeCombat());

    expect(result.interruptInstances).toHaveLength(1);
    expect(result.interruptInstances[0].kickSpellId).toBe('1766');
    expect(result.interruptInstances[0].kickSpellName).toBe('Kick');
    expect(result.interruptInstances[0].interruptedSpellName).toBe('Frostbolt');
    expect(result.interruptInstances[0].lockoutDurationSeconds).toBe(5);
    expect(result.interruptInstances[0].atSeconds).toBeCloseTo(20);
  });

  it('uses a 3s default lockout for unknown interrupt spells', () => {
    // Unknown spell ID '99999999' — not in spells.json
    const kick = makeInterruptEvent('99999999', 'UnknownKick', '116', 'Frostbolt', MATCH_START + 5_000);
    const player = makeUnit('player-1', { actionIn: [kick] });
    const enemy = makeEnemy('enemy-1', 'EnemyA');

    const result = analyzePlayerCCAndTrinket(player, [enemy], makeCombat());

    expect(result.interruptInstances[0].lockoutDurationSeconds).toBe(3);
  });

  it('does not track kicks from friendly sources', () => {
    const kick = makeInterruptEvent('1766', 'Kick', '116', 'Frostbolt', MATCH_START + 5_000, 'friend-1', 'Friend');
    const player = makeUnit('player-1', { actionIn: [kick] });
    const enemy = makeEnemy('enemy-1', 'EnemyA');

    const result = analyzePlayerCCAndTrinket(player, [enemy], makeCombat());

    expect(result.interruptInstances).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

```bash
cd packages/shared && npx tsdx test --testPathPattern="ccTrinketAnalysis" --no-coverage 2>&1 | tail -30
```

Expected: FAIL — `rootInstances`, `disarmInstances`, `interruptInstances` do not exist on the result.

- [ ] **Step 4: Add interfaces and tracking to ccTrinketAnalysis.ts**

Open `packages/shared/src/utils/ccTrinketAnalysis.ts`.

**4a. Update imports** — add `CombatExtraSpellAction` from parser, and add `disarmSpellIds`, `interruptSpellIds`, `rootSpellIds`, `spells` from spellTags:

```typescript
import { CombatExtraSpellAction, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { ccSpellIds, disarmSpellIds, interruptSpellIds, rootSpellIds, spells } from '../data/spellTags';
```

**4b. Add new interfaces** — insert after the existing `ICCInstance` interface (before `IPlayerCCTrinketSummary`):

```typescript
export interface IRootInstance {
  atSeconds: number;
  durationSeconds: number;
  spellId: string;
  spellName: string;
  sourceName: string;
  sourceSpec: string;
}

export interface IInterruptInstance {
  atSeconds: number;
  lockoutDurationSeconds: number;
  kickSpellId: string;
  kickSpellName: string;
  interruptedSpellName: string;
  sourceName: string;
  sourceSpec: string;
}
```

**4c. Add new fields to `IPlayerCCTrinketSummary`** — append to the interface:

```typescript
export interface IPlayerCCTrinketSummary {
  // ...existing fields...
  /** Roots applied by enemies. No DR category. */
  rootInstances: IRootInstance[];
  /** Disarms applied by enemies. No DR category. */
  disarmInstances: IRootInstance[];
  /** Kicks (interrupts) landed by enemies. */
  interruptInstances: IInterruptInstance[];
}
```

**4d. Implement root and disarm tracking** — inside `analyzePlayerCCAndTrinket`, after the existing `pendingCC` / `ccWindows` declarations, add:

```typescript
const pendingRoot = new Map<string, { applyMs: number; spellName: string; srcId: string; srcName: string }>();
const rootWindows: Array<{
  spellId: string;
  spellName: string;
  srcId: string;
  srcName: string;
  applyMs: number;
  removeMs: number;
}> = [];

const pendingDisarm = new Map<string, { applyMs: number; spellName: string; srcId: string; srcName: string }>();
const disarmWindows: Array<{
  spellId: string;
  spellName: string;
  srcId: string;
  srcName: string;
  applyMs: number;
  removeMs: number;
}> = [];
```

Inside the existing `for (const aura of player.auraEvents)` loop, after the hard-CC block, add:

```typescript
if (rootSpellIds.has(spellId) || disarmSpellIds.has(spellId)) {
  const isRoot = rootSpellIds.has(spellId);
  const pending = isRoot ? pendingRoot : pendingDisarm;
  const windows = isRoot ? rootWindows : disarmWindows;
  const key = `${spellId}:${aura.srcUnitId}`;

  if (event === LogEvent.SPELL_AURA_APPLIED) {
    pending.set(key, {
      applyMs: aura.timestamp,
      spellName: aura.spellName ?? spellId,
      srcId: aura.srcUnitId,
      srcName: aura.srcUnitName,
    });
  } else if (
    event === LogEvent.SPELL_AURA_REMOVED ||
    event === LogEvent.SPELL_AURA_BROKEN ||
    event === LogEvent.SPELL_AURA_BROKEN_SPELL
  ) {
    const p = pending.get(key);
    if (p) {
      windows.push({
        spellId,
        spellName: p.spellName,
        srcId: p.srcId,
        srcName: p.srcName,
        applyMs: p.applyMs,
        removeMs: aura.timestamp,
      });
      pending.delete(key);
    }
  }
}
```

After the existing `Array.from(pendingCC.entries()).forEach(...)` close-at-match-end block, add:

```typescript
for (const [key, p] of pendingRoot) {
  const [pendingSpellId] = key.split(':');
  rootWindows.push({
    spellId: pendingSpellId,
    spellName: p.spellName,
    srcId: p.srcId,
    srcName: p.srcName,
    applyMs: p.applyMs,
    removeMs: combat.endTime,
  });
}
for (const [key, p] of pendingDisarm) {
  const [pendingSpellId] = key.split(':');
  disarmWindows.push({
    spellId: pendingSpellId,
    spellName: p.spellName,
    srcId: p.srcId,
    srcName: p.srcName,
    applyMs: p.applyMs,
    removeMs: combat.endTime,
  });
}
```

**4e. Convert root/disarm windows to instances** — after the `const enemyUnitMap` line, add:

```typescript
const rootInstances: IRootInstance[] = rootWindows
  .map((w) => ({
    atSeconds: (w.applyMs - matchStartMs) / 1000,
    durationSeconds: (w.removeMs - w.applyMs) / 1000,
    spellId: w.spellId,
    spellName: w.spellName,
    sourceName: w.srcName,
    sourceSpec: enemySpecMap.get(w.srcId) ?? 'Unknown',
  }))
  .sort((a, b) => a.atSeconds - b.atSeconds);

const disarmInstances: IRootInstance[] = disarmWindows
  .map((w) => ({
    atSeconds: (w.applyMs - matchStartMs) / 1000,
    durationSeconds: (w.removeMs - w.applyMs) / 1000,
    spellId: w.spellId,
    spellName: w.spellName,
    sourceName: w.srcName,
    sourceSpec: enemySpecMap.get(w.srcId) ?? 'Unknown',
  }))
  .sort((a, b) => a.atSeconds - b.atSeconds);
```

**4f. Implement interrupt/kick tracking** — after the disarmInstances block, add:

```typescript
const interruptInstances: IInterruptInstance[] = [];
for (const action of player.actionIn) {
  if (action.logLine.event !== LogEvent.SPELL_INTERRUPT) continue;
  if (!enemyIds.has(action.srcUnitId)) continue;
  const extraAction = action as unknown as CombatExtraSpellAction;
  const kickSpellId = extraAction.extraSpellId;
  const lockoutDurationSeconds = spells[kickSpellId]?.duration ?? 3;
  interruptInstances.push({
    atSeconds: (action.timestamp - matchStartMs) / 1000,
    lockoutDurationSeconds,
    kickSpellId,
    kickSpellName: extraAction.extraSpellName,
    interruptedSpellName: action.spellName ?? 'unknown',
    sourceName: action.srcUnitName,
    sourceSpec: enemySpecMap.get(action.srcUnitId) ?? 'Unknown',
  });
}
interruptInstances.sort((a, b) => a.atSeconds - b.atSeconds);
```

**4g. Include new instances in the return value** — in the `return` statement of `analyzePlayerCCAndTrinket`, add:

```typescript
    rootInstances,
    disarmInstances,
    interruptInstances,
```

- [ ] **Step 5: Run tests and confirm they pass**

```bash
cd packages/shared && npx tsdx test --testPathPattern="ccTrinketAnalysis" --no-coverage 2>&1 | tail -30
```

Expected: PASS — all `detectTrinketType` tests and the new 6 tests all pass.

- [ ] **Step 6: Run the full test suite to check for regressions**

```bash
cd packages/shared && npx tsdx test --no-coverage 2>&1 | tail -20
```

Expected: PASS — all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/utils/__tests__/testHelpers.ts \
        packages/shared/src/utils/ccTrinketAnalysis.ts \
        packages/shared/src/utils/__tests__/ccTrinketAnalysis.test.ts
git commit -m "feat(ccTrinketAnalysis): track root, disarm, and interrupt instances per player (F74)"
```

---

## Task 3: Surface roots/disarms/kicks in cc: line

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`
- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

### Background

`buildResourceSnapshot` (line ~1325) checks `ccTrinketSummaries` for active hard CC and emits `cc:Player/SpellName-Ns[stun]`. We extend this loop to also check `rootInstances`, `disarmInstances`, and `interruptInstances`. Format additions:

- Root: `pid(name)/SpellName-Ns[root]`
- Disarm: `pid(name)/SpellName-Ns[disarm]`
- Kick: `pid(name)/KickSpellName-Ns[kick]` where N = remaining lockout seconds

`buildJsonSituationSnapshot` (line ~1427) has equivalent logic for the `ccList` JSON array — each entry gets an optional `root`, `disarm`, or `kick` boolean flag.

- [ ] **Step 1: Write failing tests**

In `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`, locate the existing `cc:` tests (search for `'cc:Player1/Psychic Scream-5s'`) and add a new `describe` block nearby:

```typescript
describe('buildResourceSnapshot — root/disarm/kick in cc: line', () => {
  // Helpers: these tests use the same buildResourceSnapshot import already present in this file.
  // Import IRootInstance and IInterruptInstance from ccTrinketAnalysis if not already imported.

  function makeSummaryWithRoot(playerName: string, atSeconds: number, durationSeconds: number) {
    return {
      playerName,
      playerSpec: 'Druid_Restoration',
      trinketType: 'Gladiator' as const,
      trinketCooldownSeconds: 90,
      ccInstances: [],
      trinketUseTimes: [],
      missedTrinketWindows: [],
      rootInstances: [
        {
          atSeconds,
          durationSeconds,
          spellId: '339',
          spellName: 'Entangling Roots',
          sourceName: 'EnemyDruid',
          sourceSpec: 'Druid_Balance',
        },
      ],
      disarmInstances: [],
      interruptInstances: [],
    };
  }

  function makeSummaryWithDisarm(playerName: string, atSeconds: number, durationSeconds: number) {
    return {
      playerName,
      playerSpec: 'Warrior_Arms',
      trinketType: 'Gladiator' as const,
      trinketCooldownSeconds: 120,
      ccInstances: [],
      trinketUseTimes: [],
      missedTrinketWindows: [],
      rootInstances: [],
      disarmInstances: [
        {
          atSeconds,
          durationSeconds,
          spellId: '236077',
          spellName: 'Disarm',
          sourceName: 'EnemyWarrior',
          sourceSpec: 'Warrior_Arms',
        },
      ],
      interruptInstances: [],
    };
  }

  function makeSummaryWithKick(playerName: string, atSeconds: number, lockoutDurationSeconds: number) {
    return {
      playerName,
      playerSpec: 'Mage_Frost',
      trinketType: 'Gladiator' as const,
      trinketCooldownSeconds: 120,
      ccInstances: [],
      trinketUseTimes: [],
      missedTrinketWindows: [],
      rootInstances: [],
      disarmInstances: [],
      interruptInstances: [
        {
          atSeconds,
          lockoutDurationSeconds,
          kickSpellId: '1766',
          kickSpellName: 'Kick',
          interruptedSpellName: 'Frostbolt',
          sourceName: 'EnemyRogue',
          sourceSpec: 'Rogue_Subtlety',
        },
      ],
    };
  }

  // Minimal params for buildResourceSnapshot (reuse existing pattern from this test file)
  function minimalParams(ccTrinketSummaries: unknown[], ownerName: string) {
    return {
      timeSeconds: 30,
      ownerCDs: [],
      ownerName,
      teammateCDs: [],
      ccTrinketSummaries: ccTrinketSummaries as IPlayerCCTrinketSummary[],
      enemyCDTimeline: { players: [] },
    };
  }

  it('shows [root] tag when player is rooted at snapshot time', () => {
    // Root applied at t=25, lasts 8s → still active at t=30
    const summary = makeSummaryWithRoot('Player1', 25, 8);
    const result = buildResourceSnapshot(minimalParams([summary], 'Player1'));
    expect(result).toContain('cc:');
    expect(result).toContain('[root]');
    expect(result).toContain('Entangling Roots');
  });

  it('omits root from cc: when root has expired at snapshot time', () => {
    // Root at t=20, lasts 3s → expired by t=30
    const summary = makeSummaryWithRoot('Player1', 20, 3);
    const result = buildResourceSnapshot(minimalParams([summary], 'Player1'));
    expect(result).not.toContain('[root]');
  });

  it('shows [disarm] tag when player is disarmed at snapshot time', () => {
    // Disarm at t=28, lasts 5s → still active at t=30
    const summary = makeSummaryWithDisarm('Player1', 28, 5);
    const result = buildResourceSnapshot(minimalParams([summary], 'Player1'));
    expect(result).toContain('[disarm]');
    expect(result).toContain('Disarm');
  });

  it('shows [kick] tag when player is within kick lockout at snapshot time', () => {
    // Kick at t=27, lockout 5s → expires at t=32, still active at t=30
    const summary = makeSummaryWithKick('Player1', 27, 5);
    const result = buildResourceSnapshot(minimalParams([summary], 'Player1'));
    expect(result).toContain('[kick]');
    expect(result).toContain('Kick');
  });

  it('omits kick from cc: when lockout has expired', () => {
    // Kick at t=20, lockout 5s → expired at t=25, before snapshot t=30
    const summary = makeSummaryWithKick('Player1', 20, 5);
    const result = buildResourceSnapshot(minimalParams([summary], 'Player1'));
    expect(result).not.toContain('[kick]');
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd packages/shared && npx tsdx test --testPathPattern="timeline" --no-coverage 2>&1 | grep -E "PASS|FAIL|●" | head -30
```

Expected: FAIL on the 5 new tests — `buildResourceSnapshot` does not yet emit `[root]`, `[disarm]`, or `[kick]`.

- [ ] **Step 3: Update buildResourceSnapshot in utils.ts**

Open `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`.

Locate the `cc:` block (around line 1325–1351). The current code reads:

```typescript
const ccParts: string[] = [];
for (const { name } of allFriendlyPlayers) {
  const summary = summaryByName.get(name);
  const activeCC = summary?.ccInstances.find(
    (cc) => cc.atSeconds <= timeSeconds && timeSeconds < cc.atSeconds + cc.durationSeconds,
  );
  if (!activeCC) continue;

  const remaining = Math.round(activeCC.atSeconds + activeCC.durationSeconds - timeSeconds);
  const isStun = activeCC.drInfo?.category === 'Stun';
  const stunTag = isStun ? '[stun]' : '';
  const trinketUsedNow = summary?.trinketUseTimes.some((t) => Math.abs(t - timeSeconds) <= 1) ?? false;
  const trinketTag = isStun && trinketUsedNow ? '[trinketed]' : '';
  ccParts.push(`${pid(name)}/${activeCC.spellName}-${remaining}s${stunTag}${trinketTag}`);
}
```

Replace it with:

```typescript
const ccParts: string[] = [];
for (const { name } of allFriendlyPlayers) {
  const summary = summaryByName.get(name);

  // Hard CC (existing)
  const activeCC = summary?.ccInstances.find(
    (cc) => cc.atSeconds <= timeSeconds && timeSeconds < cc.atSeconds + cc.durationSeconds,
  );
  if (activeCC) {
    const remaining = Math.round(activeCC.atSeconds + activeCC.durationSeconds - timeSeconds);
    const isStun = activeCC.drInfo?.category === 'Stun';
    const stunTag = isStun ? '[stun]' : '';
    const trinketUsedNow = summary?.trinketUseTimes.some((t) => Math.abs(t - timeSeconds) <= 1) ?? false;
    const trinketTag = isStun && trinketUsedNow ? '[trinketed]' : '';
    ccParts.push(`${pid(name)}/${activeCC.spellName}-${remaining}s${stunTag}${trinketTag}`);
  }

  // Root
  const activeRoot = summary?.rootInstances?.find(
    (r) => r.atSeconds <= timeSeconds && timeSeconds < r.atSeconds + r.durationSeconds,
  );
  if (activeRoot) {
    const remaining = Math.round(activeRoot.atSeconds + activeRoot.durationSeconds - timeSeconds);
    ccParts.push(`${pid(name)}/${activeRoot.spellName}-${remaining}s[root]`);
  }

  // Disarm
  const activeDisarm = summary?.disarmInstances?.find(
    (d) => d.atSeconds <= timeSeconds && timeSeconds < d.atSeconds + d.durationSeconds,
  );
  if (activeDisarm) {
    const remaining = Math.round(activeDisarm.atSeconds + activeDisarm.durationSeconds - timeSeconds);
    ccParts.push(`${pid(name)}/${activeDisarm.spellName}-${remaining}s[disarm]`);
  }

  // Kick lockout
  const activeKick = summary?.interruptInstances?.find(
    (k) => k.atSeconds <= timeSeconds && timeSeconds < k.atSeconds + k.lockoutDurationSeconds,
  );
  if (activeKick) {
    const remaining = Math.round(activeKick.atSeconds + activeKick.lockoutDurationSeconds - timeSeconds);
    ccParts.push(`${pid(name)}/${activeKick.kickSpellName}-${remaining}s[kick]`);
  }
}
```

- [ ] **Step 4: Update buildJsonSituationSnapshot in utils.ts**

Locate the JSON cc loop (around line 1427–1442). The current `ccList` item type is:

```typescript
const ccList: Array<{ player: string; spell: string; remaining_s: number; stun?: true; trinketed?: true }> = [];
```

Change the type and extend the loop:

```typescript
const ccList: Array<{
  player: string;
  spell: string;
  remaining_s: number;
  stun?: true;
  trinketed?: true;
  root?: true;
  disarm?: true;
  kick?: true;
}> = [];

for (const { name } of allFriendlyPlayers) {
  const summary = summaryByName.get(name);

  // Hard CC (existing)
  const activeCC = summary?.ccInstances.find(
    (cc) => cc.atSeconds <= timeSeconds && timeSeconds < cc.atSeconds + cc.durationSeconds,
  );
  if (activeCC) {
    const remaining = Math.round(activeCC.atSeconds + activeCC.durationSeconds - timeSeconds);
    const isStun = activeCC.drInfo?.category === 'Stun';
    const trinketUsedNow = summary?.trinketUseTimes.some((t) => Math.abs(t - timeSeconds) <= 1) ?? false;
    const entry: (typeof ccList)[number] = { player: pid(name), spell: activeCC.spellName, remaining_s: remaining };
    if (isStun) entry.stun = true;
    if (isStun && trinketUsedNow) entry.trinketed = true;
    ccList.push(entry);
  }

  // Root
  const activeRoot = summary?.rootInstances?.find(
    (r) => r.atSeconds <= timeSeconds && timeSeconds < r.atSeconds + r.durationSeconds,
  );
  if (activeRoot) {
    const remaining = Math.round(activeRoot.atSeconds + activeRoot.durationSeconds - timeSeconds);
    ccList.push({ player: pid(name), spell: activeRoot.spellName, remaining_s: remaining, root: true });
  }

  // Disarm
  const activeDisarm = summary?.disarmInstances?.find(
    (d) => d.atSeconds <= timeSeconds && timeSeconds < d.atSeconds + d.durationSeconds,
  );
  if (activeDisarm) {
    const remaining = Math.round(activeDisarm.atSeconds + activeDisarm.durationSeconds - timeSeconds);
    ccList.push({ player: pid(name), spell: activeDisarm.spellName, remaining_s: remaining, disarm: true });
  }

  // Kick lockout
  const activeKick = summary?.interruptInstances?.find(
    (k) => k.atSeconds <= timeSeconds && timeSeconds < k.atSeconds + k.lockoutDurationSeconds,
  );
  if (activeKick) {
    const remaining = Math.round(activeKick.atSeconds + activeKick.lockoutDurationSeconds - timeSeconds);
    ccList.push({ player: pid(name), spell: activeKick.kickSpellName, remaining_s: remaining, kick: true });
  }
}
```

Also update the `healerInCC` check below (around line 1444) to account for healer being rooted or disarmed — though roots and disarms don't prevent healing in WoW, keep `healerInCC` scoped to hard CC only (no change needed there).

- [ ] **Step 5: Run the new timeline tests**

```bash
cd packages/shared && npx tsdx test --testPathPattern="timeline" --no-coverage 2>&1 | grep -E "PASS|FAIL|✓|✕|●" | head -40
```

Expected: PASS on the 5 new tests and all previously passing tests.

- [ ] **Step 6: Run the full test suite**

```bash
cd packages/shared && npx tsdx test --no-coverage 2>&1 | tail -15
```

Expected: All tests pass.

- [ ] **Step 7: TypeScript check**

```bash
cd packages/shared && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 8: Lint**

```bash
npm run lint -- --max-warnings 0 2>&1 | tail -10
```

Expected: No warnings or errors.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "feat(CombatAIAnalysis): surface roots, disarms, and kick lockouts in [RES] cc: line (F74)"
```

---

## Self-Review

### Spec coverage

| F74 requirement                                         | Covered                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| Roots tracked as aura events                            | ✅ Task 2 (rootInstances via SPELL_AURA_APPLIED/REMOVED)         |
| Disarms tracked as aura events                          | ✅ Task 2 (disarmInstances) + Task 1 (disarm IDs in spells.json) |
| Kicks tracked as cast events (not aura)                 | ✅ Task 2 (interruptInstances via SPELL_INTERRUPT in actionIn)   |
| Surface in cc: line alongside existing Stun/Silence/etc | ✅ Task 3 (buildResourceSnapshot)                                |
| JSON format parity (buildJsonSituationSnapshot)         | ✅ Task 3                                                        |

### Placeholder scan

No TBDs. All code blocks are complete.

### Type consistency

- `IRootInstance` defined in Task 2, used for both `rootInstances` and `disarmInstances` arrays.
- `IInterruptInstance` defined in Task 2, used for `interruptInstances`.
- Field names consistent: `rootInstances`, `disarmInstances`, `interruptInstances` across Tasks 2 and 3.
- `summary?.rootInstances?.find(...)` uses optional chaining throughout Task 3 to remain safe if the summary came from an older code path.

### Known limitation

The 3 disarm spell IDs in `spells.json` are the only PvP-relevant disarms in the current `spellClassMap.json` dataset. This list may need updating each season — the same maintenance process as trinket IDs and DR categories. No action needed now.

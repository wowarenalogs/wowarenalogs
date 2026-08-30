# F72: [RESOURCES] Token Compression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the verbose 3-line `[RESOURCES]` block with a compact single-line `[RES]` line after every `[OWNER CD]` and `[TEAMMATE CD]` event, achieving ~70% token reduction with no loss of reasoning quality.

**Architecture:** Rewrite `buildResourceSnapshot` in `CombatAIAnalysis/utils.ts` to return a single `string` instead of `string[]`. Empty sub-fields (`enemy:`, `cc:`) are omitted entirely — absence is meaningful and documented in the system prompt so Claude can infer "no burst" / "all players free" from absence. All data values are preserved.

**Tech Stack:** TypeScript, Jest (run via `npm run test -w @wowarenalogs/shared`)

---

## File Map

| File                                                                                      | Change                                                                                                         |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`                   | Rewrite `buildResourceSnapshot` (L1259–1363), update inner wrapper (L1468), update 2 call sites (L1533, L1630) |
| `packages/shared/src/prompts/analyzeSystemPrompts.ts`                                     | Update 4 references to `[RESOURCES]` / `[CAST-LOCKED]` (L64, L71, L76, L77, L84)                               |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` | Add new `buildResourceSnapshot` describe block; fix 1 existing `[RESOURCES]` test                              |

---

### Task 1: Write failing unit tests for the new `[RES]` format

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Add the import for `buildResourceSnapshot` to the test file's existing import block**

At the top of the file, the existing import from `../utils` currently reads:

```typescript
import {
  buildMatchTimeline,
  BuildMatchTimelineParams,
  buildPlayerLoadout,
  computeHealingInWindow,
  extractEnemyMajorBuffIntervals,
  extractOwnerCDBuffExpiry,
  HEALING_AMPLIFIER_SPELL_IDS,
} from '../utils';
```

Add `buildResourceSnapshot` to that import:

```typescript
import {
  buildMatchTimeline,
  BuildMatchTimelineParams,
  buildPlayerLoadout,
  buildResourceSnapshot,
  computeHealingInWindow,
  extractEnemyMajorBuffIntervals,
  extractOwnerCDBuffExpiry,
  HEALING_AMPLIFIER_SPELL_IDS,
} from '../utils';
```

Also add the `IPlayerCCTrinketSummary` import — it's already imported at line 11:

```typescript
import { ICCInstance, IPlayerCCTrinketSummary } from '../../../../utils/ccTrinketAnalysis';
```

No change needed there.

- [ ] **Step 2: Append the new test block to the end of `timeline.test.ts`**

```typescript
// ── buildResourceSnapshot — F72 compact format ────────────────────────────────

describe('buildResourceSnapshot — F72 compact [RES] format', () => {
  const BASE_ENEMY_TIMELINE = makeEnemyTimeline();

  function makeCC(spellName: string, atSeconds: number, durationSeconds: number, category: string): ICCInstance {
    return {
      atSeconds,
      durationSeconds,
      spellId: '0',
      spellName,
      sourceName: 'enemy',
      sourceSpec: 'Unknown',
      damageTakenDuring: 0,
      trinketState: 'available_unused',
      drInfo: { category, level: 0, sequenceIndex: 0 },
      distanceYards: null,
      losBlocked: null,
    };
  }

  function makeSummary(
    playerName: string,
    ccInstances: ICCInstance[] = [],
    trinketUseTimes: number[] = [],
  ): IPlayerCCTrinketSummary {
    return {
      playerName,
      playerSpec: 'Holy Paladin',
      trinketType: 'Gladiator',
      trinketCooldownSeconds: 90,
      ccInstances,
      trinketUseTimes,
      missedTrinketWindows: [],
    };
  }

  it('calm state: emits rdy and cd only, no enemy or cc fields', () => {
    const avWr = { ...makeCD('Avenging Wrath', 120), casts: [] };
    const ps = {
      ...makeCD('Pain Suppression', 120),
      casts: [{ timeSeconds: 5 }],
    };
    const result = buildResourceSnapshot({
      timeSeconds: 30,
      ownerCDs: [avWr, ps],
      ownerName: 'Player1',
      ownerSpec: 'Holy Paladin',
      teammateCDs: [],
      ccTrinketSummaries: [],
      enemyCDTimeline: BASE_ENEMY_TIMELINE,
    });
    expect(result).toMatch(/^\s*\[RES\] rdy:/);
    expect(result).toContain('rdy:Avenging Wrath');
    expect(result).toContain('cd:Pain Suppression(');
    expect(result).not.toContain('enemy:');
    expect(result).not.toContain('cc:');
  });

  it('enemy burst: includes enemy field with seconds-since-cast', () => {
    const result = buildResourceSnapshot({
      timeSeconds: 20,
      ownerCDs: [],
      ownerName: 'Player1',
      ownerSpec: 'Holy Paladin',
      teammateCDs: [],
      ccTrinketSummaries: [],
      enemyCDTimeline: makeEnemyTimeline([
        {
          specName: 'Outlaw Rogue',
          offensiveCDs: [{ spellName: 'Adrenaline Rush', castTimeSeconds: 12 }],
        },
      ]),
    });
    expect(result).toContain('enemy:Adrenaline Rush/Outlaw Rogue(8s)');
    expect(result).not.toContain('cc:');
  });

  it('enemy CD older than 30s is omitted from enemy field', () => {
    const result = buildResourceSnapshot({
      timeSeconds: 60,
      ownerCDs: [],
      ownerName: 'Player1',
      ownerSpec: 'Holy Paladin',
      teammateCDs: [],
      ccTrinketSummaries: [],
      enemyCDTimeline: makeEnemyTimeline([
        {
          specName: 'Outlaw Rogue',
          offensiveCDs: [{ spellName: 'Adrenaline Rush', castTimeSeconds: 20 }],
        },
      ]),
    });
    expect(result).not.toContain('enemy:');
  });

  it('CC present: includes cc field, omits free players', () => {
    const cc = makeCC('Psychic Scream', 27, 8, 'Fear');
    const result = buildResourceSnapshot({
      timeSeconds: 30,
      ownerCDs: [],
      ownerName: 'Player1',
      ownerSpec: 'Holy Paladin',
      teammateCDs: [],
      ccTrinketSummaries: [makeSummary('Player1', [cc])],
      enemyCDTimeline: BASE_ENEMY_TIMELINE,
    });
    expect(result).toContain('cc:Player1/Psychic Scream-5s');
    expect(result).not.toContain('[stun]');
    expect(result).not.toContain('[trinketed]');
  });

  it('physical stun appends [stun] tag', () => {
    const cc = makeCC('Kidney Shot', 27, 8, 'Stun');
    const result = buildResourceSnapshot({
      timeSeconds: 30,
      ownerCDs: [],
      ownerName: 'Player1',
      ownerSpec: 'Holy Paladin',
      teammateCDs: [],
      ccTrinketSummaries: [makeSummary('Player1', [cc])],
      enemyCDTimeline: BASE_ENEMY_TIMELINE,
    });
    expect(result).toContain('cc:Player1/Kidney Shot-5s[stun]');
  });

  it('stun + trinket at same second appends [trinketed] tag', () => {
    const cc = makeCC('Kidney Shot', 27, 8, 'Stun');
    const result = buildResourceSnapshot({
      timeSeconds: 30,
      ownerCDs: [],
      ownerName: 'Player1',
      ownerSpec: 'Holy Paladin',
      teammateCDs: [],
      ccTrinketSummaries: [makeSummary('Player1', [cc], [30])],
      enemyCDTimeline: BASE_ENEMY_TIMELINE,
    });
    expect(result).toContain('[stun][trinketed]');
  });

  it('non-stun CC does not get [trinketed] even with trinket use at same time', () => {
    const cc = makeCC('Psychic Scream', 27, 8, 'Fear');
    const result = buildResourceSnapshot({
      timeSeconds: 30,
      ownerCDs: [],
      ownerName: 'Player1',
      ownerSpec: 'Holy Paladin',
      teammateCDs: [],
      ccTrinketSummaries: [makeSummary('Player1', [cc], [30])],
      enemyCDTimeline: BASE_ENEMY_TIMELINE,
    });
    expect(result).not.toContain('[trinketed]');
  });

  it('all players free: cc field absent entirely', () => {
    const result = buildResourceSnapshot({
      timeSeconds: 30,
      ownerCDs: [],
      ownerName: 'Player1',
      ownerSpec: 'Holy Paladin',
      teammateCDs: [],
      ccTrinketSummaries: [makeSummary('Player1', [])],
      enemyCDTimeline: BASE_ENEMY_TIMELINE,
    });
    expect(result).not.toContain('cc:');
  });

  it('playerIdMap compresses names to numeric IDs in cc field', () => {
    const cc = makeCC('Kidney Shot', 27, 8, 'Stun');
    const playerIdMap = new Map([['Player1', 1]]);
    const result = buildResourceSnapshot({
      timeSeconds: 30,
      ownerCDs: [],
      ownerName: 'Player1',
      ownerSpec: 'Holy Paladin',
      teammateCDs: [],
      ccTrinketSummaries: [makeSummary('Player1', [cc])],
      enemyCDTimeline: BASE_ENEMY_TIMELINE,
      playerIdMap,
    });
    expect(result).toContain('cc:1/Kidney Shot-5s[stun]');
    expect(result).not.toContain('Player1');
  });
});
```

- [ ] **Step 3: Run the new tests and confirm they all FAIL**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern="timeline.test" --testNamePattern="F72 compact"
```

Expected: All 8 new tests FAIL (function still returns `string[]` with old format).

---

### Task 2: Rewrite `buildResourceSnapshot`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts:1246-1363`

- [ ] **Step 1: Replace the full `buildResourceSnapshot` implementation**

Find the block from line 1246 (`// ── buildResourceSnapshot`) through line 1363 (`return [friendlyLine, enemyLine, ccLine];`) and replace it entirely:

```typescript
// ── buildResourceSnapshot ──────────────────────────────────────────────────

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

export function buildResourceSnapshot({
  timeSeconds,
  ownerCDs,
  ownerName,
  ownerSpec,
  teammateCDs,
  ccTrinketSummaries,
  enemyCDTimeline,
  playerIdMap,
}: ResourceSnapshotParams): string {
  function pid(name: string): string {
    if (!playerIdMap) return name;
    const id = playerIdMap.get(name);
    return id !== undefined ? String(id) : name;
  }

  // ── rdy / cd ───────────────────────────────────────────────────────────────
  const readyNames: string[] = [];
  const onCDParts: string[] = [];

  const allFriendlyCDs: Array<{ spellName: string; cd: IMajorCooldownInfo }> = [
    ...ownerCDs.map((cd) => ({ spellName: cd.spellName, cd })),
    ...teammateCDs.flatMap(({ cds }) => cds.map((cd) => ({ spellName: cd.spellName, cd }))),
  ];

  for (const { spellName, cd } of allFriendlyCDs) {
    const priorCasts = cd.casts.filter((c) => c.timeSeconds < timeSeconds - 0.5);

    if (priorCasts.length === 0) {
      if (timeSeconds > 5) readyNames.push(spellName);
      continue;
    }

    const charges = cd.maxChargesDetected > 1 ? cd.maxChargesDetected : 1;
    const relevantCasts = priorCasts.slice(-charges);
    const earliestSlotReady = relevantCasts[0].timeSeconds + cd.cooldownSeconds;

    if (earliestSlotReady <= timeSeconds + 0.5) {
      readyNames.push(spellName);
    } else {
      const remaining = Math.round(earliestSlotReady - timeSeconds);
      onCDParts.push(`${spellName}(${remaining}s)`);
    }
  }

  let line =
    `      [RES] rdy:${readyNames.length > 0 ? readyNames.join(',') : '—'}` +
    `  cd:${onCDParts.length > 0 ? onCDParts.join(',') : '—'}`;

  // ── enemy: (omit when empty) ───────────────────────────────────────────────
  const enemyActiveParts: string[] = [];
  for (const player of enemyCDTimeline.players) {
    for (const cd of player.offensiveCDs) {
      const agoSeconds = timeSeconds - cd.castTimeSeconds;
      if (agoSeconds >= 0 && agoSeconds <= 30) {
        enemyActiveParts.push(`${cd.spellName}/${player.specName}(${Math.round(agoSeconds)}s)`);
      }
    }
  }
  if (enemyActiveParts.length > 0) {
    line += `  enemy:${enemyActiveParts.join(',')}`;
  }

  // ── cc: (omit when empty) ──────────────────────────────────────────────────
  const summaryByName = new Map(ccTrinketSummaries.map((s) => [s.playerName, s]));

  const allFriendlyPlayers: Array<{ name: string }> = [
    { name: ownerName },
    ...teammateCDs.map(({ player }) => ({ name: player.name })),
  ];

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

  if (ccParts.length > 0) {
    line += `  cc:${ccParts.join(',')}`;
  }

  return line;
}
```

- [ ] **Step 2: Run the new tests and confirm they all PASS**

```bash
npm run test -w @wowarenalogs/shared -- --testPathPattern="timeline.test" --testNamePattern="F72 compact"
```

Expected: All 8 tests PASS.

- [ ] **Step 3: Run the full test suite and note the TypeScript / other failures**

```bash
npm run test -w @wowarenalogs/shared
```

Expected: Some tests will FAIL because `buildMatchTimeline` still uses the old `string[]` call sites. Note the failures and proceed to Task 3.

---

### Task 3: Update `buildMatchTimeline` call sites

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts:1468-1480, 1533, 1630`

- [ ] **Step 1: Update the inner `resourceSnapshot` wrapper function (line ~1468)**

Find:

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
function resourceSnapshot(timeSeconds: number): string {
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

- [ ] **Step 2: Update the `[OWNER CD]` call site (line ~1533)**

Find:

```typescript
const extraLines: string[] = [...resourceSnapshot(cast.timeSeconds)];
```

Replace with:

```typescript
const extraLines: string[] = [resourceSnapshot(cast.timeSeconds)];
```

- [ ] **Step 3: Update the `[TEAMMATE CD]` call site (line ~1630)**

Find:

```typescript
          ...resourceSnapshot(cast.timeSeconds),
```

Replace with:

```typescript
          resourceSnapshot(cast.timeSeconds),
```

- [ ] **Step 4: Run the full test suite and confirm it compiles and passes (except for the one existing snapshot test)**

```bash
npm run test -w @wowarenalogs/shared
```

Expected: All tests pass except the existing `does NOT repeat buff info on every [RESOURCES] snapshot during the buff window` test, which will fail because it still checks for `[RESOURCES]`. Note that failure and move to Task 4.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "feat(F72): rewrite buildResourceSnapshot — 3-line [RESOURCES] → single-line [RES]"
```

---

### Task 4: Fix the existing `[RESOURCES]` snapshot test

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts:1675`

- [ ] **Step 1: Update the test description and assertions**

Find the test at line ~1675:

```typescript
  it('does NOT repeat buff info on every [RESOURCES] snapshot during the buff window', () => {
```

The test currently checks that `[RESOURCES]` doesn't appear in output. After the rewrite, the format is `[RES]`, not `[RESOURCES]`. Update the test name and assertions to match the new format:

```typescript
it('does NOT repeat buff info on every [RES] snapshot during the buff window', () => {
  const matchStartMs = 1_000_000;
  const matchEndMs = matchStartMs + 60_000;

  const enemy = makeUnit('enemy-1', {
    name: 'Dzinked',
    reaction: CombatUnitReaction.Hostile,
    auraEvents: [
      makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '10060', matchStartMs + 5_000, 'healer-1', 'enemy-1'),
      makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '10060', matchStartMs + 55_000, 'healer-1', 'enemy-1'),
    ],
  });

  const ownerCDs: IMajorCooldownInfo[] = [
    {
      spellId: '31884',
      spellName: 'Avenging Wrath',
      tag: 'Offensive',
      cooldownSeconds: 120,
      maxChargesDetected: 1,
      casts: [{ timeSeconds: 10 }],
      availableWindows: [],
      neverUsed: false,
    },
    {
      spellId: '6940',
      spellName: 'Blessing of Sacrifice',
      tag: 'Defensive',
      cooldownSeconds: 120,
      maxChargesDetected: 1,
      casts: [{ timeSeconds: 20 }],
      availableWindows: [],
      neverUsed: false,
    },
  ];

  const result = buildMatchTimeline(
    makeBaseParams({
      enemies: [enemy],
      ownerCDs,
      matchStartMs,
      matchEndMs,
    }),
  );

  const buffCount = (result.match(/\[ENEMY BUFF\]/g) ?? []).length;
  const buffEndCount = (result.match(/\[ENEMY BUFF END\]/g) ?? []).length;
  expect(buffCount).toBe(1);
  expect(buffEndCount).toBe(1);
  expect(result).not.toContain('[ENEMY BUFFS]');
  expect(result).not.toContain('[RESOURCES]');
  expect(result).toContain('[RES]');
});
```

- [ ] **Step 2: Run the full test suite and confirm all tests pass**

```bash
npm run test -w @wowarenalogs/shared
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "test(F72): update [RESOURCES] snapshot test to new [RES] format"
```

---

### Task 5: Update system prompt

**Files:**

- Modify: `packages/shared/src/prompts/analyzeSystemPrompts.ts:64,71,76,77,84`

- [ ] **Step 1: Replace the `[RESOURCES]` block definition at line 64**

Find:

```
You are given a PLAYER LOADOUT (all major CDs available this match) and a MATCH TIMELINE (raw chronological events). Each [OWNER CD] and [TEAMMATE CD] event is followed by a [RESOURCES] block showing ground-truth state at that exact moment: which friendly CDs were ready or on cooldown, which enemy offensive CDs were recently active, and the CC state of every friendly player.
```

Replace with:

```
You are given a PLAYER LOADOUT (all major CDs available this match) and a MATCH TIMELINE (raw chronological events). Each [OWNER CD] and [TEAMMATE CD] event is followed by a [RES] line showing ground-truth state at that exact moment. Fields: rdy = friendly CDs ready now; cd = friendly CDs on cooldown with seconds remaining; enemy = enemy offensive CDs cast in the last 30s with seconds since cast (field absent = none active); cc = friendly players currently CC'd with seconds remaining (field absent = all players free). A [stun] tag means the player is cast-locked; [trinketed] means they used their PvP trinket at this exact moment.
```

- [ ] **Step 2: Update the Trade Equity reference at line 71**

Find:

```
Cross-reference the [RESOURCES] enemy active line at the moment of the CD use.
```

Replace with:

```
Cross-reference the [RES] enemy field at the moment of the CD use.
```

- [ ] **Step 3: Update the Overlap Attribution reference at line 76**

Find:

```
If two or more friendly major CDs appear within 3s in the timeline, determine Primary (the CD that was correct to use) and Secondary (the redundant one), using the [RESOURCES] CC state:
```

Replace with:

```
If two or more friendly major CDs appear within 3s in the timeline, determine Primary (the CD that was correct to use) and Secondary (the redundant one), using the [RES] cc field:
```

- [ ] **Step 4: Update the `[CAST-LOCKED]` reference at line 77**

Find:

```
- Healer is [CAST-LOCKED] (physical stun — cannot cast): the DPS defensive is Primary (correct). Any healer defensive appearing in the same window required Trinket use to break the stun — flag as potential Total Tactical Disaster: trinket burned on an already-covered window.
```

Replace with:

```
- Healer cc entry has [stun] (cast-locked by physical stun): the DPS defensive is Primary (correct). Any healer defensive appearing in the same window required Trinket use to break the stun — check for [trinketed] on the cc entry — flag as potential Total Tactical Disaster: trinket burned on an already-covered window.
```

- [ ] **Step 5: Update the Counterfactual Path reference at line 84**

Find:

```
- Use HP trajectory and CC state from [RESOURCES] to estimate whether small tools (Ignore Pain, shields, passive healing, positioning) could have bridged the 4–6s gap.
```

Replace with:

```
- Use HP trajectory and cc field from [RES] to estimate whether small tools (Ignore Pain, shields, passive healing, positioning) could have bridged the 4–6s gap.
```

- [ ] **Step 6: Run lint to confirm no issues**

```bash
npm run lint -w @wowarenalogs/shared
```

Expected: `No ESLint warnings or errors`

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/prompts/analyzeSystemPrompts.ts
git commit -m "docs(F72): update system prompt — [RESOURCES] → [RES], [CAST-LOCKED] → [stun]"
```

---

## Self-Review

**Spec coverage:**

- ✅ Single-line `[RES]` format replacing 3-line `[RESOURCES]` — Task 2
- ✅ `rdy:` and `cd:` always present — Task 2 implementation
- ✅ `enemy:` omitted when empty — Task 2 implementation + Task 1 tests
- ✅ `cc:` omitted when empty — Task 2 implementation + Task 1 tests
- ✅ `[stun]` tag for cast-locked — Task 2 implementation + Task 1 tests
- ✅ `[trinketed]` tag preserved — Task 2 implementation + Task 1 tests
- ✅ Inner `resourceSnapshot` wrapper return type updated — Task 3 Step 1
- ✅ Both `addEntry` call sites updated — Task 3 Steps 2–3
- ✅ System prompt updated with format definition + absence semantics — Task 5
- ✅ `[CAST-LOCKED]` reference updated to `[stun]` — Task 5 Step 4
- ✅ Existing broken `[RESOURCES]` test fixed — Task 4

**Type consistency:** `buildResourceSnapshot` returns `string` in Tasks 2, 3, and the test imports in Task 1 all consistent.

**No placeholders:** All steps contain exact code or exact commands with expected output.

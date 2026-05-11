# F88 [CC ON TEAM] Trinket Noise Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suppress the `trinket: available, not used` annotation on every `[CC ON TEAM]` event (it's noise), and instead only annotate when trinket was on CD — `trinket: ON CD (Xs left)` — so Claude can see when the player had no option to escape.

**Architecture:** `ICCInstance.trinketState` currently holds `'used' | 'available_unused' | 'on_cooldown' | 'passive_trinket'` but lacks the seconds remaining when on cooldown. Add `trinketCDSecondsLeft?: number` to `ICCInstance` and compute it in `analyzePlayerCCAndTrinket`. Then update `buildMatchTimeline` in `utils.ts` to suppress `available_unused` / `passive_trinket` annotations and emit `| trinket: ON CD (Xs left)` only for `on_cooldown`.

**Tech Stack:** TypeScript, Jest (via `npx tsdx test`), `packages/shared/src/utils/ccTrinketAnalysis.ts`, `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

---

## Background

Current `[CC ON TEAM]` output (every CC event, regardless of trinket state):

```
0:37  [CC ON TEAM]   1 ← Hammer of Justice (Dzinked) | 4s | trinket: available, not used
0:52  [CC ON TEAM]   1 ← Polymorph (Mage) | 6s | trinket: on cooldown
1:10  [CC ON TEAM]   1 ← Kidney Shot (Rogue) | 5s | trinket: used
```

After F88:

```
0:37  [CC ON TEAM]   1 ← Hammer of Justice (Dzinked) | 4s
0:52  [CC ON TEAM]   1 ← Polymorph (Mage) | 6s | trinket: ON CD (38s left)
1:10  [CC ON TEAM]   1 ← Kidney Shot (Rogue) | 5s | trinket: used
```

`available_unused` is the expected default — the player should use their trinket. Annotating it on every event dominates the prompt with noise. `passive_trinket` (Relentless) players never have an active trinket, so there's nothing actionable. `on_cooldown` is the only case that needs annotation because it explains WHY the player couldn't escape.

---

## File Map

| File                                                                                      | Change                                                                                                      |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/utils/ccTrinketAnalysis.ts`                                          | Add `trinketCDSecondsLeft?: number` to `ICCInstance`; compute it in `analyzePlayerCCAndTrinket`             |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`                   | Change `trinketNote` logic: suppress `available_unused`/`passive_trinket`, enhance `on_cooldown`            |
| `packages/shared/src/utils/__tests__/ccTrinketAnalysis.test.ts`                           | Add test: `trinketCDSecondsLeft` is computed correctly                                                      |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts` | Update `available_unused` test; add `on_cooldown` with seconds test; add `passive_trinket` suppression test |

---

## Task 1: Write Failing Tests

Write all new/updated tests first. They should fail until the implementation is in place.

**Files:**

- Modify: `packages/shared/src/utils/__tests__/ccTrinketAnalysis.test.ts`
- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`

- [ ] **Step 1: Add `trinketCDSecondsLeft` computation test in `ccTrinketAnalysis.test.ts`**

The file currently tests `detectTrinketType` and `analyzePlayerCCAndTrinket` (roots/disarms/interrupts). Append a new describe block at the end:

```ts
describe('analyzePlayerCCAndTrinket — trinketCDSecondsLeft', () => {
  const MATCH_START = 1_000_000;
  const MATCH_END = 1_300_000;

  // CC spell that is tracked: Hammer of Justice (853) is in ccSpellIds
  const HOJ_SPELL_ID = '853';

  function makeCombat() {
    return { startTime: MATCH_START, endTime: MATCH_END, startInfo: { zoneId: '1672' } };
  }

  function makeEnemy(id: string) {
    return makeUnit(id, {
      name: 'Enemy',
      reaction: CombatUnitReaction.Hostile,
      spec: CombatUnitSpec.Paladin_Retribution,
    });
  }

  it('sets trinketCDSecondsLeft when trinket is on cooldown', () => {
    // Gladiator Medallion (spell 336126) cast at T+10s. CD is 90s (healer).
    // CC lands at T+40s → trinket has been on CD for 30s → 60s left.
    const trinketCast = {
      logLine: { event: LogEvent.SPELL_CAST_SUCCESS, timestamp: MATCH_START + 10_000, parameters: [] },
      spellId: '336126',
      spellName: "Gladiator's Medallion",
      srcUnitId: 'player-1',
      srcUnitName: 'Player',
      destUnitId: 'player-1',
      destUnitName: 'Player',
      effectiveAmount: 0,
      advancedActorMaxHp: 0,
      advancedActorCurrentHp: 0,
      advancedActorPositionX: 0,
      advancedActorPositionY: 0,
    };
    const ccApply = makeAuraEvent(
      LogEvent.SPELL_AURA_APPLIED,
      HOJ_SPELL_ID,
      MATCH_START + 40_000,
      'enemy-1',
      'player-1',
    );
    const ccRemove = makeAuraEvent(
      LogEvent.SPELL_AURA_REMOVED,
      HOJ_SPELL_ID,
      MATCH_START + 44_000,
      'enemy-1',
      'player-1',
    );

    const player = makeUnit('player-1', {
      spec: CombatUnitSpec.Paladin_Holy, // healer → 90s CD
      info: { equipment: [{ id: '99999', ilvl: 450, enchants: [], bonuses: [], gems: [] }] } as any,
      spellCastEvents: [trinketCast] as any,
      auraEvents: [ccApply, ccRemove],
    });
    const enemy = makeEnemy('enemy-1');

    const result = analyzePlayerCCAndTrinket(player, [enemy], makeCombat());

    expect(result.ccInstances).toHaveLength(1);
    expect(result.ccInstances[0].trinketState).toBe('on_cooldown');
    expect(result.ccInstances[0].trinketCDSecondsLeft).toBe(60);
  });

  it('does not set trinketCDSecondsLeft when trinket is available_unused', () => {
    // No prior trinket cast → available
    const ccApply = makeAuraEvent(
      LogEvent.SPELL_AURA_APPLIED,
      HOJ_SPELL_ID,
      MATCH_START + 40_000,
      'enemy-1',
      'player-1',
    );
    const ccRemove = makeAuraEvent(
      LogEvent.SPELL_AURA_REMOVED,
      HOJ_SPELL_ID,
      MATCH_START + 44_000,
      'enemy-1',
      'player-1',
    );

    const player = makeUnit('player-1', {
      spec: CombatUnitSpec.Paladin_Holy,
      info: { equipment: [{ id: '99999', ilvl: 450, enchants: [], bonuses: [], gems: [] }] } as any,
      spellCastEvents: [],
      auraEvents: [ccApply, ccRemove],
    });
    const enemy = makeEnemy('enemy-1');

    const result = analyzePlayerCCAndTrinket(player, [enemy], makeCombat());

    expect(result.ccInstances[0].trinketState).toBe('available_unused');
    expect(result.ccInstances[0].trinketCDSecondsLeft).toBeUndefined();
  });
});
```

- [ ] **Step 2: Update the `available_unused` timeline test**

In `packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts`, find the test at line ~566:

```ts
  it('emits [CC ON TEAM] with trinket: available, not used when trinket was available', () => {
```

Replace the entire test with this updated version that expects NO trinket annotation:

```ts
it('emits [CC ON TEAM] with no trinket annotation when trinket was available (implicit default)', () => {
  const cc: ICCInstance = {
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
  };
  const result = buildMatchTimeline(
    makeBaseParams({
      ccTrinketSummaries: [{ ...makeEmptyCCTrinketSummary('Feramonk'), ccInstances: [cc] }],
    }),
  );
  expect(result).toContain('[CC ON TEAM]');
  expect(result).toContain('Feramonk ← Hammer of Justice (Dzinked)');
  expect(result).not.toContain('trinket:');
  expect(result).toContain('0:37');
});
```

- [ ] **Step 3: Add `on_cooldown` with seconds test in timeline**

After the `used` test (around line ~611), append:

```ts
it('emits [CC ON TEAM] with trinket: ON CD (Xs left) when trinket is on cooldown', () => {
  const cc: ICCInstance = {
    atSeconds: 52,
    durationSeconds: 6,
    spellId: '853',
    spellName: 'Hammer of Justice',
    sourceName: 'Dzinked',
    sourceSpec: 'Holy Paladin',
    damageTakenDuring: 80_000,
    trinketState: 'on_cooldown',
    trinketCDSecondsLeft: 38,
    drInfo: null,
    distanceYards: null,
    losBlocked: null,
  };
  const result = buildMatchTimeline(
    makeBaseParams({
      ccTrinketSummaries: [{ ...makeEmptyCCTrinketSummary('Feramonk'), ccInstances: [cc] }],
    }),
  );
  expect(result).toContain('trinket: ON CD (38s left)');
});

it('emits [CC ON TEAM] with trinket: ON CD (on CD) when trinketCDSecondsLeft is absent', () => {
  const cc: ICCInstance = {
    atSeconds: 52,
    durationSeconds: 6,
    spellId: '853',
    spellName: 'Hammer of Justice',
    sourceName: 'Dzinked',
    sourceSpec: 'Holy Paladin',
    damageTakenDuring: 80_000,
    trinketState: 'on_cooldown',
    // trinketCDSecondsLeft omitted
    drInfo: null,
    distanceYards: null,
    losBlocked: null,
  };
  const result = buildMatchTimeline(
    makeBaseParams({
      ccTrinketSummaries: [{ ...makeEmptyCCTrinketSummary('Feramonk'), ccInstances: [cc] }],
    }),
  );
  expect(result).toContain('trinket: ON CD (on CD)');
});

it('emits [CC ON TEAM] with no trinket annotation for passive_trinket (Relentless)', () => {
  const cc: ICCInstance = {
    atSeconds: 30,
    durationSeconds: 5,
    spellId: '853',
    spellName: 'Hammer of Justice',
    sourceName: 'Dzinked',
    sourceSpec: 'Holy Paladin',
    damageTakenDuring: 0,
    trinketState: 'passive_trinket',
    drInfo: null,
    distanceYards: null,
    losBlocked: null,
  };
  const result = buildMatchTimeline(
    makeBaseParams({
      ccTrinketSummaries: [{ ...makeEmptyCCTrinketSummary('Feramonk'), ccInstances: [cc] }],
    }),
  );
  expect(result).toContain('[CC ON TEAM]');
  expect(result).not.toContain('trinket:');
});
```

- [ ] **Step 4: Run tests and confirm failures**

```bash
cd /Users/mingjianliu/code/wowarenalogs/packages/shared && npx tsdx test --testPathPattern="ccTrinketAnalysis|timeline" --verbose 2>&1 | grep -E "FAIL|PASS|✓|✕|×" | tail -30
```

Expected: the 2 new ccTrinketAnalysis tests fail (no `trinketCDSecondsLeft` field yet), the updated `available_unused` timeline test fails (currently contains `trinket:` annotation), the 3 new timeline tests fail (wrong format). The `used` and `suppresses` tests still pass.

---

## Task 2: Add `trinketCDSecondsLeft` to `ICCInstance`

**Files:**

- Modify: `packages/shared/src/utils/ccTrinketAnalysis.ts`

- [ ] **Step 1: Add `trinketCDSecondsLeft` to `ICCInstance` interface**

Find `ICCInstance` interface (line ~44). It currently ends with `losBlocked`. Add the new optional field after `trinketState`:

```ts
export interface ICCInstance {
  atSeconds: number;
  durationSeconds: number;
  spellId: string;
  spellName: string;
  sourceName: string;
  sourceSpec: string;
  damageTakenDuring: number;
  trinketState: 'used' | 'available_unused' | 'on_cooldown' | 'passive_trinket';
  /** Seconds until trinket is ready again. Only populated when trinketState === 'on_cooldown'. */
  trinketCDSecondsLeft?: number;
  /** DR state at the time this CC was applied. null if spell not in DR category map. */
  drInfo: IDRInfo | null;
  distanceYards: number | null;
  losBlocked: boolean | null;
}
```

- [ ] **Step 2: Compute `trinketCDSecondsLeft` in `analyzePlayerCCAndTrinket`**

Find the block where `trinketState` is computed (around line 316). It currently reads:

```ts
let trinketState: ICCInstance['trinketState'];
if (trinketType === 'Relentless') {
  trinketState = 'passive_trinket';
} else if (trinketUsedInWindow) {
  trinketState = 'used';
} else if (isTrinketAvailable(trinketCastTimestamps, trinketCooldownMs, w.applyMs)) {
  trinketState = 'available_unused';
} else {
  trinketState = 'on_cooldown';
}
```

Change to:

```ts
let trinketState: ICCInstance['trinketState'];
let trinketCDSecondsLeft: number | undefined;
if (trinketType === 'Relentless') {
  trinketState = 'passive_trinket';
} else if (trinketUsedInWindow) {
  trinketState = 'used';
} else if (isTrinketAvailable(trinketCastTimestamps, trinketCooldownMs, w.applyMs)) {
  trinketState = 'available_unused';
} else {
  trinketState = 'on_cooldown';
  // Find last cast before applyMs to compute seconds remaining
  let lastCast = -Infinity;
  for (const ts of trinketCastTimestamps) {
    if (ts <= w.applyMs) lastCast = ts;
    else break;
  }
  if (lastCast !== -Infinity) {
    const remainingMs = trinketCooldownMs - (w.applyMs - lastCast);
    trinketCDSecondsLeft = Math.ceil(remainingMs / 1000);
  }
}
```

- [ ] **Step 3: Include `trinketCDSecondsLeft` in the return object**

Find the return object for the CCInstance (around line 342–353). It currently ends with:

```ts
return {
  atSeconds: (w.applyMs - matchStartMs) / 1000,
  durationSeconds: (w.removeMs - w.applyMs) / 1000,
  spellId: w.spellId,
  spellName: w.spellName,
  sourceName: w.srcName,
  sourceSpec: enemySpecMap.get(w.srcUnitId) ?? 'Unknown',
  damageTakenDuring,
  trinketState,
  distanceYards,
  losBlocked,
};
```

Change to:

```ts
return {
  atSeconds: (w.applyMs - matchStartMs) / 1000,
  durationSeconds: (w.removeMs - w.applyMs) / 1000,
  spellId: w.spellId,
  spellName: w.spellName,
  sourceName: w.srcName,
  sourceSpec: enemySpecMap.get(w.srcUnitId) ?? 'Unknown',
  damageTakenDuring,
  trinketState,
  trinketCDSecondsLeft,
  distanceYards,
  losBlocked,
};
```

---

## Task 3: Update `buildMatchTimeline` trinket annotation in `utils.ts`

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts`

- [ ] **Step 1: Replace the `trinketNote` computation**

Find the block (around line 1872):

```ts
const trinketNote =
  cc.trinketState === 'available_unused'
    ? ' | trinket: available, not used'
    : cc.trinketState === 'used'
      ? ' | trinket: used'
      : ' | trinket: on cooldown';
```

Replace with:

```ts
let trinketNote = '';
if (cc.trinketState === 'used') {
  trinketNote = ' | trinket: used';
} else if (cc.trinketState === 'on_cooldown') {
  const cdLeft = cc.trinketCDSecondsLeft !== undefined ? `${cc.trinketCDSecondsLeft}s left` : 'on CD';
  trinketNote = ` | trinket: ON CD (${cdLeft})`;
}
// available_unused → implicit default, no annotation
// passive_trinket → player has no active trinket, no annotation
```

---

## Task 4: Run Full Tests, Lint, and Commit

**Files:**

- No new files.

- [ ] **Step 1: Run the targeted test suites**

```bash
cd /Users/mingjianliu/code/wowarenalogs/packages/shared && npx tsdx test --testPathPattern="ccTrinketAnalysis|timeline" --verbose 2>&1 | tail -30
```

Expected: all tests pass — including the 2 new ccTrinketAnalysis tests and all 4 updated/new timeline tests.

- [ ] **Step 2: Run full test suite**

```bash
npm run test -w @wowarenalogs/shared 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 3: Run lint**

```bash
npm run lint -w @wowarenalogs/shared 2>&1 | tail -5
```

Expected: 0 warnings, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/utils/ccTrinketAnalysis.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/utils.ts \
        packages/shared/src/utils/__tests__/ccTrinketAnalysis.test.ts \
        packages/shared/src/components/CombatReport/CombatAIAnalysis/__tests__/timeline.test.ts
git commit -m "feat(timeline): suppress trinket-available noise on [CC ON TEAM], show CD time remaining (F88)"
```

---

## Self-Review

**Spec coverage:**

- ✅ `trinket: available, not used` suppressed — `available_unused` emits nothing
- ✅ `trinket: ON CD (Xs left)` emitted when on cooldown — `trinketCDSecondsLeft` computed and used
- ✅ `passive_trinket` suppressed — Relentless players don't need annotation
- ✅ `trinket: used` preserved — still meaningful signal

**Placeholder scan:** None found.

**Type consistency:** `trinketCDSecondsLeft` is optional (`number | undefined`), set only when `trinketState === 'on_cooldown'`. Used in utils.ts with a `!== undefined` guard. Consistent throughout.

**Out of scope:** Line 511 in utils.ts uses `cc.trinketState` directly in the death analysis narrative (`— trinket: ${cc.trinketState}`). This shows raw enum values like `available_unused` in the death block. That is a separate concern and not addressed here — F88 spec targets the `[CC ON TEAM]` line only.

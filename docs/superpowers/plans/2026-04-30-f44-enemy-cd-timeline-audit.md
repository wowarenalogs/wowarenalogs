# F44: Enemy CD Timeline Data Quality Audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify `reconstructEnemyCDTimeline` captures the real cast spell IDs for all major enemy offensive CDs; fix two confirmed gaps (Havoc DH Metamorphosis and Enhancement Shaman Feral Spirit); add a regression test suite that will break if future patch data drifts.

**Architecture:** Two confirmed bugs in `spells.json`: the tagged spell IDs for Havoc Meta (162264) and Feral Spirit (333957) have CD=999.999s in `spellEffects.json` and get filtered by `MAX_CD_SECONDS=360`. The correct player-cast IDs (191427 and 51533) have proper cooldowns (120s and 90s) in `spellEffects.json` but are absent from `spells.json`. Fixes are pure data changes. Duration tracking (`buffEndSeconds`) is already implemented but `durationSeconds` is 0 for both new entries — needs to be patched to 15s each. A new test file asserts data integrity and exercises `reconstructEnemyCDTimeline` end-to-end with mock combats.

**Tech Stack:** TypeScript, Jest, existing `testHelpers.ts` factory, `spells.json`, `spellEffects.json`, `spellDanger.ts`, `enemyCDs.ts`

---

## File Map

| Action | File                                                   | Responsibility                                                              |
| ------ | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| Modify | `packages/shared/src/data/spells.json`                 | Add 191427, 51533 as `buffs_offensive`; remove stale 162264, 333957 entries |
| Modify | `packages/shared/src/data/spellEffects.json`           | Set `durationSeconds: 15` for 191427 and 51533                              |
| Create | `packages/shared/src/utils/__tests__/enemyCDs.test.ts` | Coverage audit + `reconstructEnemyCDTimeline` integration tests             |

---

## Background: What the code does

`reconstructEnemyCDTimeline` in `packages/shared/src/utils/enemyCDs.ts`:

1. For each enemy unit, iterates `spellCastEvents` where `event === SPELL_CAST_SUCCESS`
2. Calls `isOffensiveSpell(spellId)` — returns true only when `spells.json` has type `buffs_offensive` or `debuffs_offensive`
3. Looks up `spellEffects.json` for `cooldownSeconds` (or `charges.chargeCooldownSeconds`)
4. Filters: `cooldownSeconds < 30` or `cooldownSeconds > 360` → skipped
5. Records `buffEndSeconds = castTimeSeconds + (durationSeconds ?? 0)` — if `durationSeconds === 0`, buff end equals cast time (no active window)

**Confirmed gaps:**

- Havoc Meta cast fires with spell ID `191427` (not 162264). `spellEffects` has 191427 at CD=120s/dur=0s; it's not in `spells.json` at all.
- Feral Spirit cast fires with spell ID `51533` (not 333957). `spellEffects` has 51533 at CD=90s/dur=0s; it's not in `spells.json` at all.
- `162264` and `333957` are the proc-buff aura IDs — they appear as SPELL_AURA_APPLIED events, not SPELL_CAST_SUCCESS, so they never enter the pipeline anyway.

**Duration tracking (F44 point 3):** Already implemented. `buffEndSeconds` computes the active window end. The only remaining work is setting correct `durationSeconds` in `spellEffects.json` for the new entries (Havoc Meta ≈ 15s, Feral Spirit ≈ 15s in arena).

---

## Task 1: Write failing tests

**Files:**

- Create: `packages/shared/src/utils/__tests__/enemyCDs.test.ts`

- [ ] **Step 1.1: Write the test file**

```typescript
import { CombatUnitReaction, CombatUnitSpec, LogEvent } from '@wowarenalogs/parser';

import { spellEffectData } from '../../data/spellEffectData';
import { isOffensiveSpell } from '../spellDanger';
import { reconstructEnemyCDTimeline } from '../enemyCDs';
import { makeCombat, makeSpellCastEvent, makeUnit } from './testHelpers';

// ─── Static data integrity ────────────────────────────────────────────────────

describe('offensive spell registry - confirmed cast IDs must be present', () => {
  it('includes Havoc DH Metamorphosis cast ID (191427) as offensive', () => {
    expect(isOffensiveSpell('191427')).toBe(true);
  });

  it('includes Enhancement Shaman Feral Spirit cast ID (51533) as offensive', () => {
    expect(isOffensiveSpell('51533')).toBe(true);
  });

  // Regression: these are aura/buff proc IDs, not cast IDs — they should NOT
  // be the primary offensive entry because they never fire as SPELL_CAST_SUCCESS
  it('does not exclusively rely on stale Metamorphosis proc ID (162264)', () => {
    // 162264 has cooldownSeconds=999.999 in spellEffects → always filtered.
    // Keeping this test ensures we never add it back as the sole DH meta entry.
    const cd = spellEffectData['162264']?.cooldownSeconds ?? 0;
    expect(cd).toBeGreaterThan(360); // confirms it is unusable as a tracked CD
  });
});

describe('spellEffects data for new entries', () => {
  it('Havoc Meta (191427) has cooldown 120s', () => {
    expect(spellEffectData['191427']?.cooldownSeconds).toBe(120);
  });

  it('Havoc Meta (191427) has durationSeconds >= 1 (needed for buffEndSeconds)', () => {
    expect(spellEffectData['191427']?.durationSeconds ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('Feral Spirit (51533) has cooldown 90s', () => {
    expect(spellEffectData['51533']?.cooldownSeconds).toBe(90);
  });

  it('Feral Spirit (51533) has durationSeconds >= 1 (needed for buffEndSeconds)', () => {
    expect(spellEffectData['51533']?.durationSeconds ?? 0).toBeGreaterThanOrEqual(1);
  });
});

// ─── reconstructEnemyCDTimeline integration ───────────────────────────────────

const START = 1_000_000;
const END = START + 120_000; // 120s match

describe('reconstructEnemyCDTimeline', () => {
  it('captures Havoc Meta (191427) cast from an enemy DH', () => {
    const dh = makeUnit('dh-1', {
      name: 'Veldrak',
      spec: CombatUnitSpec.DemonHunter_Havoc,
      reaction: CombatUnitReaction.Hostile,
      spellCastEvents: [makeSpellCastEvent('191427', START + 10_000, 'player-1')],
    });
    const combat = makeCombat(START, END);
    const timeline = reconstructEnemyCDTimeline([dh], combat as never);
    expect(timeline.players).toHaveLength(1);
    expect(timeline.players[0].offensiveCDs).toHaveLength(1);
    expect(timeline.players[0].offensiveCDs[0].spellId).toBe('191427');
    expect(timeline.players[0].offensiveCDs[0].cooldownSeconds).toBe(120);
  });

  it('sets buffEndSeconds > castTimeSeconds for Havoc Meta', () => {
    const dh = makeUnit('dh-1', {
      name: 'Veldrak',
      spec: CombatUnitSpec.DemonHunter_Havoc,
      reaction: CombatUnitReaction.Hostile,
      spellCastEvents: [makeSpellCastEvent('191427', START + 10_000, 'player-1')],
    });
    const combat = makeCombat(START, END);
    const timeline = reconstructEnemyCDTimeline([dh], combat as never);
    const cast = timeline.players[0].offensiveCDs[0];
    expect(cast.buffEndSeconds).toBeGreaterThan(cast.castTimeSeconds);
  });

  it('captures Feral Spirit (51533) cast from an enemy Enhancement Shaman', () => {
    const shaman = makeUnit('shaman-1', {
      name: 'Thundergust',
      spec: CombatUnitSpec.Shaman_Enhancement,
      reaction: CombatUnitReaction.Hostile,
      spellCastEvents: [makeSpellCastEvent('51533', START + 15_000, 'player-1')],
    });
    const combat = makeCombat(START, END);
    const timeline = reconstructEnemyCDTimeline([shaman], combat as never);
    expect(timeline.players).toHaveLength(1);
    expect(timeline.players[0].offensiveCDs[0].spellId).toBe('51533');
    expect(timeline.players[0].offensiveCDs[0].cooldownSeconds).toBe(90);
  });

  it('sets buffEndSeconds > castTimeSeconds for Feral Spirit', () => {
    const shaman = makeUnit('shaman-1', {
      name: 'Thundergust',
      spec: CombatUnitSpec.Shaman_Enhancement,
      reaction: CombatUnitReaction.Hostile,
      spellCastEvents: [makeSpellCastEvent('51533', START + 15_000, 'player-1')],
    });
    const combat = makeCombat(START, END);
    const timeline = reconstructEnemyCDTimeline([shaman], combat as never);
    const cast = timeline.players[0].offensiveCDs[0];
    expect(cast.buffEndSeconds).toBeGreaterThan(cast.castTimeSeconds);
  });

  it('builds an aligned burst window when Havoc Meta and Recklessness are cast within 10s', () => {
    const dh = makeUnit('dh-1', {
      name: 'Veldrak',
      spec: CombatUnitSpec.DemonHunter_Havoc,
      reaction: CombatUnitReaction.Hostile,
      spellCastEvents: [makeSpellCastEvent('191427', START + 10_000, 'player-1')],
    });
    const warrior = makeUnit('war-1', {
      name: 'Goreclaw',
      spec: CombatUnitSpec.Warrior_Arms,
      reaction: CombatUnitReaction.Hostile,
      spellCastEvents: [makeSpellCastEvent('1719', START + 14_000, 'player-1')], // Recklessness, 90s CD
    });
    const combat = makeCombat(START, END);
    const timeline = reconstructEnemyCDTimeline([dh, warrior], combat as never);
    expect(timeline.alignedBurstWindows.length).toBeGreaterThanOrEqual(1);
    const window = timeline.alignedBurstWindows[0];
    const spellIds = window.activeCDs.map((c) => c.spellId);
    expect(spellIds).toContain('191427');
    expect(spellIds).toContain('1719');
  });

  it('ignores enemies who cast no tracked offensive CDs', () => {
    const healer = makeUnit('healer-1', {
      name: 'Lightweave',
      spec: CombatUnitSpec.Priest_Holy,
      reaction: CombatUnitReaction.Hostile,
      spellCastEvents: [makeSpellCastEvent('596', START + 5_000, 'player-1')], // Prayer of Healing — not offensive
    });
    const combat = makeCombat(START, END);
    const timeline = reconstructEnemyCDTimeline([healer], combat as never);
    expect(timeline.players).toHaveLength(0);
  });
});
```

- [ ] **Step 1.2: Run the tests to confirm they fail for the right reasons**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -w @wowarenalogs/shared -- --testPathPattern=enemyCDs 2>&1 | head -60
```

Expected: FAIL — `isOffensiveSpell('191427')` returns false, `isOffensiveSpell('51533')` returns false, `durationSeconds` checks fail.

---

## Task 2: Fix spells.json

**Files:**

- Modify: `packages/shared/src/data/spells.json`

- [ ] **Step 2.1: Add 191427 as buffs_offensive**

In `spells.json`, find the block containing `"162264"` (Metamorphosis proc buff). Add a new entry for the cast spell just below it:

```json
  "191427": {
    "type": "buffs_offensive"
  },
```

- [ ] **Step 2.2: Remove or correct the stale 162264 entry**

`"162264"` fires only as SPELL_AURA_APPLIED (proc buff), never as SPELL_CAST_SUCCESS. Remove it to avoid confusion:

Delete this block from `spells.json`:

```json
  "162264": {
    "type": "buffs_offensive"
  },
```

- [ ] **Step 2.3: Add 51533 as buffs_offensive**

Find the block containing `"333957"` (Feral Spirit proc buff). Add:

```json
  "51533": {
    "type": "buffs_offensive"
  },
```

- [ ] **Step 2.4: Remove the stale 333957 entry**

Delete:

```json
  "333957": {
    "type": "buffs_offensive"
  },
```

---

## Task 3: Fix spellEffects.json

**Files:**

- Modify: `packages/shared/src/data/spellEffects.json`

Havoc Metamorphosis lasts 15 seconds in PvP. Feral Spirit wolves last 15 seconds. Both entries currently have `durationSeconds: 0` which causes `buffEndSeconds = castTimeSeconds` (no active window tracked for bait-CD analysis).

- [ ] **Step 3.1: Set durationSeconds for Havoc Meta (191427)**

Find the `"191427"` entry in `spellEffects.json`. It currently looks like:

```json
"191427": { "spellId": "191427", "name": "Metamorphosis", "cooldownSeconds": 120, "durationSeconds": 0, "dispelType": null }
```

Change `durationSeconds` from `0` to `15`:

```json
"191427": { "spellId": "191427", "name": "Metamorphosis", "cooldownSeconds": 120, "durationSeconds": 15, "dispelType": null }
```

- [ ] **Step 3.2: Set durationSeconds for Feral Spirit (51533)**

Find the `"51533"` entry. It currently looks like:

```json
"51533": { "spellId": "51533", "name": "Feral Spirit", "cooldownSeconds": 90, "durationSeconds": 0, "dispelType": null }
```

Change `durationSeconds` from `0` to `15`:

```json
"51533": { "spellId": "51533", "name": "Feral Spirit", "cooldownSeconds": 90, "durationSeconds": 15, "dispelType": null }
```

---

## Task 4: Run all tests and verify

- [ ] **Step 4.1: Run the new enemyCDs test suite**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -w @wowarenalogs/shared -- --testPathPattern=enemyCDs 2>&1
```

Expected: All tests PASS. If any fail, check whether the `CombatUnitSpec.DemonHunter_Havoc` and `CombatUnitSpec.Shaman_Enhancement` enum values exist — look in `@wowarenalogs/parser` package exports. Use `CombatUnitSpec.None` as fallback if missing; the spec field is not used by `reconstructEnemyCDTimeline`.

- [ ] **Step 4.2: Run the full shared test suite**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run test -w @wowarenalogs/shared 2>&1 | tail -20
```

Expected: All existing tests still pass. The `spellDanger.test.ts` tests for `isOffensiveSpell` cover 162264 indirectly — verify none break.

- [ ] **Step 4.3: Run lint**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run lint -w @wowarenalogs/shared 2>&1 | tail -10
```

Expected: 0 errors, 0 warnings.

---

## Task 5: Commit

- [ ] **Step 5.1: Stage and commit**

```bash
cd /Users/mingjianliu/code/wowarenalogs
git add packages/shared/src/data/spells.json \
        packages/shared/src/data/spellEffects.json \
        packages/shared/src/utils/__tests__/enemyCDs.test.ts
git commit -m "$(cat <<'EOF'
fix(enemyCDs): track Havoc Meta (191427) and Feral Spirit (51533) as offensive CDs (F44)

162264 and 333957 were the proc-buff aura IDs — they never fire as
SPELL_CAST_SUCCESS so reconstructEnemyCDTimeline never saw them.
Add the real cast IDs to spells.json and set durationSeconds=15 in
spellEffects.json so buffEndSeconds tracks the active window.
Adds enemyCDs.test.ts covering static data integrity + end-to-end
reconstructEnemyCDTimeline with mock combat.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**

- ✅ Verify correctness of captured CDs → covered by per-spec static assertions + integration tests
- ✅ Check for missed casts due to untracked spell IDs → found and fixed two (191427, 51533)
- ✅ Assess whether active-duration tracking is needed → already implemented; `durationSeconds` data patched
- ⚠️ "Log gaps" (events that simply don't appear in the log) → not testable with unit tests; requires manual spot-check against real logs using `printMatchPrompts.ts`. Out of scope for this plan.

**Placeholder scan:** None. All test code is complete with exact spell IDs and expected values.

**Type consistency:** `reconstructEnemyCDTimeline` expects `AtomicArenaCombat`; `makeCombat` returns `{startTime, endTime}`. Tests use `combat as never` cast to satisfy TypeScript without importing the full type — the function only reads `startTime`, `endTime`, and `startInfo?.bracket` so this is safe. `startInfo` will be `undefined`, causing `computeDampening` to default to `'3v3'` bracket which is correct for tests.

# Missed Opportunity Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three new analysis utilities that surface missed defensive opportunities as LLM context — immunity CDs unused at death, external defensives unused at teammate death, damage pressed into enemy immunity/DR, and healer CC received with avoidance tools available.

**Architecture:** Each utility operates on raw `ICombatUnit` data and computes its own CD availability from `spellCastEvents` (not via `extractMajorCooldowns`, since several target spells are missing from `spellEffectData`). All three outputs are formatted into compact text blocks and appended to the existing SUPPORTING DATA section of `buildMatchContext()`.

**Tech Stack:** TypeScript, Jest (via `npx tsdx test`), existing test helpers in `packages/shared/src/utils/__tests__/testHelpers.ts`.

---

## File Map

| File                                                                     | Action                             |
| ------------------------------------------------------------------------ | ---------------------------------- |
| `packages/shared/src/utils/deathOutcomeAnalysis.ts`                      | Create                             |
| `packages/shared/src/utils/__tests__/deathOutcomeAnalysis.test.ts`       | Create                             |
| `packages/shared/src/utils/offensiveWasteAnalysis.ts`                    | Create                             |
| `packages/shared/src/utils/__tests__/offensiveWasteAnalysis.test.ts`     | Create                             |
| `packages/shared/src/utils/healerExposureAnalysis.ts`                    | Extend (new export + types)        |
| `packages/shared/src/utils/__tests__/healerExposureAnalysis.test.ts`     | Create (tests for new export only) |
| `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx` | Extend (`buildMatchContext`)       |

---

## Task 1: `deathOutcomeAnalysis.ts` — deaths with unused CDs

Detects (a) deaths where the dying player had an immunity CD available, and (b) deaths where a teammate had an external defensive available and was free to cast.

**Files:**

- Create: `packages/shared/src/utils/deathOutcomeAnalysis.ts`
- Create: `packages/shared/src/utils/__tests__/deathOutcomeAnalysis.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `packages/shared/src/utils/__tests__/deathOutcomeAnalysis.test.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CombatUnitSpec, LogEvent } from '@wowarenalogs/parser';

import { buildDeathOutcomeSummary } from '../deathOutcomeAnalysis';
import { makeAuraEvent, makeSpellCastEvent, makeUnit } from './testHelpers';

// MATCH_START in ms; all timestamps are absolute ms.
const MATCH_START = 1_000_000;
const MATCH_END = 1_300_000;

function makeCombat() {
  return { startTime: MATCH_START, endTime: MATCH_END };
}

/** Create a unit with a deathRecord at the given absolute timestamp. */
function makeDeadUnit(id: string, deathTimestampMs: number, overrides: Parameters<typeof makeUnit>[1] = {}) {
  const u = makeUnit(id, overrides) as any;
  u.deathRecords = [{ timestamp: deathTimestampMs, event: LogEvent.UNIT_DIED, parameters: [] }];
  return u;
}

/** Minimal IPlayerCCTrinketSummary stub — no CC received, trinket available. */
function makeCCSummary(playerName: string, ccInstances: any[] = []) {
  return {
    playerName,
    playerSpec: 'Paladin Holy',
    trinketType: 'Gladiator',
    trinketCooldownSeconds: 90,
    ccInstances,
    trinketUseTimes: [],
    missedTrinketWindows: [],
  };
}

// ─── Immunity checks (#4) ──────────────────────────────────────────────────

describe('buildDeathOutcomeSummary — immunity checks', () => {
  it('returns empty events when no friendly deaths occurred', () => {
    const alive = makeUnit('p1', { spec: CombatUnitSpec.Paladin_Holy });
    const result = buildDeathOutcomeSummary(makeCombat() as any, [alive], [makeCCSummary('p1')]);
    expect(result.events).toHaveLength(0);
  });

  it('flags Divine Shield available at death when never used', () => {
    // Paladin dies at t=60s; Divine Shield (642, CD 300s) was never cast → available
    const dead = makeDeadUnit('p1', MATCH_START + 60_000, { spec: CombatUnitSpec.Paladin_Holy });
    const result = buildDeathOutcomeSummary(makeCombat() as any, [dead], [makeCCSummary('p1')]);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].availableImmunities).toHaveLength(1);
    expect(result.events[0].availableImmunities[0].spellName).toBe('Divine Shield');
    expect(result.events[0].availableImmunities[0].wasInCC).toBe(false);
  });

  it('does NOT flag Divine Shield when it was used recently (still on CD)', () => {
    // Divine Shield used at t=10s (CD=300s); player dies at t=60s → still on CD
    const dead = makeDeadUnit('p1', MATCH_START + 60_000, {
      spec: CombatUnitSpec.Paladin_Holy,
      spellCastEvents: [makeSpellCastEvent('642', MATCH_START + 10_000, 'p1', 'Self', 'p1', 'Paladin')],
    });
    const result = buildDeathOutcomeSummary(makeCombat() as any, [dead], [makeCCSummary('p1')]);
    expect(result.events[0]?.availableImmunities ?? []).toHaveLength(0);
  });

  it('flags wasInCC=true when CC was active at death and no trinket available', () => {
    const dead = makeDeadUnit('p1', MATCH_START + 60_000, { spec: CombatUnitSpec.Paladin_Holy });
    const ccSummary = makeCCSummary('p1', [
      {
        atSeconds: 55,
        durationSeconds: 10,
        spellId: '408',
        spellName: 'Kidney Shot',
        sourceName: 'Rogue',
        sourceSpec: 'Rogue Subtlety',
        trinketState: 'on_cooldown',
        drInfo: null,
        damageTakenDuring: 0,
        distanceYards: null,
        losBlocked: null,
      },
    ]);
    const result = buildDeathOutcomeSummary(makeCombat() as any, [dead], [ccSummary]);
    expect(result.events[0].availableImmunities[0].wasInCC).toBe(true);
  });

  it('excludes Divine Shield when Forbearance (25771) lockout aura is active at death', () => {
    // Forbearance applied at t=10s, duration ~30s — still active at t=30s death
    const dead = makeDeadUnit('p1', MATCH_START + 30_000, {
      spec: CombatUnitSpec.Paladin_Holy,
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '25771', MATCH_START + 10_000, 'p1', 'p1', 'DEBUFF'),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '25771', MATCH_START + 40_000, 'p1', 'p1', 'DEBUFF'),
      ],
    });
    const result = buildDeathOutcomeSummary(makeCombat() as any, [dead], [makeCCSummary('p1')]);
    const immunities = result.events[0]?.availableImmunities ?? [];
    expect(immunities.find((i: any) => i.spellName === 'Divine Shield')).toBeUndefined();
  });

  it('skips a death event with no available immunities and no missed externals', () => {
    // Ice Block used at t=10s, CD=240s — on CD at t=60s death; no teammates
    const dead = makeDeadUnit('p1', MATCH_START + 60_000, {
      spec: CombatUnitSpec.Mage_Frost,
      spellCastEvents: [makeSpellCastEvent('45438', MATCH_START + 10_000, 'p1', 'Self', 'p1', 'Mage')],
    });
    const result = buildDeathOutcomeSummary(makeCombat() as any, [dead], [makeCCSummary('p1')]);
    expect(result.events).toHaveLength(0);
  });
});

// ─── External defensive checks (#5) ───────────────────────────────────────

describe('buildDeathOutcomeSummary — external defensive checks', () => {
  it('flags missed Ironbark when Druid was free and had it available', () => {
    // Warrior (no immunities) dies; Druid had Ironbark (102342, CD=45s) never cast
    const warrior = makeDeadUnit('w1', MATCH_START + 90_000, {
      spec: CombatUnitSpec.Warrior_Arms,
      name: 'Warrior',
    });
    const druid = makeUnit('d1', {
      spec: CombatUnitSpec.Druid_Restoration,
      name: 'Druid',
    });
    const result = buildDeathOutcomeSummary(
      makeCombat() as any,
      [warrior, druid],
      [makeCCSummary('Warrior'), makeCCSummary('Druid')],
    );
    expect(result.events).toHaveLength(1);
    expect(result.events[0].missedExternals).toHaveLength(1);
    expect(result.events[0].missedExternals[0].spellName).toBe('Ironbark');
    expect(result.events[0].missedExternals[0].casterWasInCC).toBe(false);
  });

  it('flags casterWasInCC=true when external caster was in hard CC at death time', () => {
    const warrior = makeDeadUnit('w1', MATCH_START + 90_000, {
      spec: CombatUnitSpec.Warrior_Arms,
      name: 'Warrior',
    });
    const druid = makeUnit('d1', { spec: CombatUnitSpec.Druid_Restoration, name: 'Druid' });
    const druidCC = makeCCSummary('Druid', [
      {
        atSeconds: 85,
        durationSeconds: 10,
        spellId: '605',
        spellName: 'Mind Control',
        sourceName: 'Priest',
        sourceSpec: 'Priest Shadow',
        trinketState: 'on_cooldown',
        drInfo: null,
        damageTakenDuring: 0,
        distanceYards: null,
        losBlocked: null,
      },
    ]);
    const result = buildDeathOutcomeSummary(makeCombat() as any, [warrior, druid], [makeCCSummary('Warrior'), druidCC]);
    expect(result.events[0].missedExternals[0].casterWasInCC).toBe(true);
  });

  it('does NOT flag Ironbark when it was recently used (still on CD)', () => {
    // Ironbark used at t=80s, CD=45s → CD ready at t=125s; warrior dies at t=90s
    const warrior = makeDeadUnit('w1', MATCH_START + 90_000, {
      spec: CombatUnitSpec.Warrior_Arms,
      name: 'Warrior',
    });
    const druid = makeUnit('d1', {
      spec: CombatUnitSpec.Druid_Restoration,
      name: 'Druid',
      spellCastEvents: [makeSpellCastEvent('102342', MATCH_START + 80_000, 'w1', 'Warrior', 'd1', 'Druid')],
    });
    const result = buildDeathOutcomeSummary(
      makeCombat() as any,
      [warrior, druid],
      [makeCCSummary('Warrior'), makeCCSummary('Druid')],
    );
    expect(result.events[0]?.missedExternals ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd /Users/mingjianliu/code/wowarenalogs
npm run -w @wowarenalogs/shared test -- --testPathPattern=deathOutcomeAnalysis --watchAll=false
```

Expected: `Cannot find module '../deathOutcomeAnalysis'`

- [ ] **Step 1.3: Create `deathOutcomeAnalysis.ts`**

Create `packages/shared/src/utils/deathOutcomeAnalysis.ts`:

```typescript
import { AtomicArenaCombat, CombatUnitSpec, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { IPlayerCCTrinketSummary } from './ccTrinketAnalysis';
import { specToString } from './cooldowns';

// ─── Spell definitions ─────────────────────────────────────────────────────

interface IImmunitySpell {
  name: string;
  cooldownSeconds: number;
  lockoutSpellId?: string; // aura that prevents this immunity (e.g. Forbearance)
}

const IMMUNITY_SPELLS: Record<string, IImmunitySpell> = {
  '642': { name: 'Divine Shield', cooldownSeconds: 300, lockoutSpellId: '25771' }, // Forbearance
  '45438': { name: 'Ice Block', cooldownSeconds: 240, lockoutSpellId: '41425' }, // Hypothermia
  '47585': { name: 'Dispersion', cooldownSeconds: 90 },
  '186265': { name: 'Aspect of the Turtle', cooldownSeconds: 180 },
  '196555': { name: 'Netherwalk', cooldownSeconds: 30 },
};

const EXTERNAL_DEFENSIVE_SPELLS: Record<string, { name: string; cooldownSeconds: number }> = {
  '102342': { name: 'Ironbark', cooldownSeconds: 45 },
  '33206': { name: 'Pain Suppression', cooldownSeconds: 180 },
  '47788': { name: 'Guardian Spirit', cooldownSeconds: 180 },
  '1022': { name: 'Blessing of Protection', cooldownSeconds: 300 },
  '633': { name: 'Lay on Hands', cooldownSeconds: 420 },
  '116849': { name: 'Life Cocoon', cooldownSeconds: 120 },
};

// ─── Types ─────────────────────────────────────────────────────────────────

export interface IDeathImmuneAvailable {
  spellId: string;
  spellName: string;
  wasInCC: boolean;
}

export interface IMissedExternal {
  casterName: string;
  casterSpec: string;
  spellId: string;
  spellName: string;
  casterWasInCC: boolean;
}

export interface IDeathOutcomeEvent {
  deadPlayer: string;
  deadPlayerSpec: string;
  atSeconds: number;
  availableImmunities: IDeathImmuneAvailable[];
  missedExternals: IMissedExternal[];
}

export interface IDeathOutcomeSummary {
  events: IDeathOutcomeEvent[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Returns the last cast time in match-relative seconds, or null if never cast. */
function lastCastSeconds(unit: ICombatUnit, spellId: string, matchStartMs: number): number | null {
  const casts = unit.spellCastEvents.filter(
    (e) => e.spellId === spellId && e.logLine.event === LogEvent.SPELL_CAST_SUCCESS,
  );
  if (casts.length === 0) return null;
  return (Math.max(...casts.map((e) => e.logLine.timestamp)) - matchStartMs) / 1000;
}

/** True if the spell was off cooldown at atSeconds. */
function isAvailableAt(
  unit: ICombatUnit,
  spellId: string,
  cooldownSeconds: number,
  atSeconds: number,
  matchStartMs: number,
): boolean {
  const lastCast = lastCastSeconds(unit, spellId, matchStartMs);
  if (lastCast === null) return true; // never used → always available
  return atSeconds >= lastCast + cooldownSeconds;
}

/** True if the lockout aura was active on the unit at atSeconds. */
function isLockedOut(unit: ICombatUnit, lockoutSpellId: string, atSeconds: number, matchStartMs: number): boolean {
  let active = false;
  for (const e of unit.auraEvents) {
    if (e.spellId !== lockoutSpellId) continue;
    const t = (e.logLine.timestamp - matchStartMs) / 1000;
    if (e.logLine.event === LogEvent.SPELL_AURA_APPLIED) active = t <= atSeconds;
    if (e.logLine.event === LogEvent.SPELL_AURA_REMOVED && t <= atSeconds) active = false;
  }
  return active;
}

/** True if the player was in hard CC at atSeconds and had no trinket available. */
function wasInHardCC(ccSummary: IPlayerCCTrinketSummary, atSeconds: number): boolean {
  return ccSummary.ccInstances.some(
    (cc) =>
      cc.atSeconds <= atSeconds &&
      cc.atSeconds + cc.durationSeconds > atSeconds &&
      (cc.trinketState === 'on_cooldown' || cc.trinketState === 'passive_trinket'),
  );
}

// ─── Main export ───────────────────────────────────────────────────────────

export function buildDeathOutcomeSummary(
  combat: Pick<AtomicArenaCombat, 'startTime'>,
  friends: ICombatUnit[],
  ccSummaries: IPlayerCCTrinketSummary[],
): IDeathOutcomeSummary {
  const matchStartMs = combat.startTime;
  const events: IDeathOutcomeEvent[] = [];

  for (const unit of friends) {
    for (const deathRecord of unit.deathRecords) {
      const atSeconds = (deathRecord.timestamp - matchStartMs) / 1000;
      const ccSummary = ccSummaries.find((s) => s.playerName === unit.name);

      // #4 — immunities the dying player had available
      const availableImmunities: IDeathImmuneAvailable[] = [];
      for (const [spellId, spell] of Object.entries(IMMUNITY_SPELLS)) {
        if (!isAvailableAt(unit, spellId, spell.cooldownSeconds, atSeconds, matchStartMs)) continue;
        if (spell.lockoutSpellId && isLockedOut(unit, spell.lockoutSpellId, atSeconds, matchStartMs)) continue;
        availableImmunities.push({
          spellId,
          spellName: spell.name,
          wasInCC: ccSummary ? wasInHardCC(ccSummary, atSeconds) : false,
        });
      }

      // #5 — external defensives teammates had available and were free to cast
      const missedExternals: IMissedExternal[] = [];
      for (const teammate of friends) {
        if (teammate.id === unit.id) continue;
        const teammateCCSummary = ccSummaries.find((s) => s.playerName === teammate.name);
        for (const [spellId, spell] of Object.entries(EXTERNAL_DEFENSIVE_SPELLS)) {
          if (!isAvailableAt(teammate, spellId, spell.cooldownSeconds, atSeconds, matchStartMs)) continue;
          // Only flag if teammate's spec can actually have this spell
          // (cast-evidence check: if spell was never cast this match, skip)
          const everCast = teammate.spellCastEvents.some(
            (e) => e.spellId === spellId && e.logLine.event === LogEvent.SPELL_CAST_SUCCESS,
          );
          // Allow if spell was used at least once (confirmed they have it)
          // OR if the spell is a baseline for their spec (check known spec→spell map)
          if (!everCast && !isBaselineExternalFor(spellId, teammate.spec)) continue;
          missedExternals.push({
            casterName: teammate.name,
            casterSpec: specToString(teammate.spec),
            spellId,
            spellName: spell.name,
            casterWasInCC: teammateCCSummary ? wasInHardCC(teammateCCSummary, atSeconds) : false,
          });
        }
      }

      if (availableImmunities.length > 0 || missedExternals.length > 0) {
        events.push({
          deadPlayer: unit.name,
          deadPlayerSpec: specToString(unit.spec),
          atSeconds,
          availableImmunities,
          missedExternals,
        });
      }
    }
  }

  return { events };
}

/** True if spellId is a known baseline external defensive for the given spec. */
function isBaselineExternalFor(spellId: string, spec: CombatUnitSpec): boolean {
  const map: Partial<Record<string, CombatUnitSpec[]>> = {
    '102342': [CombatUnitSpec.Druid_Restoration],
    '33206': [CombatUnitSpec.Priest_Discipline],
    '47788': [CombatUnitSpec.Priest_Holy],
    '1022': [CombatUnitSpec.Paladin_Holy, CombatUnitSpec.Paladin_Retribution, CombatUnitSpec.Paladin_Protection],
    '633': [CombatUnitSpec.Paladin_Holy, CombatUnitSpec.Paladin_Retribution, CombatUnitSpec.Paladin_Protection],
    '116849': [CombatUnitSpec.Monk_Mistweaver],
  };
  return map[spellId]?.includes(spec) ?? false;
}

// ─── LLM formatting ────────────────────────────────────────────────────────

export function formatDeathOutcomeForContext(summary: IDeathOutcomeSummary): string {
  if (summary.events.length === 0) return '';
  const lines: string[] = ['DEATHS WITH MISSED OPTIONS'];
  for (const ev of summary.events) {
    const t = `${Math.floor(ev.atSeconds / 60)}:${String(Math.floor(ev.atSeconds % 60)).padStart(2, '0')}`;
    for (const imm of ev.availableImmunities) {
      const ccNote = imm.wasInCC ? ', was in CC' : ", was not CC'd";
      lines.push(`  [${t}] ${ev.deadPlayerSpec} (${ev.deadPlayer}) — had ${imm.spellName} available${ccNote}`);
    }
    for (const ext of ev.missedExternals) {
      const ccNote = ext.casterWasInCC ? ', caster in CC' : ', caster was free';
      lines.push(`  [${t}] ${ev.deadPlayer} died — ${ext.casterName} had ${ext.spellName} available${ccNote}`);
    }
  }
  return lines.join('\n');
}
```

- [ ] **Step 1.4: Run tests to confirm they pass**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern=deathOutcomeAnalysis --watchAll=false
```

Expected: All tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add packages/shared/src/utils/deathOutcomeAnalysis.ts \
        packages/shared/src/utils/__tests__/deathOutcomeAnalysis.test.ts
git commit -m "feat(analysis): add deathOutcomeAnalysis utility (#4 + #5)"
```

---

## Task 2: `offensiveWasteAnalysis.ts` — damage into immunity/DR

Detects when a friendly player pressed ≥2 high-value damage casts against an enemy who had an active immunity or major DR buff.

**Files:**

- Create: `packages/shared/src/utils/offensiveWasteAnalysis.ts`
- Create: `packages/shared/src/utils/__tests__/offensiveWasteAnalysis.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `packages/shared/src/utils/__tests__/offensiveWasteAnalysis.test.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CombatUnitReaction, CombatUnitSpec, LogEvent } from '@wowarenalogs/parser';

import { buildOffensiveWasteSummary } from '../offensiveWasteAnalysis';
import { makeAuraEvent, makeSpellCastEvent, makeUnit } from './testHelpers';

const MATCH_START = 1_000_000;
const MATCH_END = 1_300_000;

function makeCombat() {
  return { startTime: MATCH_START, endTime: MATCH_END };
}

/** Build a damage event (SPELL_CAST_SUCCESS against enemy) on a friendly unit. */
function makeDamageCast(spellId: string, spellName: string, timestampMs: number, srcId: string, destId: string): any {
  return {
    logLine: { event: LogEvent.SPELL_CAST_SUCCESS, timestamp: timestampMs, parameters: [] },
    timestamp: timestampMs,
    spellId,
    spellName,
    srcUnitId: srcId,
    srcUnitName: 'Attacker',
    destUnitId: destId,
    destUnitName: 'Target',
    effectiveAmount: 50_000,
    advancedActorMaxHp: 0,
    advancedActorCurrentHp: 0,
    advancedActorPositionX: 0,
    advancedActorPositionY: 0,
  };
}

/** Give a unit damage output for the ≥5% damage check. */
function withDamageOut(unit: any, events: any[]): any {
  unit.damageOut = events;
  return unit;
}

describe('buildOffensiveWasteSummary', () => {
  const enemyId = 'enemy-1';

  it('returns empty when no immunity windows exist', () => {
    const friend = makeUnit('f1', { spec: CombatUnitSpec.DeathKnight_Frost });
    const enemy = makeUnit(enemyId, { reaction: CombatUnitReaction.Hostile });
    const result = buildOffensiveWasteSummary(makeCombat() as any, [friend], [enemy]);
    expect(result.events).toHaveLength(0);
  });

  it('does NOT flag a single cast into immunity (below threshold of 2)', () => {
    const enemy = makeUnit(enemyId, {
      reaction: CombatUnitReaction.Hostile,
      spec: CombatUnitSpec.Paladin_Holy,
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '642', MATCH_START + 30_000, enemyId, enemyId, 'BUFF'),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '642', MATCH_START + 38_000, enemyId, enemyId, 'BUFF'),
      ],
    });
    const cast1 = makeDamageCast('194913', 'Obliterate', MATCH_START + 32_000, 'f1', enemyId);
    const friend = withDamageOut(makeUnit('f1', { spec: CombatUnitSpec.DeathKnight_Frost }), [cast1]);
    friend.spellCastEvents = [cast1];
    const result = buildOffensiveWasteSummary(makeCombat() as any, [friend], [enemy]);
    expect(result.events).toHaveLength(0);
  });

  it('flags ≥2 high-value casts into an immunity window', () => {
    // Enemy Paladin has Divine Shield (642) from t=30s to t=38s
    const enemy = makeUnit(enemyId, {
      reaction: CombatUnitReaction.Hostile,
      spec: CombatUnitSpec.Paladin_Holy,
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '642', MATCH_START + 30_000, enemyId, enemyId, 'BUFF'),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '642', MATCH_START + 38_000, enemyId, enemyId, 'BUFF'),
      ],
    });
    // Friendly DK presses 2 high-value abilities during the window
    // High-value: contributes ≥5% of total damage. Total damage here = 2 × 50k = 100k, each = 50%
    const cast1 = makeDamageCast('49998', 'Death Strike', MATCH_START + 32_000, 'f1', enemyId);
    const cast2 = makeDamageCast('43265', 'Death and Decay', MATCH_START + 34_000, 'f1', enemyId);
    const friend = withDamageOut(makeUnit('f1', { spec: CombatUnitSpec.DeathKnight_Frost }), [cast1, cast2]);
    friend.spellCastEvents = [cast1, cast2];
    const result = buildOffensiveWasteSummary(makeCombat() as any, [friend], [enemy]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].defenseType).toBe('immunity');
    expect(result.events[0].defenseName).toBe('Divine Shield');
    expect(result.events[0].wasteCasts).toHaveLength(2);
  });

  it('flags ≥3 casts into a major DR window', () => {
    // Enemy Warrior has Ironbark (102342) from t=50s to t=58s
    const enemy = makeUnit(enemyId, {
      reaction: CombatUnitReaction.Hostile,
      spec: CombatUnitSpec.Warrior_Arms,
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '102342', MATCH_START + 50_000, 'd1', enemyId, 'BUFF'),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '102342', MATCH_START + 58_000, 'd1', enemyId, 'BUFF'),
      ],
    });
    const cast1 = makeDamageCast('1', 'Chaos Strike', MATCH_START + 51_000, 'f1', enemyId);
    const cast2 = makeDamageCast('2', 'Blade Dance', MATCH_START + 53_000, 'f1', enemyId);
    const cast3 = makeDamageCast('3', 'The Hunt', MATCH_START + 55_000, 'f1', enemyId);
    const friend = withDamageOut(makeUnit('f1', { spec: CombatUnitSpec.DemonHunter_Havoc }), [cast1, cast2, cast3]);
    friend.spellCastEvents = [cast1, cast2, cast3];
    const result = buildOffensiveWasteSummary(makeCombat() as any, [friend], [enemy]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].defenseType).toBe('major_dr');
    expect(result.events[0].defenseName).toBe('Ironbark');
    expect(result.events[0].wasteCasts).toHaveLength(3);
  });

  it('does not flag casts against a DIFFERENT enemy during the immunity window', () => {
    const enemy1 = makeUnit(enemyId, {
      reaction: CombatUnitReaction.Hostile,
      spec: CombatUnitSpec.Paladin_Holy,
      auraEvents: [
        makeAuraEvent(LogEvent.SPELL_AURA_APPLIED, '642', MATCH_START + 30_000, enemyId, enemyId, 'BUFF'),
        makeAuraEvent(LogEvent.SPELL_AURA_REMOVED, '642', MATCH_START + 38_000, enemyId, enemyId, 'BUFF'),
      ],
    });
    const enemy2 = makeUnit('enemy-2', { reaction: CombatUnitReaction.Hostile });
    // Casts are against enemy2, not enemy1
    const cast1 = makeDamageCast('1', 'Spell A', MATCH_START + 32_000, 'f1', 'enemy-2');
    const cast2 = makeDamageCast('2', 'Spell B', MATCH_START + 34_000, 'f1', 'enemy-2');
    const friend = withDamageOut(makeUnit('f1', { spec: CombatUnitSpec.DeathKnight_Frost }), [cast1, cast2]);
    friend.spellCastEvents = [cast1, cast2];
    const result = buildOffensiveWasteSummary(makeCombat() as any, [friend], [enemy1, enemy2]);
    expect(result.events).toHaveLength(0);
  });
});
```

- [ ] **Step 2.2: Run tests to confirm they fail**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern=offensiveWasteAnalysis --watchAll=false
```

Expected: `Cannot find module '../offensiveWasteAnalysis'`

- [ ] **Step 2.3: Create `offensiveWasteAnalysis.ts`**

Create `packages/shared/src/utils/offensiveWasteAnalysis.ts`:

```typescript
import { AtomicArenaCombat, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { specToString } from './cooldowns';

// ─── Defense definitions ──────────────────────────────────────────────────

const IMMUNITY_AURAS: Record<string, string> = {
  '642': 'Divine Shield',
  '45438': 'Ice Block',
  '47585': 'Dispersion',
  '186265': 'Aspect of the Turtle',
};

const MAJOR_DR_AURAS: Record<string, string> = {
  '102342': 'Ironbark',
  '33206': 'Pain Suppression',
  '264735': 'Survival of the Fittest',
  '22812': 'Barkskin',
  '498': 'Divine Protection',
};

// ─── Types ─────────────────────────────────────────────────────────────────

export interface IOffensiveWasteCast {
  spellId: string;
  spellName: string;
  atSeconds: number;
}

export interface IOffensiveWasteEvent {
  casterName: string;
  casterSpec: string;
  targetName: string;
  targetSpec: string;
  defenseType: 'immunity' | 'major_dr';
  defenseName: string;
  defenseWindowSeconds: [number, number];
  wasteCasts: IOffensiveWasteCast[];
}

export interface IOffensiveWasteSummary {
  events: IOffensiveWasteEvent[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

interface IDefenseWindow {
  spellId: string;
  defenseName: string;
  defenseType: 'immunity' | 'major_dr';
  fromSeconds: number;
  toSeconds: number;
  unitId: string;
  unitName: string;
  unitSpec: string;
}

function buildDefenseWindows(enemies: ICombatUnit[], matchStartMs: number): IDefenseWindow[] {
  const windows: IDefenseWindow[] = [];

  for (const enemy of enemies) {
    // Track open windows per spellId
    const openAt: Record<string, number> = {};

    for (const e of enemy.auraEvents) {
      const spellId = e.spellId;
      if (!spellId) continue;
      const isImmunity = spellId in IMMUNITY_AURAS;
      const isDR = spellId in MAJOR_DR_AURAS;
      if (!isImmunity && !isDR) continue;

      const t = (e.logLine.timestamp - matchStartMs) / 1000;

      if (e.logLine.event === LogEvent.SPELL_AURA_APPLIED) {
        openAt[spellId] = t;
      } else if (e.logLine.event === LogEvent.SPELL_AURA_REMOVED && openAt[spellId] !== undefined) {
        windows.push({
          spellId,
          defenseName: isImmunity ? IMMUNITY_AURAS[spellId] : MAJOR_DR_AURAS[spellId],
          defenseType: isImmunity ? 'immunity' : 'major_dr',
          fromSeconds: openAt[spellId],
          toSeconds: t,
          unitId: enemy.id,
          unitName: enemy.name,
          unitSpec: specToString(enemy.spec),
        });
        delete openAt[spellId];
      }
    }
  }

  return windows;
}

/** Compute per-spell total damage contribution for a unit. Returns a set of spellIds contributing ≥5%. */
function getHighValueSpellIds(unit: ICombatUnit): Set<string> {
  const totals: Record<string, number> = {};
  let grandTotal = 0;

  for (const dmg of unit.damageOut) {
    const id = dmg.spellId ?? 'melee';
    totals[id] = (totals[id] ?? 0) + (dmg.effectiveAmount ?? 0);
    grandTotal += dmg.effectiveAmount ?? 0;
  }

  const threshold = grandTotal * 0.05;
  return new Set(
    Object.entries(totals)
      .filter(([, v]) => v >= threshold)
      .map(([k]) => k),
  );
}

// ─── Main export ───────────────────────────────────────────────────────────

export function buildOffensiveWasteSummary(
  combat: Pick<AtomicArenaCombat, 'startTime'>,
  friends: ICombatUnit[],
  enemies: ICombatUnit[],
): IOffensiveWasteSummary {
  const matchStartMs = combat.startTime;
  const defenseWindows = buildDefenseWindows(enemies, matchStartMs);
  const events: IOffensiveWasteEvent[] = [];

  for (const friend of friends) {
    const highValueIds = getHighValueSpellIds(friend);
    const castEvents = friend.spellCastEvents.filter((e) => e.logLine.event === LogEvent.SPELL_CAST_SUCCESS);

    for (const window of defenseWindows) {
      const threshold = window.defenseType === 'immunity' ? 2 : 3;

      const wasteCasts: IOffensiveWasteCast[] = castEvents
        .filter((e) => {
          if (e.destUnitId !== window.unitId) return false;
          const t = (e.logLine.timestamp - matchStartMs) / 1000;
          if (t < window.fromSeconds || t > window.toSeconds) return false;
          // High-value: contributed ≥5% of total damage OR in damageOut at all
          return e.spellId !== null && (highValueIds.has(e.spellId) || highValueIds.size === 0);
        })
        .map((e) => ({
          spellId: e.spellId ?? '',
          spellName: e.spellName ?? '',
          atSeconds: (e.logLine.timestamp - matchStartMs) / 1000,
        }));

      if (wasteCasts.length >= threshold) {
        events.push({
          casterName: friend.name,
          casterSpec: specToString(friend.spec),
          targetName: window.unitName,
          targetSpec: window.unitSpec,
          defenseType: window.defenseType,
          defenseName: window.defenseName,
          defenseWindowSeconds: [window.fromSeconds, window.toSeconds],
          wasteCasts,
        });
      }
    }
  }

  return { events };
}

// ─── LLM formatting ────────────────────────────────────────────────────────

export function formatOffensiveWasteForContext(summary: IOffensiveWasteSummary): string {
  if (summary.events.length === 0) return '';
  const lines: string[] = ['ABILITIES INTO IMMUNITY/DR'];
  for (const ev of summary.events) {
    const t = `${Math.floor(ev.defenseWindowSeconds[0] / 60)}:${String(Math.floor(ev.defenseWindowSeconds[0] % 60)).padStart(2, '0')}`;
    const spells = ev.wasteCasts.map((c) => c.spellName).join(' + ');
    lines.push(`  [${t}] ${ev.casterSpec} (${ev.casterName}): ${spells} into ${ev.targetName}'s ${ev.defenseName}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 2.4: Run tests to confirm they pass**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern=offensiveWasteAnalysis --watchAll=false
```

Expected: All tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add packages/shared/src/utils/offensiveWasteAnalysis.ts \
        packages/shared/src/utils/__tests__/offensiveWasteAnalysis.test.ts
git commit -m "feat(analysis): add offensiveWasteAnalysis utility (#6)"
```

---

## Task 3: Extend `healerExposureAnalysis.ts` — healer CC avoidance

Add `buildHealerCCReceivedEvents()` as a new export. The existing `analyzeHealerExposureAtBurst()` is unchanged.

**Files:**

- Modify: `packages/shared/src/utils/healerExposureAnalysis.ts`
- Create: `packages/shared/src/utils/__tests__/healerExposureAnalysis.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `packages/shared/src/utils/__tests__/healerExposureAnalysis.test.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CombatUnitSpec, LogEvent } from '@wowarenalogs/parser';

import { buildHealerCCReceivedEvents } from '../healerExposureAnalysis';
import { makeAdvancedAction, makeAuraEvent, makeSpellCastEvent, makeUnit } from './testHelpers';

const MATCH_START = 1_000_000;
const MATCH_END = 1_300_000;

function makeCombat() {
  return { startTime: MATCH_START, endTime: MATCH_END };
}

/** A minimal IPlayerCCTrinketSummary with one CC instance. */
function makeCCSummary(atSeconds: number, durationSeconds: number) {
  return {
    playerName: 'Healer',
    playerSpec: 'Priest Holy',
    trinketType: 'Gladiator',
    trinketCooldownSeconds: 90,
    ccInstances: [
      {
        atSeconds,
        durationSeconds,
        spellId: '118',
        spellName: 'Polymorph',
        sourceName: 'Mage',
        sourceSpec: 'Mage Frost',
        trinketState: 'on_cooldown',
        drInfo: null,
        damageTakenDuring: 0,
        distanceYards: null,
        losBlocked: null,
      },
    ],
    trinketUseTimes: [],
    missedTrinketWindows: [],
  };
}

/** A unit with an advancedAction HP snapshot at the given time. */
function friendAt(id: string, hpPct: number, timestampMs: number) {
  const maxHp = 500_000;
  const currentHp = Math.round(maxHp * hpPct);
  return makeUnit(id, {
    advancedActions: [makeAdvancedAction(timestampMs, 0, 0, maxHp, currentHp)],
  });
}

describe('buildHealerCCReceivedEvents', () => {
  it('returns empty when healer has no CC instances', () => {
    const healer = makeUnit('h1', { spec: CombatUnitSpec.Priest_Holy, name: 'Healer' });
    const ccSummary = { ...makeCCSummary(30, 8), ccInstances: [] };
    const result = buildHealerCCReceivedEvents(makeCombat() as any, healer, [healer], ccSummary as any);
    expect(result).toHaveLength(0);
  });

  it('omits CC event when no teammate was below 75% HP (neutral state gate)', () => {
    const healer = makeUnit('h1', { spec: CombatUnitSpec.Priest_Holy, name: 'Healer' });
    // Teammate at 90% HP during CC
    const teammate = friendAt('w1', 0.9, MATCH_START + 29_000);
    const ccSummary = makeCCSummary(30, 8); // poly at t=30s
    const result = buildHealerCCReceivedEvents(makeCombat() as any, healer, [healer, teammate], ccSummary as any);
    expect(result).toHaveLength(0);
  });

  it('includes CC event when teammate was below 75% HP', () => {
    const healer = makeUnit('h1', { spec: CombatUnitSpec.Priest_Holy, name: 'Healer' });
    // Teammate at 50% HP just before the CC lands
    const teammate = friendAt('w1', 0.5, MATCH_START + 29_000);
    const ccSummary = makeCCSummary(30, 8);
    const result = buildHealerCCReceivedEvents(makeCombat() as any, healer, [healer, teammate], ccSummary as any);
    expect(result).toHaveLength(1);
    expect(result[0].ccSpellName).toBe('Polymorph');
    expect(result[0].teammateLowHp).toBe(true);
  });

  it('flags Fade as available when never used by Holy Priest', () => {
    const healer = makeUnit('h1', { spec: CombatUnitSpec.Priest_Holy, name: 'Healer' });
    const teammate = friendAt('w1', 0.5, MATCH_START + 29_000);
    const ccSummary = makeCCSummary(30, 8); // poly lands at t=30s
    const result = buildHealerCCReceivedEvents(makeCombat() as any, healer, [healer, teammate], ccSummary as any);
    expect(result[0].avoidanceToolsAvailable).toHaveLength(1);
    expect(result[0].avoidanceToolsAvailable[0].spellName).toBe('Fade');
    expect(result[0].avoidanceToolsAvailable[0].availableSinceSeconds).toBeGreaterThan(1.5);
  });

  it('does NOT flag Fade when it was used within the last 30s', () => {
    // Fade (586) used at t=20s (CD=30s) → not available at t=30s
    const healer = makeUnit('h1', {
      spec: CombatUnitSpec.Priest_Holy,
      name: 'Healer',
      spellCastEvents: [makeSpellCastEvent('586', MATCH_START + 20_000, 'h1', 'Self', 'h1', 'Healer')],
    });
    const teammate = friendAt('w1', 0.5, MATCH_START + 29_000);
    const ccSummary = makeCCSummary(30, 8);
    const result = buildHealerCCReceivedEvents(makeCombat() as any, healer, [healer, teammate], ccSummary as any);
    expect(result[0].avoidanceToolsAvailable).toHaveLength(0);
  });

  it('includes event with empty avoidanceToolsAvailable when no tools were ready', () => {
    // Resto Shaman with Grounding Totem (8177, CD=25s) used at t=10s → not ready at t=30s
    const healer = makeUnit('h1', {
      spec: CombatUnitSpec.Shaman_Restoration,
      name: 'Healer',
      spellCastEvents: [makeSpellCastEvent('8177', MATCH_START + 10_000, 'h1', 'Self', 'h1', 'Healer')],
    });
    const teammate = friendAt('w1', 0.5, MATCH_START + 29_000);
    const ccSummary = makeCCSummary(30, 8);
    const result = buildHealerCCReceivedEvents(makeCombat() as any, healer, [healer, teammate], ccSummary as any);
    expect(result).toHaveLength(1);
    expect(result[0].avoidanceToolsAvailable).toHaveLength(0);
  });
});
```

- [ ] **Step 3.2: Run tests to confirm they fail**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern=healerExposureAnalysis --watchAll=false
```

Expected: `buildHealerCCReceivedEvents is not a function` (or similar import error).

- [ ] **Step 3.3: Add constants and types to `healerExposureAnalysis.ts`**

At the end of the imports block (after the existing imports), add the new constants and types. Then add the new function. Open `packages/shared/src/utils/healerExposureAnalysis.ts` and append:

```typescript
// ─── Healer CC avoidance (#7) ──────────────────────────────────────────────

interface IAvoidanceSpell {
  spellId: string;
  name: string;
  cooldownSeconds: number;
}

const HEALER_AVOIDANCE_SPELLS: Partial<Record<CombatUnitSpec, IAvoidanceSpell[]>> = {
  [CombatUnitSpec.Shaman_Restoration]: [{ spellId: '8177', name: 'Grounding Totem', cooldownSeconds: 25 }],
  [CombatUnitSpec.Priest_Holy]: [{ spellId: '586', name: 'Fade', cooldownSeconds: 30 }],
  [CombatUnitSpec.Priest_Discipline]: [{ spellId: '586', name: 'Fade', cooldownSeconds: 30 }],
  [CombatUnitSpec.Paladin_Holy]: [{ spellId: '642', name: 'Divine Shield', cooldownSeconds: 300 }],
  [CombatUnitSpec.Monk_Mistweaver]: [{ spellId: '122783', name: 'Diffuse Magic', cooldownSeconds: 90 }],
  [CombatUnitSpec.Evoker_Preservation]: [{ spellId: '363916', name: 'Obsidian Scales', cooldownSeconds: 60 }],
};

export interface IHealerAvoidanceTool {
  spellId: string;
  spellName: string;
  availableSinceSeconds: number;
}

export interface IHealerCCReceived {
  atSeconds: number;
  ccSpellName: string;
  ccCategory: string;
  durationSeconds: number;
  teammateLowHp: boolean;
  avoidanceToolsAvailable: IHealerAvoidanceTool[];
}

/** Returns the last cast time of spellId in match-relative seconds, or null. */
function lastAvoidanceCastSeconds(unit: ICombatUnit, spellId: string, matchStartMs: number): number | null {
  const casts = unit.spellCastEvents.filter(
    (e) => e.spellId === spellId && e.logLine.event === LogEvent.SPELL_CAST_SUCCESS,
  );
  if (casts.length === 0) return null;
  return (Math.max(...casts.map((e) => e.logLine.timestamp)) - matchStartMs) / 1000;
}

/** True if any teammate had HP below 75% at approx the given match-relative time. */
function anyTeammateLowHp(friends: ICombatUnit[], atSeconds: number, matchStartMs: number): boolean {
  const windowMs = 2_000; // look ±2s for nearest HP snapshot
  for (const unit of friends) {
    for (const action of unit.advancedActions) {
      const t = action.logLine.timestamp - matchStartMs;
      if (Math.abs(t - atSeconds * 1000) > windowMs) continue;
      if (action.advancedActorMaxHp > 0) {
        const hpPct = action.advancedActorCurrentHp / action.advancedActorMaxHp;
        if (hpPct < 0.75) return true;
      }
    }
  }
  return false;
}

export function buildHealerCCReceivedEvents(
  combat: Pick<import('@wowarenalogs/parser').AtomicArenaCombat, 'startTime'>,
  healer: ICombatUnit,
  friends: ICombatUnit[],
  ccSummary: import('./ccTrinketAnalysis').IPlayerCCTrinketSummary,
): IHealerCCReceived[] {
  const matchStartMs = combat.startTime;
  const avoidanceSpells = HEALER_AVOIDANCE_SPELLS[healer.spec] ?? [];
  const result: IHealerCCReceived[] = [];

  for (const cc of ccSummary.ccInstances) {
    const teammateLowHp = anyTeammateLowHp(friends, cc.atSeconds, matchStartMs);
    if (!teammateLowHp) continue; // neutral state gate

    const avoidanceToolsAvailable: IHealerAvoidanceTool[] = [];
    for (const spell of avoidanceSpells) {
      const lastCast = lastAvoidanceCastSeconds(healer, spell.spellId, matchStartMs);
      let availableSince: number;
      if (lastCast === null) {
        availableSince = 0; // available since match start
      } else {
        const cdReadyAt = lastCast + spell.cooldownSeconds;
        if (cdReadyAt > cc.atSeconds) continue; // still on CD
        availableSince = cdReadyAt;
      }
      const idleDuration = cc.atSeconds - availableSince;
      if (idleDuration < 1.5) continue; // not available long enough before CC landed
      avoidanceToolsAvailable.push({
        spellId: spell.spellId,
        spellName: spell.name,
        availableSinceSeconds: idleDuration,
      });
    }

    result.push({
      atSeconds: cc.atSeconds,
      ccSpellName: cc.spellName,
      ccCategory: cc.drInfo?.category ?? 'Unknown',
      durationSeconds: cc.durationSeconds,
      teammateLowHp,
      avoidanceToolsAvailable,
    });
  }

  return result;
}

export function formatHealerCCReceivedForContext(events: IHealerCCReceived[]): string {
  if (events.length === 0) return '';
  const lines: string[] = ['HEALER CC RECEIVED'];
  for (const ev of events) {
    const t = `${Math.floor(ev.atSeconds / 60)}:${String(Math.floor(ev.atSeconds % 60)).padStart(2, '0')}`;
    if (ev.avoidanceToolsAvailable.length > 0) {
      const tools = ev.avoidanceToolsAvailable
        .map((a) => `${a.spellName} available ${Math.round(a.availableSinceSeconds)}s prior`)
        .join(', ');
      lines.push(`  [${t}] ${ev.ccSpellName} (${ev.durationSeconds}s) — ${tools}`);
    } else {
      lines.push(`  [${t}] ${ev.ccSpellName} (${ev.durationSeconds}s) — no avoidance tools available`);
    }
  }
  return lines.join('\n');
}
```

You will also need to add `LogEvent` to the imports at the top of `healerExposureAnalysis.ts` if it's not already imported. Check the existing import line for `@wowarenalogs/parser` and add `LogEvent` and `AtomicArenaCombat` if missing.

- [ ] **Step 3.4: Run tests to confirm they pass**

```bash
npm run -w @wowarenalogs/shared test -- --testPathPattern=healerExposureAnalysis --watchAll=false
```

Expected: All tests pass.

- [ ] **Step 3.5: Run full test suite to confirm nothing regressed**

```bash
npm run -w @wowarenalogs/shared test -- --watchAll=false
```

Expected: All existing tests still pass.

- [ ] **Step 3.6: Commit**

```bash
git add packages/shared/src/utils/healerExposureAnalysis.ts \
        packages/shared/src/utils/__tests__/healerExposureAnalysis.test.ts
git commit -m "feat(analysis): add buildHealerCCReceivedEvents to healerExposureAnalysis (#7)"
```

---

## Task 4: Wire into `buildMatchContext()`

Add all three utilities to `buildMatchContext()` in `CombatAIAnalysis/index.tsx` and inject their formatted output into the LLM context string.

**Files:**

- Modify: `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx`

- [ ] **Step 4.1: Add imports**

At the top of `packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx`, add these three import lines alongside the existing utility imports:

```typescript
import { buildDeathOutcomeSummary, formatDeathOutcomeForContext } from '../../../utils/deathOutcomeAnalysis';
import { buildOffensiveWasteSummary, formatOffensiveWasteForContext } from '../../../utils/offensiveWasteAnalysis';
import { buildHealerCCReceivedEvents, formatHealerCCReceivedForContext } from '../../../utils/healerExposureAnalysis';
```

- [ ] **Step 4.2: Call the three utilities in `buildMatchContext`**

In `buildMatchContext`, after the existing `const healerExposures = ...` block (around line 136), add:

```typescript
// Missed opportunity utilities
const deathOutcome = buildDeathOutcomeSummary(combat, friends as ICombatUnit[], ccTrinketSummaries);
const offensiveWaste = buildOffensiveWasteSummary(combat, friends as ICombatUnit[], enemies as ICombatUnit[]);
const healerCCReceived =
  healerUnit && healerCCSummary
    ? buildHealerCCReceivedEvents(combat, healerUnit, friends as ICombatUnit[], healerCCSummary)
    : [];
```

- [ ] **Step 4.3: Inject the formatted blocks into the context string**

The context string is assembled via a `lines` array. The function ends at `return lines.join('\n')`. The last block pushed before that return is the dampening section (`formatDampeningForContext`). Insert the three new blocks immediately after the dampening block and before `return lines.join('\n')`:

```typescript
// ── MISSED OPPORTUNITIES ─────────────────────────────────────────────────
const deathOutcomeBlock = formatDeathOutcomeForContext(deathOutcome);
if (deathOutcomeBlock) {
  lines.push('');
  lines.push(deathOutcomeBlock);
}

const offensiveWasteBlock = formatOffensiveWasteForContext(offensiveWaste);
if (offensiveWasteBlock) {
  lines.push('');
  lines.push(offensiveWasteBlock);
}

const healerCCBlock = formatHealerCCReceivedForContext(healerCCReceived);
if (healerCCBlock) {
  lines.push('');
  lines.push(healerCCBlock);
}
```

This goes immediately before the existing `return lines.join('\n');` on the last line of `buildMatchContext`.

- [ ] **Step 4.4: Type-check and lint**

```bash
npm run -w @wowarenalogs/shared lint
```

Fix any TypeScript errors. Common issues:

- `ICombatUnit` cast may need `as ICombatUnit[]` — already done above
- `healerCCReceived` empty array type needs a type annotation if TypeScript cannot infer it

- [ ] **Step 4.5: Run full test suite**

```bash
npm run -w @wowarenalogs/shared test -- --watchAll=false
```

Expected: All tests pass.

- [ ] **Step 4.6: Commit**

```bash
git add packages/shared/src/components/CombatReport/CombatAIAnalysis/index.tsx
git commit -m "feat(analysis): wire missed-opportunity utilities into buildMatchContext"
```

---

## Self-Review Notes

- All three utilities accept `Pick<AtomicArenaCombat, 'startTime'>` instead of the full `AtomicArenaCombat`, which makes them testable without constructing the full match object.
- `buildDeathOutcomeSummary` uses `isBaselineExternalFor` to avoid false positives on external defensives (e.g. flagging a Holy Paladin for a missing Ironbark they can't cast). If a spell was never used in the match AND is not a baseline for the spec, it's skipped. This is conservative — it won't catch the case where a Druid never used Ironbark, but that's already covered by `availableWindows` in the existing CD context.
- `offensiveWasteAnalysis` uses the ≥5% total damage rule for "high-value." In test scenarios where total damage is small (2 casts), both casts are 50% each and pass the threshold. In real matches with 50+ casts, only major damage dealers will qualify.
- The `healerCCReceived` block is only emitted when at least one teammate was below 75% HP at CC-land time. This is the same gate as ArenaCoach uses to filter out neutral-state CC.
- Task 4 step 4.3 is intentionally less prescriptive because the exact location in `buildMatchContext` depends on current file state. The engineer should locate the string assembly section themselves.

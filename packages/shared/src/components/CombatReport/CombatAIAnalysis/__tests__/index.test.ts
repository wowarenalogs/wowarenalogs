/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for the pure helper functions in CombatAIAnalysis/index.tsx.
 *
 * Coverage: getEnemyStateAtTime, getOwnerCDsAvailable, buildDeathRootCauseTrace,
 * findContributingDeath, buildKillMomentFields, identifyCriticalMoments, buildMatchFlow.
 *
 * These are all pure/data functions with no React dependencies at call-time, so they
 * run cleanly in a node Jest environment.
 */

import { CombatUnitSpec } from '@wowarenalogs/parser';

import { makeAdvancedAction, makeUnit } from '../../../../utils/__tests__/testHelpers';
import { IPlayerCCTrinketSummary } from '../../../../utils/ccTrinketAnalysis';
import { IMajorCooldownInfo, IOverlappedDefensive, IPanicDefensive } from '../../../../utils/cooldowns';
import { IAlignedBurstWindow, IEnemyCDTimeline } from '../../../../utils/enemyCDs';
import { IHealingGap } from '../../../../utils/healingGaps';
import {
  buildDeathRootCauseTrace,
  buildKillMomentFields,
  buildMatchArc,
  buildMatchFlow,
  findContributingDeath,
  getEnemyStateAtTime,
  getOwnerCDsAvailable,
  identifyCriticalMoments,
} from '../utils';

// ─── Shared test-data factories ────────────────────────────────────────────────

function makeBurstWindow(
  fromSeconds: number,
  toSeconds: number,
  dangerScore: number,
  dangerLabel: 'Low' | 'Moderate' | 'High' | 'Critical' = 'High',
  activeCDs: Array<{ playerName: string; spellName: string; spellId: string }> = [],
): IAlignedBurstWindow {
  return {
    fromSeconds,
    toSeconds,
    dangerScore,
    dangerLabel,
    activeCDs,
    dampeningPct: 0,
    damageInWindow: 0,
    damageRatio: 1,
    healerCCed: false,
  };
}

function makeTimeline(bursts: IAlignedBurstWindow[] = [], players: IEnemyCDTimeline['players'] = []): IEnemyCDTimeline {
  return { alignedBurstWindows: bursts, players };
}

function makeCooldown(
  overrides: Partial<IMajorCooldownInfo> & {
    spellName: string;
    tag: IMajorCooldownInfo['tag'];
    cooldownSeconds: number;
  },
): IMajorCooldownInfo {
  return {
    spellId: '12345',
    availableWindows: [],
    neverUsed: false,
    casts: [],
    maxChargesDetected: 1,
    ...overrides,
  };
}

function makeCCTrinketSummary(
  playerName: string,
  ccInstances: IPlayerCCTrinketSummary['ccInstances'] = [],
): IPlayerCCTrinketSummary {
  return {
    playerName,
    playerSpec: 'Holy Priest',
    trinketType: 'Gladiator',
    trinketCooldownSeconds: 120,
    ccInstances,
    trinketUseTimes: [],
    missedTrinketWindows: [],
  };
}

function makeCCInstance(
  atSeconds: number,
  durationSeconds: number,
  trinketState: 'used' | 'available_unused' | 'on_cooldown' | 'passive_trinket' = 'on_cooldown',
  overrides: Partial<IPlayerCCTrinketSummary['ccInstances'][number]> = {},
): IPlayerCCTrinketSummary['ccInstances'][number] {
  return {
    atSeconds,
    durationSeconds,
    spellId: '853',
    spellName: 'Hammer of Justice',
    sourceName: 'EnemyA',
    sourceSpec: 'Ret Paladin',
    damageTakenDuring: 50_000,
    trinketState,
    drInfo: null,
    distanceYards: null,
    losBlocked: null,
    ...overrides,
  };
}

// ─── getEnemyStateAtTime ───────────────────────────────────────────────────────

describe('getEnemyStateAtTime', () => {
  it('returns "No coordinated burst detected in this window" when timeline is empty and no peak', () => {
    const result = getEnemyStateAtTime(60, makeTimeline());
    expect(result).toBe('No coordinated burst detected in this window');
  });

  it('includes peak damage in fallback string when no burst but peakDamage provided', () => {
    const result = getEnemyStateAtTime(60, makeTimeline(), 200_000);
    expect(result).toContain('No coordinated burst detected');
    expect(result).toContain('200k');
  });

  it('returns aligned burst description when a burst window contains the time', () => {
    const burst = makeBurstWindow(55, 80, 7.5, 'High', [
      { playerName: 'EnemyA', spellName: 'Icy Veins', spellId: '12472' },
    ]);
    const result = getEnemyStateAtTime(60, makeTimeline([burst]));
    expect(result).toContain('Aligned burst');
    expect(result).toContain('High');
    expect(result).toContain('EnemyA: Icy Veins');
  });

  it('picks the burst with the highest dangerScore when multiple windows match', () => {
    const lowBurst = makeBurstWindow(50, 75, 4.0, 'Low', [{ playerName: 'EnemyA', spellName: 'SpellA', spellId: '1' }]);
    const highBurst = makeBurstWindow(55, 80, 9.5, 'Critical', [
      { playerName: 'EnemyB', spellName: 'SpellB', spellId: '2' },
    ]);
    const result = getEnemyStateAtTime(60, makeTimeline([lowBurst, highBurst]));
    expect(result).toContain('Critical');
    expect(result).toContain('EnemyB: SpellB');
    expect(result).not.toContain('EnemyA: SpellA');
  });

  it('matches burst window starting within 5s after the moment (fromSeconds <= timeSeconds + 5)', () => {
    // fromSeconds = 63, timeSeconds = 60 → 63 <= 65 ✓; toSeconds = 80 >= 60 - 15 = 45 ✓
    const burst = makeBurstWindow(63, 80, 6.0, 'High', [{ playerName: 'EnemyA', spellName: 'SpellA', spellId: '1' }]);
    const result = getEnemyStateAtTime(60, makeTimeline([burst]));
    expect(result).toContain('Aligned burst');
  });

  it('matches burst window ending within 15s before the moment (toSeconds >= timeSeconds - 15)', () => {
    // fromSeconds = 40, toSeconds = 50, timeSeconds = 60 → toSeconds 50 >= 45 ✓
    const burst = makeBurstWindow(40, 50, 6.0, 'High', [{ playerName: 'EnemyA', spellName: 'SpellA', spellId: '1' }]);
    const result = getEnemyStateAtTime(60, makeTimeline([burst]));
    expect(result).toContain('Aligned burst');
  });

  it('does NOT match burst window that ended more than 15s before the moment', () => {
    // toSeconds = 44, timeSeconds = 60 → 44 >= 45 is false → no match
    const burst = makeBurstWindow(30, 44, 6.0, 'High', [{ playerName: 'EnemyA', spellName: 'SpellA', spellId: '1' }]);
    const result = getEnemyStateAtTime(60, makeTimeline([burst]));
    expect(result).not.toContain('Aligned burst');
  });

  it('falls back to individual offensive CDs with cooldown >= 90s when no aligned burst', () => {
    const timeline = makeTimeline(
      [],
      [
        {
          playerName: 'EnemyA',
          specName: 'Frost Mage',
          offensiveCDs: [
            {
              spellId: '12472',
              spellName: 'Icy Veins',
              castTimeSeconds: 55,
              buffEndSeconds: 75,
              cooldownSeconds: 120,
              availableAgainAtSeconds: 175,
            },
          ],
        },
      ],
    );
    const result = getEnemyStateAtTime(60, timeline);
    expect(result).toContain('Individual offensive CDs near this window');
    expect(result).toContain('EnemyA: Icy Veins');
  });

  it('ignores individual offensive CDs with cooldown < 90s', () => {
    const timeline = makeTimeline(
      [],
      [
        {
          playerName: 'EnemyA',
          specName: 'Frost Mage',
          offensiveCDs: [
            {
              spellId: '1234',
              spellName: 'Frostbolt',
              castTimeSeconds: 55,
              buffEndSeconds: 56,
              cooldownSeconds: 60,
              availableAgainAtSeconds: 115,
            },
          ],
        },
      ],
    );
    const result = getEnemyStateAtTime(60, timeline);
    expect(result).not.toContain('Frostbolt');
    expect(result).toContain('No coordinated burst detected');
  });

  it('ignores individual CDs cast more than 15s before the moment', () => {
    const timeline = makeTimeline(
      [],
      [
        {
          playerName: 'EnemyA',
          specName: 'Frost Mage',
          offensiveCDs: [
            {
              spellId: '12472',
              spellName: 'Icy Veins',
              castTimeSeconds: 40,
              buffEndSeconds: 60,
              cooldownSeconds: 120,
              availableAgainAtSeconds: 160,
            },
          ],
        },
      ],
    );
    // 40 < 60 - 15 = 45 → outside window
    const result = getEnemyStateAtTime(60, timeline);
    expect(result).not.toContain('Individual offensive CDs');
  });
});

// ─── getOwnerCDsAvailable ─────────────────────────────────────────────────────

describe('getOwnerCDsAvailable', () => {
  it('returns fallback string for empty cooldown list', () => {
    const result = getOwnerCDsAvailable(60, []);
    expect(result).toBe('No major CD data for log owner');
  });

  it('shows neverUsed CD as "never used — available since match start"', () => {
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      neverUsed: true,
      casts: [],
    });
    const result = getOwnerCDsAvailable(60, [cd]);
    expect(result).toContain('Barkskin');
    expect(result).toContain('never used');
    expect(result).toContain('Available:');
  });

  it('shows CD with no casts before now as "not yet used"', () => {
    // Cast at 80s, timeSeconds = 60 → cast is after now, not counted
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      casts: [{ timeSeconds: 80 }],
    });
    const result = getOwnerCDsAvailable(60, [cd]);
    expect(result).toContain('not yet used');
    expect(result).toContain('Available:');
  });

  it('shows CD that is ready (readyAt <= timeSeconds) with ready-since timestamp', () => {
    // Cast at 20s, cooldown 30s → readyAt = 50s ≤ 60s → available
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 30,
      casts: [{ timeSeconds: 20 }],
    });
    const result = getOwnerCDsAvailable(60, [cd]);
    expect(result).toContain('ready since');
    expect(result).toContain('Available:');
  });

  it('shows CD still on cooldown (readyAt > timeSeconds) with expected-ready timestamp', () => {
    // Cast at 40s, cooldown 60s → readyAt = 100s > 60s → on cooldown
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      casts: [{ timeSeconds: 40 }],
    });
    const result = getOwnerCDsAvailable(60, [cd]);
    expect(result).toContain('on CD until');
    expect(result).toContain('On cooldown:');
  });

  it('includes both Available and On cooldown sections when mix of states exist', () => {
    const availCD = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 30,
      casts: [{ timeSeconds: 20 }],
    });
    const onCdCD = makeCooldown({
      spellName: 'Ironbark',
      tag: 'Defensive',
      cooldownSeconds: 60,
      casts: [{ timeSeconds: 40 }],
    });
    const result = getOwnerCDsAvailable(60, [availCD, onCdCD]);
    expect(result).toContain('Available:');
    expect(result).toContain('On cooldown:');
    expect(result).toContain('Barkskin');
    expect(result).toContain('Ironbark');
  });

  it('uses only the most recent cast before timeSeconds for CD computation', () => {
    // Two casts: 10s and 40s. At timeSeconds=60 with 60s CD, last cast is 40s → readyAt=100s → on CD
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      casts: [{ timeSeconds: 10 }, { timeSeconds: 40 }],
    });
    const result = getOwnerCDsAvailable(60, [cd]);
    expect(result).toContain('on CD until');
    expect(result).toContain('1:40'); // readyAt = 40 + 60 = 100s → 1:40
  });
});

// ─── findContributingDeath ─────────────────────────────────────────────────────

describe('findContributingDeath', () => {
  const deaths = [
    { spec: 'Holy Priest', name: 'Healer', atSeconds: 100 },
    { spec: 'Frost Mage', name: 'Mage', atSeconds: 120 },
  ];

  it('returns undefined for empty deaths array', () => {
    expect(findContributingDeath(50, [])).toBeUndefined();
  });

  it('returns death that occurs within 45s after moment', () => {
    const result = findContributingDeath(56, deaths); // 100 - 56 = 44s ≤ 45 ✓
    expect(result).toBeDefined();
    expect(result?.spec).toBe('Holy Priest');
  });

  it('returns death at exactly 45s after moment (boundary)', () => {
    const result = findContributingDeath(55, deaths); // 100 - 55 = 45s ≤ 45 ✓
    expect(result).toBeDefined();
    expect(result?.spec).toBe('Holy Priest');
  });

  it('returns undefined when death is more than 45s after moment', () => {
    const result = findContributingDeath(54, deaths); // 100 - 54 = 46s > 45 → skip; 120 - 54 = 66 > 45 → skip
    expect(result).toBeUndefined();
  });

  it('returns undefined when the only death occurs exactly at moment time (not strictly after)', () => {
    // Isolated: only one death at exactly 100s; 100 > 100 is false → no match
    const singleDeath = [{ spec: 'Holy Priest', name: 'Healer', atSeconds: 100 }];
    const result = findContributingDeath(100, singleDeath);
    expect(result).toBeUndefined();
  });

  it('returns undefined when all deaths occurred before the moment', () => {
    // Death at 100s, moment at 110s → 100 > 110 is false → no match
    const pastDeath = [{ spec: 'Holy Priest', name: 'Healer', atSeconds: 100 }];
    expect(findContributingDeath(110, pastDeath)).toBeUndefined();
  });

  it('returns the first matching death when multiple match', () => {
    // Both 100 and 120 are within 45s of 75: 100-75=25, 120-75=45 ✓
    const result = findContributingDeath(75, deaths);
    expect(result?.spec).toBe('Holy Priest'); // first match
  });
});

// ─── buildDeathRootCauseTrace ─────────────────────────────────────────────────

describe('buildDeathRootCauseTrace', () => {
  const MATCH_START_MS = 1_000_000;

  it('returns empty array when there are no cooldowns, no CC, and no dyingUnit', () => {
    const result = buildDeathRootCauseTrace(60, [], undefined, undefined, MATCH_START_MS);
    expect(result).toEqual([]);
  });

  it('includes HP trajectory when dyingUnit has advancedActions', () => {
    const unit = makeUnit('player-1', {
      advancedActions: [
        makeAdvancedAction(MATCH_START_MS + 40_000, 0, 0, 100_000, 60_000), // at T-20s: 60%
        makeAdvancedAction(MATCH_START_MS + 50_000, 0, 0, 100_000, 40_000), // at T-10s: 40%
        makeAdvancedAction(MATCH_START_MS + 55_000, 0, 0, 100_000, 20_000), // at T-5s:  20%
      ],
    });
    const result = buildDeathRootCauseTrace(60, [], undefined, unit, MATCH_START_MS);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toContain('HP trajectory before death');
    expect(result[0]).toContain('20%'); // at T-5s
  });

  it('traces neverUsed CD as "NEVER USED — was available throughout the match"', () => {
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      neverUsed: true,
      casts: [],
    });
    const result = buildDeathRootCauseTrace(60, [cd], undefined, undefined, MATCH_START_MS);
    expect(result.some((t) => t.includes('NEVER USED') && t.includes('Barkskin'))).toBe(true);
  });

  it('traces CD not yet used before death as "not yet used — was available"', () => {
    // Cast at 80s is after deathTime=60s → no casts before death
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      casts: [{ timeSeconds: 80 }],
    });
    const result = buildDeathRootCauseTrace(60, [cd], undefined, undefined, MATCH_START_MS);
    expect(result.some((t) => t.includes('not yet used') && t.includes('Barkskin'))).toBe(true);
  });

  it('traces CD on cooldown at death with timing info', () => {
    // Cast at 20s, CD 60s → readyAt = 80s > 60s → ON COOLDOWN
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      casts: [{ timeSeconds: 20 }],
    });
    const result = buildDeathRootCauseTrace(60, [cd], undefined, undefined, MATCH_START_MS);
    expect(result.some((t) => t.includes('ON COOLDOWN') && t.includes('Barkskin'))).toBe(true);
    expect(result.some((t) => t.includes('40s before death'))).toBe(true); // 60 - 20 = 40s
  });

  it('traces CD ready at death but not pressed as "available at death time — not pressed"', () => {
    // Cast at 10s, CD 30s → readyAt = 40s ≤ 60s → available but not pressed
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 30,
      casts: [{ timeSeconds: 10 }],
    });
    const result = buildDeathRootCauseTrace(60, [cd], undefined, undefined, MATCH_START_MS);
    expect(result.some((t) => t.includes('available at death time') && t.includes('not pressed'))).toBe(true);
  });

  it('includes CC active near death with LoS-avoidable note when losBlocked=true', () => {
    const cc = makeCCInstance(52, 15, 'on_cooldown', { losBlocked: true });
    const ccSummary = makeCCTrinketSummary('HealerA', [cc]);
    const result = buildDeathRootCauseTrace(60, [], ccSummary, undefined, MATCH_START_MS);
    expect(result.some((t) => t.includes('LoS was available') && t.includes('avoidable'))).toBe(true);
  });

  it('includes CC near death with melee-range positioning note when distanceYards <= 8', () => {
    const cc = makeCCInstance(52, 15, 'on_cooldown', { distanceYards: 5 });
    const ccSummary = makeCCTrinketSummary('HealerA', [cc]);
    const result = buildDeathRootCauseTrace(60, [], ccSummary, undefined, MATCH_START_MS);
    expect(result.some((t) => t.includes('5yd') && t.includes('melee range'))).toBe(true);
  });

  it('does not include CC that ended before the 12s lookback window', () => {
    // CC ended at 47s (started 40s, duration 7s), death at 60s → 47 < 60 - 12 = 48 → outside window
    const cc = makeCCInstance(40, 7, 'on_cooldown');
    const ccSummary = makeCCTrinketSummary('HealerA', [cc]);
    const result = buildDeathRootCauseTrace(60, [], ccSummary, undefined, MATCH_START_MS);
    expect(result.every((t) => !t.includes('Hammer of Justice'))).toBe(true);
  });

  it('includes CC that overlaps into the 12s lookback window', () => {
    // CC started 55s, duration 10s → ends 65s; death at 60s. Started at 55 ≤ 60, ends at 65 ≥ 48 ✓
    const cc = makeCCInstance(55, 10, 'available_unused');
    const ccSummary = makeCCTrinketSummary('HealerA', [cc]);
    const result = buildDeathRootCauseTrace(60, [], ccSummary, undefined, MATCH_START_MS);
    expect(result.some((t) => t.includes('Hammer of Justice'))).toBe(true);
  });

  it('includes timing label from last cast when timingLabel is set', () => {
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      casts: [{ timeSeconds: 20, timingLabel: 'Reactive' as const, timingContext: 'no burst detected' }],
    });
    const result = buildDeathRootCauseTrace(60, [cd], undefined, undefined, MATCH_START_MS);
    expect(result.some((t) => t.includes('REACTIVE') && t.includes('no burst detected'))).toBe(true);
  });
});

// ─── buildKillMomentFields ─────────────────────────────────────────────────────

describe('buildKillMomentFields', () => {
  it('returns "on cooldown or already spent" trinket line when no CC near death', () => {
    const { mechanicalAvailability } = buildKillMomentFields(60, [], undefined, false, null);
    expect(mechanicalAvailability.some((m) => m.includes('on cooldown or already spent'))).toBe(true);
  });

  it('includes trinket-available line in mechAvail and interpretation when trinket was unused near death', () => {
    const cc = makeCCInstance(50, 20, 'available_unused'); // within 15s of death at 60
    const ccSummary = makeCCTrinketSummary('Player', [cc]);
    const { mechanicalAvailability, interpretation, tieredOptions } = buildKillMomentFields(
      60,
      [],
      ccSummary,
      false,
      null,
    );
    expect(mechanicalAvailability.some((m) => m.includes('not used'))).toBe(true);
    expect(interpretation.some((i) => i.includes('short survival window'))).toBe(true);
    expect(tieredOptions.realistic.length).toBeGreaterThan(0);
  });

  it('places defensive CD that was never used as "never used — available"', () => {
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      neverUsed: true,
      casts: [],
    });
    const { mechanicalAvailability } = buildKillMomentFields(60, [cd], undefined, false, null);
    expect(mechanicalAvailability.some((m) => m.includes('Barkskin') && m.includes('never used'))).toBe(true);
  });

  it('places defensive CD not yet used as "not yet used — available"', () => {
    // No casts at or before death
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      casts: [{ timeSeconds: 80 }],
    });
    const { mechanicalAvailability } = buildKillMomentFields(60, [cd], undefined, false, null);
    expect(mechanicalAvailability.some((m) => m.includes('Barkskin') && m.includes('not yet used'))).toBe(true);
  });

  it('places defensive CD on cooldown at death correctly', () => {
    // Cast at 20s, CD 60s → readyAt=80s > 60s → on CD
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      casts: [{ timeSeconds: 20 }],
    });
    const { mechanicalAvailability } = buildKillMomentFields(60, [cd], undefined, false, null);
    expect(mechanicalAvailability.some((m) => m.includes('Barkskin') && m.includes('on CD'))).toBe(true);
  });

  it('places defensive CD that was available at death as "available since"', () => {
    // Cast at 10s, CD 30s → readyAt=40s ≤ 60s → available
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 30,
      casts: [{ timeSeconds: 10 }],
    });
    const { mechanicalAvailability } = buildKillMomentFields(60, [cd], undefined, false, null);
    expect(mechanicalAvailability.some((m) => m.includes('Barkskin') && m.includes('available since'))).toBe(true);
  });

  it('skips non-defensive CDs in mechAvail', () => {
    const offCD = makeCooldown({
      spellName: 'Berserking',
      tag: 'Offensive',
      cooldownSeconds: 180,
      casts: [{ timeSeconds: 20 }],
    });
    const { mechanicalAvailability } = buildKillMomentFields(60, [offCD], undefined, false, null);
    expect(mechanicalAvailability.every((m) => !m.includes('Berserking'))).toBe(true);
  });

  it('populates tieredOptions.unavailable when all defensives are spent', () => {
    // Def CD cast at 20s, CD 60s → readyAt=80s > 60s → spent
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      casts: [{ timeSeconds: 20 }],
    });
    const { tieredOptions } = buildKillMomentFields(60, [cd], undefined, false, null);
    expect(tieredOptions.unavailable.length).toBeGreaterThan(0);
  });

  it('does NOT populate tieredOptions.unavailable when a defensive was never used (still available)', () => {
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      neverUsed: true,
      casts: [],
    });
    const { tieredOptions } = buildKillMomentFields(60, [cd], undefined, false, null);
    // neverUsed = never cast → .find returns undefined → not spent → allDefensivesSpent = false
    expect(tieredOptions.unavailable).toHaveLength(0);
  });

  it('populates tieredOptions.limited with melee-range CC note', () => {
    const cc = makeCCInstance(50, 15, 'on_cooldown', { distanceYards: 6 });
    const ccSummary = makeCCTrinketSummary('Player', [cc]);
    const { tieredOptions } = buildKillMomentFields(60, [], ccSummary, false, null);
    expect(tieredOptions.limited.some((l) => l.includes('melee'))).toBe(true);
  });

  describe('when constrainedTradePreceded=true', () => {
    it('adds "No direct defensive response" to interpretation', () => {
      const { interpretation } = buildKillMomentFields(60, [], undefined, true, null);
      expect(interpretation.some((i) => i.includes('No direct defensive response'))).toBe(true);
    });

    it('generates finalAssessment with macroOutcome', () => {
      const { finalAssessment } = buildKillMomentFields(60, [], undefined, true, null);
      expect(finalAssessment).toBeDefined();
      expect(finalAssessment?.macroOutcome).toContain('major defensive CDs committed');
    });

    it('adds micro-mistake for unused trinket in finalAssessment', () => {
      const cc = makeCCInstance(50, 15, 'available_unused');
      const ccSummary = makeCCTrinketSummary('Player', [cc]);
      const { finalAssessment } = buildKillMomentFields(60, [], ccSummary, true, null);
      expect(finalAssessment?.microMistakes.some((m) => m.includes('Trinket not used'))).toBe(true);
    });

    it('adds HP% note to macroOutcome when dyingHpPct is provided', () => {
      const { finalAssessment } = buildKillMomentFields(60, [], undefined, true, 35);
      expect(finalAssessment?.macroOutcome).toContain('35%');
    });
  });

  describe('when constrainedTradePreceded=false', () => {
    it('does NOT produce finalAssessment', () => {
      const { finalAssessment } = buildKillMomentFields(60, [], undefined, false, null);
      expect(finalAssessment).toBeUndefined();
    });

    it('lists spent defensive CDs in interpretation', () => {
      const cd = makeCooldown({
        spellName: 'Barkskin',
        tag: 'Defensive',
        cooldownSeconds: 60,
        casts: [{ timeSeconds: 20 }],
      });
      const { interpretation } = buildKillMomentFields(60, [cd], undefined, false, null);
      expect(interpretation.some((i) => i.includes('Major defensives spent') && i.includes('Barkskin'))).toBe(true);
    });
  });
});

// ─── identifyCriticalMoments ───────────────────────────────────────────────────

describe('identifyCriticalMoments', () => {
  const emptyTimeline = makeTimeline();
  const noFriends: any[] = [];

  function callIdentify(overrides: {
    isHealer?: boolean;
    cooldowns?: IMajorCooldownInfo[];
    enemyCDTimeline?: IEnemyCDTimeline;
    friendlyDeaths?: Array<{ spec: string; name: string; atSeconds: number }>;
    healingGaps?: IHealingGap[];
    panicDefensives?: IPanicDefensive[];
    overlappedDefensives?: IOverlappedDefensive[];
    ccTrinketSummaries?: IPlayerCCTrinketSummary[];
    peakDamagePressure5s?: number;
    durationSeconds?: number;
    friends?: any[];
    matchStartMs?: number;
  }) {
    return identifyCriticalMoments(
      overrides.isHealer ?? false,
      overrides.cooldowns ?? [],
      overrides.enemyCDTimeline ?? emptyTimeline,
      overrides.friendlyDeaths ?? [],
      overrides.healingGaps ?? [],
      overrides.panicDefensives ?? [],
      overrides.overlappedDefensives ?? [],
      overrides.ccTrinketSummaries ?? [],
      overrides.peakDamagePressure5s ?? 0,
      overrides.durationSeconds ?? 300,
      overrides.friends ?? noFriends,
      overrides.matchStartMs ?? 1_000_000,
    );
  }

  it('returns empty moments and constrainedTrade=false when there are no events', () => {
    const { moments, constrainedTrade } = callIdentify({});
    expect(moments).toHaveLength(0);
    expect(constrainedTrade).toBe(false);
  });

  it('produces a Kill moment for each friendly death', () => {
    const deaths = [{ spec: 'Holy Priest', name: 'HealerA', atSeconds: 90 }];
    const { moments } = callIdentify({ friendlyDeaths: deaths });
    const kill = moments.find((m) => m.roleLabel === 'Kill');
    expect(kill).toBeDefined();
    expect(kill?.title).toContain('Holy Priest');
    expect(kill?.isDeath).toBe(true);
    expect(kill?.impactScore).toBe(100);
    expect(kill?.impactLabel).toBe('Critical');
  });

  it('produces a Trade moment for a panic defensive', () => {
    const panic: IPanicDefensive = {
      timeSeconds: 60,
      casterSpec: 'Holy Priest',
      casterName: 'HealerA',
      spellName: 'Pain Suppression',
      spellId: '33206',
      targetName: 'DPS-A',
      targetSpec: 'Frost Mage',
    };
    const { moments } = callIdentify({ panicDefensives: [panic] });
    const panicMoment = moments.find((m) => m.title.includes('Panic defensive'));
    expect(panicMoment).toBeDefined();
    expect(panicMoment?.impactScore).toBe(60);
  });

  it('panic defensive becomes Setup when a friendly death follows within 45s', () => {
    const panic: IPanicDefensive = {
      timeSeconds: 60,
      casterSpec: 'Holy Priest',
      casterName: 'HealerA',
      spellName: 'Pain Suppression',
      spellId: '33206',
      targetName: 'DPS-A',
      targetSpec: 'Frost Mage',
    };
    const deaths = [{ spec: 'Holy Priest', name: 'HealerA', atSeconds: 95 }]; // 35s after panic
    const { moments } = callIdentify({ panicDefensives: [panic], friendlyDeaths: deaths });
    const panicMoment = moments.find((m) => m.title.includes('Panic defensive'));
    expect(panicMoment?.roleLabel).toBe('Setup');
  });

  it('produces a Moderate moment for an overlapped defensive', () => {
    const overlap: IOverlappedDefensive = {
      timeSeconds: 45,
      secondCastTimeSeconds: 47,
      targetUnitId: 'player-1',
      targetName: 'Tank',
      firstCasterSpec: 'Holy Priest',
      firstCasterName: 'HealerA',
      firstSpellName: 'Pain Suppression',
      firstSpellId: '33206',
      secondCasterSpec: 'Paladin_Holy',
      secondCasterName: 'HealerB',
      secondSpellName: 'Blessing of Sacrifice',
      secondSpellId: '6940',
      simultaneousSeconds: 6,
    };
    const { moments } = callIdentify({ overlappedDefensives: [overlap] });
    const overlapMoment = moments.find((m) => m.title.includes('Defensive overlap'));
    expect(overlapMoment).toBeDefined();
    expect(overlapMoment?.impactLabel).toBe('Moderate');
    expect(overlapMoment?.impactScore).toBe(50);
  });

  it('produces a healing gap moment for a healer (isHealer=true)', () => {
    const gap: IHealingGap = {
      fromSeconds: 40,
      toSeconds: 55,
      durationSeconds: 15,
      freeCastSeconds: 15,
      mostDamagedName: 'DPS-A',
      mostDamagedSpec: 'Frost Mage',
      mostDamagedAmount: 200_000,
    };
    const { moments } = callIdentify({ isHealer: true, healingGaps: [gap] });
    const gapMoment = moments.find((m) => m.title.includes('Healing gap'));
    expect(gapMoment).toBeDefined();
  });

  it('does NOT produce a healing gap moment when isHealer=false', () => {
    const gap: IHealingGap = {
      fromSeconds: 40,
      toSeconds: 55,
      durationSeconds: 15,
      freeCastSeconds: 15,
      mostDamagedName: 'DPS-A',
      mostDamagedSpec: 'Frost Mage',
      mostDamagedAmount: 200_000,
    };
    const { moments } = callIdentify({ isHealer: false, healingGaps: [gap] });
    expect(moments.every((m) => !m.title.includes('Healing gap'))).toBe(true);
  });

  it('suppresses healing gap when the gap is tied to a friendly death', () => {
    // Gap from 40–55, death at 50 → gap covers death → should NOT generate standalone moment
    const gap: IHealingGap = {
      fromSeconds: 40,
      toSeconds: 55,
      durationSeconds: 15,
      freeCastSeconds: 15,
      mostDamagedName: 'DPS-A',
      mostDamagedSpec: 'Frost Mage',
      mostDamagedAmount: 200_000,
    };
    const deaths = [{ spec: 'Frost Mage', name: 'DPS-A', atSeconds: 50 }];
    const { moments } = callIdentify({ isHealer: true, healingGaps: [gap], friendlyDeaths: deaths });
    const gapMoment = moments.find((m) => m.title.includes('Healing gap'));
    expect(gapMoment).toBeUndefined();
  });

  it('returns at most 5 moments sorted by impactScore descending', () => {
    // 6 panic defensives → all produce Trade moments at impactScore=60 each
    const panics: IPanicDefensive[] = [60, 65, 70, 75, 80, 85].map((t) => ({
      timeSeconds: t,
      casterSpec: 'Holy Priest',
      casterName: 'HealerA',
      spellName: 'Pain Suppression',
      spellId: '33206',
      targetName: 'DPS-A',
      targetSpec: 'Frost Mage',
    }));
    const { moments } = callIdentify({ panicDefensives: panics });
    expect(moments.length).toBeLessThanOrEqual(5);
  });

  it('sorted result puts Kill (100) above panic Trade (60)', () => {
    const panic: IPanicDefensive = {
      timeSeconds: 30,
      casterSpec: 'Holy Priest',
      casterName: 'HealerA',
      spellName: 'Pain Suppression',
      spellId: '33206',
      targetName: 'DPS-A',
      targetSpec: 'Frost Mage',
    };
    const deaths = [{ spec: 'Holy Priest', name: 'HealerA', atSeconds: 90 }];
    const { moments } = callIdentify({ panicDefensives: [panic], friendlyDeaths: deaths });
    expect(moments[0].roleLabel).toBe('Kill');
    expect(moments[0].impactScore).toBeGreaterThan(moments[1]?.impactScore ?? -Infinity);
  });

  describe('Constraint moment (constrained trade detection)', () => {
    it('generates a Constraint moment when burst≥5.0, defensive traded, short match, friendly death', () => {
      const burst = makeBurstWindow(15, 25, 6.0, 'High', [
        { playerName: 'EnemyA', spellName: 'Icy Veins', spellId: '12472' },
        { playerName: 'EnemyB', spellName: 'Vendetta', spellId: '79140' },
      ]);
      // Defensive CD traded into the burst (cast at 16s)
      const cd = makeCooldown({
        spellName: 'Barkskin',
        tag: 'Defensive',
        cooldownSeconds: 60,
        casts: [{ timeSeconds: 16 }], // inside [15-5, 25+5] = [10, 30]
      });
      // Match ends before CD recovers: 50s < 60s cooldown
      const deaths = [{ spec: 'Holy Priest', name: 'HealerA', atSeconds: 45 }];
      const { moments, constrainedTrade } = callIdentify({
        enemyCDTimeline: makeTimeline([burst]),
        cooldowns: [cd],
        friendlyDeaths: deaths,
        durationSeconds: 50,
      });
      expect(constrainedTrade).toBe(true);
      const constraintMoment = moments.find((m) => m.roleLabel === 'Constraint');
      expect(constraintMoment).toBeDefined();
      expect(constraintMoment?.title).toContain('Opening burst forced full defensive trade');
    });

    it('does NOT generate Constraint when burst dangerScore < 5.0', () => {
      const burst = makeBurstWindow(15, 25, 4.9, 'Low', [
        { playerName: 'EnemyA', spellName: 'Icy Veins', spellId: '12472' },
      ]);
      const cd = makeCooldown({
        spellName: 'Barkskin',
        tag: 'Defensive',
        cooldownSeconds: 60,
        casts: [{ timeSeconds: 16 }],
      });
      const deaths = [{ spec: 'Holy Priest', name: 'HealerA', atSeconds: 45 }];
      const { constrainedTrade, moments } = callIdentify({
        enemyCDTimeline: makeTimeline([burst]),
        cooldowns: [cd],
        friendlyDeaths: deaths,
        durationSeconds: 50,
      });
      expect(constrainedTrade).toBe(false);
      expect(moments.every((m) => m.roleLabel !== 'Constraint')).toBe(true);
    });

    it('does NOT generate Constraint when no friendly deaths', () => {
      const burst = makeBurstWindow(15, 25, 6.0, 'High', [
        { playerName: 'EnemyA', spellName: 'Icy Veins', spellId: '12472' },
      ]);
      const cd = makeCooldown({
        spellName: 'Barkskin',
        tag: 'Defensive',
        cooldownSeconds: 60,
        casts: [{ timeSeconds: 16 }],
      });
      const { constrainedTrade } = callIdentify({
        enemyCDTimeline: makeTimeline([burst]),
        cooldowns: [cd],
        friendlyDeaths: [],
        durationSeconds: 50,
      });
      expect(constrainedTrade).toBe(false);
    });

    it('does NOT generate Constraint when match is long enough to recover the CD', () => {
      const burst = makeBurstWindow(15, 25, 6.0, 'High', [
        { playerName: 'EnemyA', spellName: 'Icy Veins', spellId: '12472' },
      ]);
      const cd = makeCooldown({
        spellName: 'Barkskin',
        tag: 'Defensive',
        cooldownSeconds: 60,
        casts: [{ timeSeconds: 16 }],
      });
      const deaths = [{ spec: 'Holy Priest', name: 'HealerA', atSeconds: 80 }];
      const { constrainedTrade } = callIdentify({
        enemyCDTimeline: makeTimeline([burst]),
        cooldowns: [cd],
        friendlyDeaths: deaths,
        durationSeconds: 120, // 120 > 60s → recovery was possible
      });
      expect(constrainedTrade).toBe(false);
    });

    it('does NOT generate Constraint when no defensive CD was traded into the burst', () => {
      const burst = makeBurstWindow(15, 25, 6.0, 'High', [
        { playerName: 'EnemyA', spellName: 'Icy Veins', spellId: '12472' },
      ]);
      // No casts within burst window
      const cd = makeCooldown({
        spellName: 'Barkskin',
        tag: 'Defensive',
        cooldownSeconds: 60,
        casts: [{ timeSeconds: 5 }],
      });
      const deaths = [{ spec: 'Holy Priest', name: 'HealerA', atSeconds: 45 }];
      const { constrainedTrade } = callIdentify({
        enemyCDTimeline: makeTimeline([burst]),
        cooldowns: [cd],
        friendlyDeaths: deaths,
        durationSeconds: 50,
      });
      expect(constrainedTrade).toBe(false);
    });
  });
});

// ─── buildMatchFlow ────────────────────────────────────────────────────────────

describe('buildMatchFlow', () => {
  const noOwnerCDs: IMajorCooldownInfo[] = [];
  const noAllTeam: Array<{ player: any; cd: IMajorCooldownInfo }> = [];
  const noDeaths: Array<{ spec: string; atSeconds: number }> = [];

  function callBuildMatchFlow(overrides: {
    timeline?: IEnemyCDTimeline;
    ownerCooldowns?: IMajorCooldownInfo[];
    allTeamCooldownsWithPlayer?: Array<{ player: any; cd: IMajorCooldownInfo }>;
    friendlyDeaths?: Array<{ spec: string; atSeconds: number }>;
    durationSeconds?: number;
  }) {
    return buildMatchFlow(
      overrides.timeline ?? makeTimeline(),
      overrides.ownerCooldowns ?? noOwnerCDs,
      overrides.allTeamCooldownsWithPlayer ?? noAllTeam,
      overrides.friendlyDeaths ?? noDeaths,
      overrides.durationSeconds ?? 180,
    );
  }

  it('starts with MATCH FLOW header', () => {
    const lines = callBuildMatchFlow({});
    expect(lines[0]).toBe('MATCH FLOW:');
  });

  it('outputs "No coordinated enemy bursts" when no bursts in timeline', () => {
    const lines = callBuildMatchFlow({});
    expect(lines.join('\n')).toContain('No coordinated enemy bursts detected');
  });

  it('includes death spec in no-burst output when a friendly death exists', () => {
    const lines = callBuildMatchFlow({ friendlyDeaths: [{ spec: 'Holy Priest', atSeconds: 90 }] });
    expect(lines.join('\n')).toContain('Holy Priest');
  });

  it('outputs Opening Burst segment for a single burst', () => {
    const burst = makeBurstWindow(20, 35, 6.0, 'High', [
      { playerName: 'EnemyA', spellName: 'Icy Veins', spellId: '12472' },
    ]);
    const lines = callBuildMatchFlow({ timeline: makeTimeline([burst]) });
    const joined = lines.join('\n');
    expect(joined).toContain('Opening Burst');
    expect(joined).toContain('Icy Veins');
  });

  it('shows "No major defensive CDs traded" when no team defensives committed during burst', () => {
    const burst = makeBurstWindow(20, 35, 6.0, 'High', [
      { playerName: 'EnemyA', spellName: 'Icy Veins', spellId: '12472' },
    ]);
    const lines = callBuildMatchFlow({ timeline: makeTimeline([burst]) });
    expect(lines.join('\n')).toContain('No major defensive CDs traded into this burst');
  });

  it('shows traded defensive CDs when a team member commits one during burst', () => {
    const burst = makeBurstWindow(20, 35, 6.0, 'High', [
      { playerName: 'EnemyA', spellName: 'Icy Veins', spellId: '12472' },
    ]);
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      casts: [{ timeSeconds: 22 }],
    });
    const player = makeUnit('player-1', { spec: CombatUnitSpec.Druid_Restoration });
    const lines = callBuildMatchFlow({
      timeline: makeTimeline([burst]),
      allTeamCooldownsWithPlayer: [{ player, cd }],
    });
    expect(lines.join('\n')).toContain('Team responded');
    expect(lines.join('\n')).toContain('Barkskin');
  });

  it('warns about no recovery window when match duration < traded CD cooldown', () => {
    const burst = makeBurstWindow(20, 35, 6.0, 'High', [
      { playerName: 'EnemyA', spellName: 'Icy Veins', spellId: '12472' },
    ]);
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      casts: [{ timeSeconds: 22 }],
    });
    const player = makeUnit('player-1', { spec: CombatUnitSpec.Druid_Restoration });
    const lines = callBuildMatchFlow({
      timeline: makeTimeline([burst]),
      allTeamCooldownsWithPlayer: [{ player, cd }],
      durationSeconds: 50, // 50 < 60 → no recovery
    });
    expect(lines.join('\n')).toContain('did not allow recovery');
  });

  it('shows Post-Trade Window when there is meaningful gap after first burst', () => {
    const burst = makeBurstWindow(10, 25, 6.0, 'High', [
      { playerName: 'EnemyA', spellName: 'Icy Veins', spellId: '12472' },
    ]);
    const lines = callBuildMatchFlow({ timeline: makeTimeline([burst]), durationSeconds: 180 });
    expect(lines.join('\n')).toContain('Post-Trade Window');
  });

  it('shows Final Burst segment when two or more bursts exist', () => {
    const burst1 = makeBurstWindow(10, 25, 6.0, 'High', [
      { playerName: 'EnemyA', spellName: 'Icy Veins', spellId: '12472' },
    ]);
    const burst2 = makeBurstWindow(90, 105, 7.0, 'Critical', [
      { playerName: 'EnemyB', spellName: 'Combustion', spellId: '190319' },
    ]);
    const lines = callBuildMatchFlow({ timeline: makeTimeline([burst1, burst2]) });
    expect(lines.join('\n')).toContain('Final Burst');
    expect(lines.join('\n')).toContain('Combustion');
  });

  it('shows spent CDs at match end in final segment', () => {
    const burst = makeBurstWindow(20, 35, 6.0, 'High', [
      { playerName: 'EnemyA', spellName: 'Icy Veins', spellId: '12472' },
    ]);
    // Barkskin cast at 30s, CD 60s → readyAt=90s > match end 80s → on cooldown at end
    const cd = makeCooldown({
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      casts: [{ timeSeconds: 30 }],
    });
    const lines = callBuildMatchFlow({
      timeline: makeTimeline([burst]),
      ownerCooldowns: [cd],
      durationSeconds: 80,
    });
    expect(lines.join('\n')).toContain('Barkskin');
    expect(lines.join('\n')).toContain('on cooldown');
  });

  it('reports friendly death at end of final segment', () => {
    const burst = makeBurstWindow(10, 25, 6.0, 'High', [
      { playerName: 'EnemyA', spellName: 'Icy Veins', spellId: '12472' },
    ]);
    const lines = callBuildMatchFlow({
      timeline: makeTimeline([burst]),
      friendlyDeaths: [{ spec: 'Holy Priest', atSeconds: 80 }],
    });
    expect(lines.join('\n')).toContain('Holy Priest died');
  });

  it('reports "No friendly deaths — match ended in a win" when no deaths', () => {
    const burst = makeBurstWindow(10, 25, 6.0, 'High', [
      { playerName: 'EnemyA', spellName: 'Icy Veins', spellId: '12472' },
    ]);
    const lines = callBuildMatchFlow({ timeline: makeTimeline([burst]) });
    expect(lines.join('\n')).toContain('No friendly deaths');
  });
});

// ─── buildMatchArc ─────────────────────────────────────────────────────────────

describe('buildMatchArc', () => {
  const ownerUnit = makeUnit('owner', { spec: CombatUnitSpec.Priest_Holy, name: 'Healer' });

  function makeDefCD(castAtSeconds: number, cooldownSeconds = 180): ReturnType<typeof makeCooldown> {
    return makeCooldown({
      spellName: 'Apotheosis',
      tag: 'Defensive',
      cooldownSeconds,
      casts: [{ timeSeconds: castAtSeconds, timingLabel: 'Reactive', timingContext: '' }],
    });
  }

  function callBuildMatchArc(overrides: {
    timeline?: IEnemyCDTimeline;
    teamCDs?: Array<{ player: ReturnType<typeof makeUnit>; cd: IMajorCooldownInfo }>;
    deaths?: Array<{ spec: string; atSeconds: number }>;
    durationSeconds?: number;
    bracket?: string;
  }) {
    return buildMatchArc(
      overrides.timeline ?? makeTimeline(),
      overrides.teamCDs ?? [],
      overrides.deaths ?? [],
      overrides.durationSeconds ?? 210,
      overrides.bracket ?? '3v3',
    );
  }

  it('emits MATCH ARC header', () => {
    const lines = callBuildMatchArc({});
    expect(lines[0]).toBe('MATCH ARC:');
  });

  it('produces 3 phase lines for a normal match', () => {
    const burst = makeBurstWindow(15, 30, 6.5, 'High', [
      { playerName: 'EnemyA', spellName: 'Pillar of Frost', spellId: '51271' },
    ]);
    const defCD = makeDefCD(15);
    const lines = callBuildMatchArc({
      timeline: makeTimeline([burst]),
      teamCDs: [{ player: ownerUnit as any, cd: defCD }],
      deaths: [{ spec: 'Holy Priest', atSeconds: 170 }],
    });
    // Header + 3 phase lines = 4 total
    expect(lines.length).toBe(4);
    expect(lines[1]).toContain('Early');
    expect(lines[2]).toContain('Mid');
    expect(lines[3]).toContain('Late');
  });

  it('collapses to 2 phases when match duration < 90s', () => {
    const lines = callBuildMatchArc({
      durationSeconds: 70,
      deaths: [{ spec: 'Holy Priest', atSeconds: 55 }],
    });
    expect(lines.length).toBe(3); // header + 2 phases
    expect(lines[1]).toContain('Pressure');
    expect(lines[2]).toContain('Death');
  });

  it('collapses to 2 phases with Resolution when no death and match < 90s', () => {
    const lines = callBuildMatchArc({ durationSeconds: 60 });
    expect(lines.length).toBe(3);
    expect(lines[2]).toContain('Resolution');
  });

  it('win with no friendly deaths: still emits 3 phases', () => {
    const burst = makeBurstWindow(20, 35, 5.5, 'Moderate', [
      { playerName: 'EnemyA', spellName: 'Combustion', spellId: '190319' },
    ]);
    const defCD = makeDefCD(22);
    const lines = callBuildMatchArc({
      timeline: makeTimeline([burst]),
      teamCDs: [{ player: ownerUnit as any, cd: defCD }],
      durationSeconds: 180,
    });
    expect(lines.length).toBe(4);
    expect(lines[3]).toContain('Late');
  });

  it('no deaths + 3v3 + duration > 180s → Late mentions dampening', () => {
    const defCD = makeDefCD(30);
    const lines = callBuildMatchArc({
      teamCDs: [{ player: ownerUnit as any, cd: defCD }],
      durationSeconds: 210,
      bracket: '3v3',
    });
    expect(lines[3]).toContain('ampening');
  });

  it('no deaths + 2v2 + long duration → Late does not force dampening text', () => {
    const defCD = makeDefCD(30);
    const lines = callBuildMatchArc({
      teamCDs: [{ player: ownerUnit as any, cd: defCD }],
      durationSeconds: 210,
      bracket: '2v2',
    });
    // Should not say dampening for 2v2
    expect(lines[3]).not.toContain('ampening');
  });

  it('Late phase references friendly death spec', () => {
    const defCD = makeDefCD(20);
    const lines = callBuildMatchArc({
      teamCDs: [{ player: ownerUnit as any, cd: defCD }],
      deaths: [{ spec: 'Holy Priest', atSeconds: 150 }],
      durationSeconds: 165,
    });
    expect(lines[3]).toContain('Holy Priest');
  });

  it('no defensive CDs committed: Mid phase reflects that', () => {
    const lines = callBuildMatchArc({ durationSeconds: 180 });
    expect(lines[2]).toContain('No major defensive CDs committed');
  });
});

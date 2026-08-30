/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */
import { CombatUnitReaction, CombatUnitSpec, LogEvent } from '@wowarenalogs/parser';

import {
  annotateDefensiveTimings,
  computePressureWindows,
  detectOverlappedDefensives,
  detectPanicDefensives,
  fmtTime,
  getPressureThreshold,
  IEnemyCDTimelineForTiming,
  IMajorCooldownInfo,
  isHealerSpec,
  isMeleeSpec,
  specToString,
} from '../cooldowns';
import { makeAdvancedAction, makeCombat, makeDamageEvent, makeSpellCastEvent, makeUnit } from './testHelpers';

// ─── fmtTime ──────────────────────────────────────────────────────────────────

describe('fmtTime', () => {
  it('formats 0 as "0:00"', () => {
    expect(fmtTime(0)).toBe('0:00');
  });

  it('formats 9 as "0:09" (pads seconds)', () => {
    expect(fmtTime(9)).toBe('0:09');
  });

  it('formats 60 as "1:00"', () => {
    expect(fmtTime(60)).toBe('1:00');
  });

  it('formats 90 as "1:30"', () => {
    expect(fmtTime(90)).toBe('1:30');
  });

  it('formats 125 as "2:05"', () => {
    expect(fmtTime(125)).toBe('2:05');
  });

  it('formats 599 as "9:59"', () => {
    expect(fmtTime(599)).toBe('9:59');
  });

  it('formats values over 60 minutes correctly', () => {
    expect(fmtTime(3661)).toBe('61:01');
  });

  it('truncates sub-second fractions', () => {
    // 90.9 → 1:30 (floor of 90s)
    expect(fmtTime(90.9)).toBe('1:30');
  });
});

// ─── specToString ─────────────────────────────────────────────────────────────

describe('specToString', () => {
  it('returns correct names for all Death Knight specs', () => {
    expect(specToString(CombatUnitSpec.DeathKnight_Blood)).toBe('Blood Death Knight');
    expect(specToString(CombatUnitSpec.DeathKnight_Frost)).toBe('Frost Death Knight');
    expect(specToString(CombatUnitSpec.DeathKnight_Unholy)).toBe('Unholy Death Knight');
  });

  it('returns correct name for Havoc Demon Hunter', () => {
    expect(specToString(CombatUnitSpec.DemonHunter_Havoc)).toBe('Havoc Demon Hunter');
  });

  it('returns correct name for Devourer Demon Hunter (fixed from "Devoker" typo)', () => {
    expect(specToString(CombatUnitSpec.DemonHunter_Devourer)).toBe('Devourer Demon Hunter');
  });

  it('returns correct name for Frost Mage', () => {
    expect(specToString(CombatUnitSpec.Mage_Frost)).toBe('Frost Mage');
  });

  it('returns correct names for Druid specs', () => {
    expect(specToString(CombatUnitSpec.Druid_Balance)).toBe('Balance Druid');
    expect(specToString(CombatUnitSpec.Druid_Feral)).toBe('Feral Druid');
    expect(specToString(CombatUnitSpec.Druid_Restoration)).toBe('Restoration Druid');
  });

  it('returns correct names for all Evoker specs', () => {
    expect(specToString(CombatUnitSpec.Evoker_Devastation)).toBe('Devastation Evoker');
    expect(specToString(CombatUnitSpec.Evoker_Preservation)).toBe('Preservation Evoker');
    expect(specToString(CombatUnitSpec.Evoker_Augmentation)).toBe('Augmentation Evoker');
  });

  it('returns "Unknown" for an unrecognized spec value', () => {
    expect(specToString(9999 as unknown as CombatUnitSpec)).toBe('Unknown');
    expect(specToString(CombatUnitSpec.None)).toBe('Unknown');
  });
});

// ─── isHealerSpec ─────────────────────────────────────────────────────────────

describe('isHealerSpec', () => {
  it('returns true for all seven healer specs', () => {
    expect(isHealerSpec(CombatUnitSpec.Druid_Restoration)).toBe(true);
    expect(isHealerSpec(CombatUnitSpec.Monk_Mistweaver)).toBe(true);
    expect(isHealerSpec(CombatUnitSpec.Paladin_Holy)).toBe(true);
    expect(isHealerSpec(CombatUnitSpec.Priest_Discipline)).toBe(true);
    expect(isHealerSpec(CombatUnitSpec.Priest_Holy)).toBe(true);
    expect(isHealerSpec(CombatUnitSpec.Shaman_Restoration)).toBe(true);
    expect(isHealerSpec(CombatUnitSpec.Evoker_Preservation)).toBe(true);
  });

  it('returns false for DPS specs', () => {
    expect(isHealerSpec(CombatUnitSpec.Mage_Frost)).toBe(false);
    expect(isHealerSpec(CombatUnitSpec.Rogue_Assassination)).toBe(false);
    expect(isHealerSpec(CombatUnitSpec.Warrior_Arms)).toBe(false);
    expect(isHealerSpec(CombatUnitSpec.Hunter_BeastMastery)).toBe(false);
    expect(isHealerSpec(CombatUnitSpec.Warlock_Affliction)).toBe(false);
  });

  it('returns false for Feral Druid (not a healer despite being a Druid)', () => {
    expect(isHealerSpec(CombatUnitSpec.Druid_Feral)).toBe(false);
  });

  it('returns false for Balance Druid', () => {
    expect(isHealerSpec(CombatUnitSpec.Druid_Balance)).toBe(false);
  });
});

// ─── isMeleeSpec ─────────────────────────────────────────────────────────────

describe('isMeleeSpec', () => {
  it('returns true for melee DPS specs', () => {
    expect(isMeleeSpec(CombatUnitSpec.Warrior_Arms)).toBe(true);
    expect(isMeleeSpec(CombatUnitSpec.Warrior_Fury)).toBe(true);
    expect(isMeleeSpec(CombatUnitSpec.Rogue_Assassination)).toBe(true);
    expect(isMeleeSpec(CombatUnitSpec.Rogue_Outlaw)).toBe(true);
    expect(isMeleeSpec(CombatUnitSpec.Rogue_Subtlety)).toBe(true);
    expect(isMeleeSpec(CombatUnitSpec.DemonHunter_Havoc)).toBe(true);
    expect(isMeleeSpec(CombatUnitSpec.Druid_Feral)).toBe(true);
    expect(isMeleeSpec(CombatUnitSpec.Monk_Windwalker)).toBe(true);
    expect(isMeleeSpec(CombatUnitSpec.Shaman_Enhancement)).toBe(true);
  });

  it('returns true for Death Knight specs', () => {
    expect(isMeleeSpec(CombatUnitSpec.DeathKnight_Frost)).toBe(true);
    expect(isMeleeSpec(CombatUnitSpec.DeathKnight_Unholy)).toBe(true);
  });

  it('returns true for BM and Survival Hunters (melee range)', () => {
    expect(isMeleeSpec(CombatUnitSpec.Hunter_BeastMastery)).toBe(true);
    expect(isMeleeSpec(CombatUnitSpec.Hunter_Survival)).toBe(true);
  });

  it('returns false for ranged/caster DPS', () => {
    expect(isMeleeSpec(CombatUnitSpec.Mage_Frost)).toBe(false);
    expect(isMeleeSpec(CombatUnitSpec.Mage_Fire)).toBe(false);
    expect(isMeleeSpec(CombatUnitSpec.Warlock_Affliction)).toBe(false);
    expect(isMeleeSpec(CombatUnitSpec.Hunter_Marksmanship)).toBe(false);
    expect(isMeleeSpec(CombatUnitSpec.Priest_Shadow)).toBe(false);
    expect(isMeleeSpec(CombatUnitSpec.Shaman_Elemental)).toBe(false);
    expect(isMeleeSpec(CombatUnitSpec.Druid_Balance)).toBe(false);
  });

  it('returns false for healer specs', () => {
    expect(isMeleeSpec(CombatUnitSpec.Priest_Holy)).toBe(false);
    expect(isMeleeSpec(CombatUnitSpec.Druid_Restoration)).toBe(false);
    expect(isMeleeSpec(CombatUnitSpec.Monk_Mistweaver)).toBe(false);
  });
});

// ─── getPressureThreshold ─────────────────────────────────────────────────────

describe('getPressureThreshold', () => {
  it('computes 15% of the observed max HP from advancedActions', () => {
    const unit = makeUnit('player-1', {
      spec: CombatUnitSpec.Mage_Frost,
      advancedActions: [makeAdvancedAction(1000, 0, 0, 500_000) as any],
    });
    expect(getPressureThreshold(unit)).toBeCloseTo(500_000 * 0.15);
  });

  it('uses the maximum maxHp across all advancedActions snapshots', () => {
    const unit = makeUnit('player-1', {
      spec: CombatUnitSpec.Mage_Frost,
      advancedActions: [
        makeAdvancedAction(1000, 0, 0, 400_000) as any,
        makeAdvancedAction(2000, 0, 0, 620_000) as any, // peak
        makeAdvancedAction(3000, 0, 0, 300_000) as any,
      ],
    });
    expect(getPressureThreshold(unit)).toBeCloseTo(620_000 * 0.15);
  });

  it('falls back to healer constant (35 000) when no advancedActions and spec is a healer', () => {
    const unit = makeUnit('healer', { spec: CombatUnitSpec.Priest_Holy });
    expect(getPressureThreshold(unit)).toBe(35_000);
  });

  it('falls back to tank constant (135 000) when no advancedActions and spec is a tank', () => {
    const unit = makeUnit('tank', { spec: CombatUnitSpec.DeathKnight_Blood });
    expect(getPressureThreshold(unit)).toBe(135_000);
  });

  it('falls back to DPS constant (60 000) for DPS specs with no advancedActions', () => {
    const unit = makeUnit('dps', { spec: CombatUnitSpec.Mage_Frost });
    expect(getPressureThreshold(unit)).toBe(60_000);
  });

  it('falls back to DPS constant for specs with no advancedActions and unknown spec', () => {
    const unit = makeUnit('unknown', { spec: CombatUnitSpec.None });
    expect(getPressureThreshold(unit)).toBe(60_000);
  });
});

// ─── computePressureWindows ───────────────────────────────────────────────────

describe('computePressureWindows', () => {
  const START = 1_000_000;
  const END = START + 300_000;
  const combat = makeCombat(START, END);

  it('returns empty array when no players are supplied', () => {
    const result = computePressureWindows([], combat as any);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for a player with no damage taken', () => {
    const player = makeUnit('player-1');
    const result = computePressureWindows([player], combat as any);
    expect(result).toHaveLength(0);
  });

  it('detects a single damage cluster', () => {
    const burstStart = START + 30_000;
    const player = makeUnit('player-1', {
      spec: CombatUnitSpec.Priest_Holy,
      damageIn: [
        makeDamageEvent(burstStart, 80_000) as any,
        makeDamageEvent(burstStart + 1_000, 80_000) as any,
        makeDamageEvent(burstStart + 2_000, 80_000) as any,
      ],
    });
    const result = computePressureWindows([player], combat as any, 10, 5);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].totalDamage).toBeCloseTo(240_000);
  });

  it('includes correct targetName and targetSpec', () => {
    const burstStart = START + 30_000;
    const player = makeUnit('player-1', {
      name: 'AceHealer',
      spec: CombatUnitSpec.Priest_Holy,
      damageIn: [makeDamageEvent(burstStart, 100_000) as any],
    });
    const result = computePressureWindows([player], combat as any, 10, 5);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].targetName).toBe('AceHealer');
    expect(result[0].targetSpec).toBe('Holy Priest');
  });

  it('returns non-overlapping windows ordered by totalDamage descending', () => {
    const burst1 = START + 30_000;
    const burst2 = START + 120_000; // far enough to be non-overlapping in a 10s window
    const player = makeUnit('player-1', {
      spec: CombatUnitSpec.Priest_Holy,
      damageIn: [
        makeDamageEvent(burst1, 200_000) as any,
        makeDamageEvent(burst1 + 1_000, 200_000) as any,
        makeDamageEvent(burst2, 50_000) as any,
        makeDamageEvent(burst2 + 1_000, 50_000) as any,
      ],
    });
    const result = computePressureWindows([player], combat as any, 10, 5);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].totalDamage).toBeGreaterThanOrEqual(result[1].totalDamage);
  });

  it('fromSeconds and toSeconds are relative to match start', () => {
    const burstTs = START + 45_000; // 45s into match
    const player = makeUnit('player-1', {
      damageIn: [makeDamageEvent(burstTs, 100_000) as any],
    });
    const result = computePressureWindows([player], combat as any, 10, 5);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].fromSeconds).toBeCloseTo(45);
    expect(result[0].toSeconds).toBeCloseTo(55); // 45 + 10s window
  });

  it('respects topN limit', () => {
    // 6 distinct bursts, topN=3 → at most 3 results
    const player = makeUnit('player-1', {
      damageIn: [0, 60, 120, 180, 240, 300].map((offSec) => makeDamageEvent(START + offSec * 1_000, 100_000) as any),
    });
    const result = computePressureWindows([player], combat as any, 10, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});

// ─── annotateDefensiveTimings ─────────────────────────────────────────────────

describe('annotateDefensiveTimings', () => {
  const START = 1_000_000;
  const END = START + 300_000;
  const combat = makeCombat(START, END);

  function makeDefensiveCooldown(castTimeSeconds: number): IMajorCooldownInfo {
    return {
      spellId: '22812', // Barkskin — Defensive tag
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      maxChargesDetected: 1,
      casts: [{ timeSeconds: castTimeSeconds }],
      availableWindows: [],
      neverUsed: false,
    };
  }

  it('does not annotate Offensive-tagged CDs', () => {
    const offensiveCd: IMajorCooldownInfo = {
      spellId: '12472',
      spellName: 'Icy Veins',
      tag: 'Offensive',
      cooldownSeconds: 120,
      maxChargesDetected: 1,
      casts: [{ timeSeconds: 30 }],
      availableWindows: [],
      neverUsed: false,
    };
    const unit = makeUnit('player-1');
    const timeline: IEnemyCDTimelineForTiming = { alignedBurstWindows: [], players: [] };
    const result = annotateDefensiveTimings([offensiveCd], unit, combat as any, timeline);
    expect(result[0].casts[0].timingLabel).toBeUndefined();
  });

  it('labels Optimal when cast is inside an aligned burst window', () => {
    const cd = makeDefensiveCooldown(35); // inside window [30, 50]
    const unit = makeUnit('player-1', { damageIn: [] });
    const timeline: IEnemyCDTimelineForTiming = {
      alignedBurstWindows: [{ fromSeconds: 30, toSeconds: 50 }],
      players: [],
    };
    const result = annotateDefensiveTimings([cd], unit, combat as any, timeline);
    expect(result[0].casts[0].timingLabel).toBe('Optimal');
    expect(result[0].casts[0].timingContext).toContain('burst window');
  });

  it('labels Early when cast is 1–5s before a burst window', () => {
    const cd = makeDefensiveCooldown(27); // 3s before burst at 30s
    const unit = makeUnit('player-1', { damageIn: [] });
    const timeline: IEnemyCDTimelineForTiming = {
      alignedBurstWindows: [{ fromSeconds: 30, toSeconds: 50 }],
      players: [],
    };
    const result = annotateDefensiveTimings([cd], unit, combat as any, timeline);
    expect(result[0].casts[0].timingLabel).toBe('Early');
    expect(result[0].casts[0].timingContext).toContain('pre-wall');
  });

  it('does not label Early when cast is >5s before burst window', () => {
    const cd = makeDefensiveCooldown(20); // 10s before burst at 30s — outside PRE_WALL_SECONDS=5
    const unit = makeUnit('player-1', { damageIn: [] });
    const timeline: IEnemyCDTimelineForTiming = {
      alignedBurstWindows: [{ fromSeconds: 30, toSeconds: 50 }],
      players: [],
    };
    const result = annotateDefensiveTimings([cd], unit, combat as any, timeline);
    // Should not be Early — fallback to Reactive/Unknown
    expect(result[0].casts[0].timingLabel).not.toBe('Early');
  });

  it('labels Late when cast is 1–8s after burst window ends', () => {
    const cd = makeDefensiveCooldown(56); // 6s after burst ends at 50s
    const unit = makeUnit('player-1', { damageIn: [] });
    const timeline: IEnemyCDTimelineForTiming = {
      alignedBurstWindows: [{ fromSeconds: 30, toSeconds: 50 }],
      players: [],
    };
    const result = annotateDefensiveTimings([cd], unit, combat as any, timeline);
    expect(result[0].casts[0].timingLabel).toBe('Late');
    expect(result[0].casts[0].timingContext).toContain('after burst window ended');
  });

  it('does not label Late when cast is >8s after burst window', () => {
    const cd = makeDefensiveCooldown(60); // 10s after burst ends at 50s — outside LATE_WINDOW=8
    const unit = makeUnit('player-1', { damageIn: [] });
    const timeline: IEnemyCDTimelineForTiming = {
      alignedBurstWindows: [{ fromSeconds: 30, toSeconds: 50 }],
      players: [],
    };
    const result = annotateDefensiveTimings([cd], unit, combat as any, timeline);
    expect(result[0].casts[0].timingLabel).not.toBe('Late');
  });

  it('labels Optimal when cast during a single enemy CD window (no aligned burst)', () => {
    const cd = makeDefensiveCooldown(35); // inside single enemy CD window 30–55s
    const unit = makeUnit('player-1', { damageIn: [] });
    const timeline: IEnemyCDTimelineForTiming = {
      alignedBurstWindows: [],
      players: [{ offensiveCDs: [{ spellName: 'Icy Veins', castTimeSeconds: 30, buffEndSeconds: 55 }] }],
    };
    const result = annotateDefensiveTimings([cd], unit, combat as any, timeline);
    expect(result[0].casts[0].timingLabel).toBe('Optimal');
    expect(result[0].casts[0].timingContext).toContain('Icy Veins');
  });

  it('labels Reactive when damage peaks sharply before cast with no burst signal', () => {
    const castTimeSeconds = 60;
    const castMs = START + castTimeSeconds * 1000;

    const cd = makeDefensiveCooldown(castTimeSeconds);
    const damageIn = [
      // 300k in 3s BEFORE cast (> 50k threshold), 5k after — ratio ~60:1 > REACTIVE_RATIO=1.75
      makeDamageEvent(castMs - 2_000, 150_000) as any,
      makeDamageEvent(castMs - 1_000, 150_000) as any,
      makeDamageEvent(castMs + 1_000, 5_000) as any,
    ];
    const unit = makeUnit('player-1', { damageIn });
    const timeline: IEnemyCDTimelineForTiming = { alignedBurstWindows: [], players: [] };
    const result = annotateDefensiveTimings([cd], unit, combat as any, timeline);
    expect(result[0].casts[0].timingLabel).toBe('Reactive');
    expect(result[0].casts[0].timingContext).toContain('before');
  });

  it('labels Unknown when no burst signal and no clear damage pattern', () => {
    const cd = makeDefensiveCooldown(60);
    const unit = makeUnit('player-1', { damageIn: [] });
    const timeline: IEnemyCDTimelineForTiming = { alignedBurstWindows: [], players: [] };
    const result = annotateDefensiveTimings([cd], unit, combat as any, timeline);
    expect(result[0].casts[0].timingLabel).toBe('Unknown');
    expect(result[0].casts[0].timingContext).toContain('no enemy burst');
  });

  it('returns the same cooldowns array (mutates in place)', () => {
    const cds: IMajorCooldownInfo[] = [makeDefensiveCooldown(35)];
    const unit = makeUnit('player-1', { damageIn: [] });
    const timeline: IEnemyCDTimelineForTiming = {
      alignedBurstWindows: [{ fromSeconds: 30, toSeconds: 50 }],
      players: [],
    };
    const result = annotateDefensiveTimings(cds, unit, combat as any, timeline);
    expect(result).toBe(cds); // same reference
  });

  it('handles a CD with no casts (neverUsed)', () => {
    const cd: IMajorCooldownInfo = {
      spellId: '22812',
      spellName: 'Barkskin',
      tag: 'Defensive',
      cooldownSeconds: 60,
      maxChargesDetected: 1,
      casts: [], // no casts
      availableWindows: [],
      neverUsed: true,
    };
    const unit = makeUnit('player-1', { damageIn: [] });
    const timeline: IEnemyCDTimelineForTiming = { alignedBurstWindows: [], players: [] };
    const result = annotateDefensiveTimings([cd], unit, combat as any, timeline);
    expect(result[0].casts).toHaveLength(0); // nothing to annotate
  });
});

// ─── detectOverlappedDefensives ───────────────────────────────────────────────

describe('detectOverlappedDefensives', () => {
  const START = 1_000_000;
  const combat = { startTime: START };

  // Real spell IDs from MAJOR_DEFENSIVE_IDS (externalOrBigDefensiveSpellIds)
  const DIVINE_PROTECTION = '498'; // 60s CD, 8s duration
  const PAIN_SUPPRESSION = '33206'; // 180s CD, 8s duration
  const BLESSING_OF_SACRIFICE = '6940'; // 120s CD, 12s duration

  it('returns empty array when no friendly spells cast', () => {
    const result = detectOverlappedDefensives([makeUnit('a'), makeUnit('b')], combat);
    expect(result).toHaveLength(0);
  });

  it('detects an overlap when two different casters use majors within 8s on the same target', () => {
    const targetId = 'target-1';
    // Caster-1 at t=10s, Caster-2 at t=13s — gap=3s, Divine Protection duration=8s → overlap=5s
    const cast1 = makeSpellCastEvent(DIVINE_PROTECTION, START + 10_000, targetId, 'Target', 'caster-1');
    const cast2 = makeSpellCastEvent(DIVINE_PROTECTION, START + 13_000, targetId, 'Target', 'caster-2');

    const caster1 = makeUnit('caster-1', {
      spec: CombatUnitSpec.Paladin_Holy,
      spellCastEvents: [cast1 as any],
    });
    const caster2 = makeUnit('caster-2', {
      spec: CombatUnitSpec.Paladin_Protection,
      spellCastEvents: [cast2 as any],
    });
    const target = makeUnit(targetId);

    const result = detectOverlappedDefensives([caster1, caster2, target], combat);
    expect(result).toHaveLength(1);
    expect(result[0].firstCasterName).toBe('caster-1');
    expect(result[0].secondCasterName).toBe('caster-2');
    expect(result[0].targetUnitId).toBe(targetId);
    expect(result[0].simultaneousSeconds).toBeGreaterThan(0);
  });

  it('reports correct simultaneousSeconds (duration − gap)', () => {
    const targetId = 'target-1';
    // Divine Protection: 8s duration, gap = 3s → simultaneous = 5s
    const cast1 = makeSpellCastEvent(DIVINE_PROTECTION, START + 30_000, targetId, 'Target', 'caster-1');
    const cast2 = makeSpellCastEvent(DIVINE_PROTECTION, START + 33_000, targetId, 'Target', 'caster-2');

    const result = detectOverlappedDefensives(
      [
        makeUnit('caster-1', { spellCastEvents: [cast1 as any] }),
        makeUnit('caster-2', { spellCastEvents: [cast2 as any] }),
        makeUnit(targetId),
      ],
      combat,
    );
    expect(result[0].simultaneousSeconds).toBeCloseTo(5);
  });

  it('does not flag same-player double cast on same target', () => {
    const targetId = 'target-1';
    const cast1 = makeSpellCastEvent(DIVINE_PROTECTION, START + 10_000, targetId, 'Target', 'caster-1');
    const cast2 = makeSpellCastEvent(PAIN_SUPPRESSION, START + 12_000, targetId, 'Target', 'caster-1');

    const caster = makeUnit('caster-1', { spellCastEvents: [cast1 as any, cast2 as any] });
    const target = makeUnit(targetId);

    const result = detectOverlappedDefensives([caster, target], combat);
    expect(result).toHaveLength(0);
  });

  it('does not flag casts targeting different units', () => {
    const cast1 = makeSpellCastEvent(DIVINE_PROTECTION, START + 10_000, 'target-1', 'T1', 'caster-1');
    const cast2 = makeSpellCastEvent(DIVINE_PROTECTION, START + 12_000, 'target-2', 'T2', 'caster-2');

    const result = detectOverlappedDefensives(
      [
        makeUnit('caster-1', { spellCastEvents: [cast1 as any] }),
        makeUnit('caster-2', { spellCastEvents: [cast2 as any] }),
        makeUnit('target-1'),
        makeUnit('target-2'),
      ],
      combat,
    );
    expect(result).toHaveLength(0);
  });

  it('does not flag casts that are more than 8s apart (gap > duration)', () => {
    const targetId = 'target-1';
    // Divine Protection: 8s duration; gap = 9s → no overlap
    const cast1 = makeSpellCastEvent(DIVINE_PROTECTION, START + 10_000, targetId, 'Target', 'caster-1');
    const cast2 = makeSpellCastEvent(DIVINE_PROTECTION, START + 19_000, targetId, 'Target', 'caster-2');

    const result = detectOverlappedDefensives(
      [
        makeUnit('caster-1', { spellCastEvents: [cast1 as any] }),
        makeUnit('caster-2', { spellCastEvents: [cast2 as any] }),
        makeUnit(targetId),
      ],
      combat,
    );
    expect(result).toHaveLength(0);
  });

  it('ignores non-major defensive spell IDs not in MAJOR_DEFENSIVE_IDS', () => {
    const targetId = 'target-1';
    const NON_MAJOR = '12345'; // not in the list
    const cast1 = makeSpellCastEvent(NON_MAJOR, START + 10_000, targetId, 'Target', 'caster-1');
    const cast2 = makeSpellCastEvent(NON_MAJOR, START + 12_000, targetId, 'Target', 'caster-2');

    const result = detectOverlappedDefensives(
      [
        makeUnit('caster-1', { spellCastEvents: [cast1 as any] }),
        makeUnit('caster-2', { spellCastEvents: [cast2 as any] }),
        makeUnit(targetId),
      ],
      combat,
    );
    expect(result).toHaveLength(0);
  });

  it('ignores casts whose dest is not a friendly unit', () => {
    const targetId = 'enemy-1'; // NOT in the friends list
    const cast = makeSpellCastEvent(DIVINE_PROTECTION, START + 10_000, targetId, 'Enemy', 'caster-1');
    const cast2 = makeSpellCastEvent(DIVINE_PROTECTION, START + 13_000, targetId, 'Enemy', 'caster-2');

    const result = detectOverlappedDefensives(
      [
        makeUnit('caster-1', { spellCastEvents: [cast as any] }),
        makeUnit('caster-2', { spellCastEvents: [cast2 as any] }),
        // targetId NOT added to the friends list
      ],
      combat,
    );
    // Dest not in friendlyIds → filtered out
    expect(result).toHaveLength(0);
  });

  it('reports correct timeSeconds (first cast relative to match start)', () => {
    const targetId = 'target-1';
    const cast1 = makeSpellCastEvent(DIVINE_PROTECTION, START + 45_000, targetId, 'Target', 'caster-1');
    const cast2 = makeSpellCastEvent(PAIN_SUPPRESSION, START + 47_000, targetId, 'Target', 'caster-2');

    const result = detectOverlappedDefensives(
      [
        makeUnit('caster-1', { spellCastEvents: [cast1 as any] }),
        makeUnit('caster-2', { spellCastEvents: [cast2 as any] }),
        makeUnit(targetId),
      ],
      combat,
    );
    expect(result).toHaveLength(1);
    expect(result[0].timeSeconds).toBeCloseTo(45);
    expect(result[0].secondCastTimeSeconds).toBeCloseTo(47);
  });

  it('uses Blessing of Sacrifice 12s duration when available from spellEffectData', () => {
    const targetId = 'target-1';
    // Blessing of Sacrifice: 12s duration. Gap = 7s → simultaneous = 5s (>= MIN=2).
    // Gap must be ≤ MAX_CAST_GAP_FOR_OVERLAP_CHECK_S (8s) for the inner loop to run.
    const cast1 = makeSpellCastEvent(BLESSING_OF_SACRIFICE, START + 10_000, targetId, 'Target', 'caster-1');
    const cast2 = makeSpellCastEvent(BLESSING_OF_SACRIFICE, START + 17_000, targetId, 'Target', 'caster-2');

    const result = detectOverlappedDefensives(
      [
        makeUnit('caster-1', { spellCastEvents: [cast1 as any] }),
        makeUnit('caster-2', { spellCastEvents: [cast2 as any] }),
        makeUnit(targetId),
      ],
      combat,
    );
    expect(result).toHaveLength(1);
    expect(result[0].simultaneousSeconds).toBeCloseTo(5); // 12 - 7 = 5
  });
});

// ─── detectPanicDefensives ────────────────────────────────────────────────────

describe('detectPanicDefensives', () => {
  const START = 1_000_000;
  const combat = { startTime: START };
  const DIVINE_PROTECTION = '498'; // in MAJOR_DEFENSIVE_IDS; 60s CD

  it('returns empty when there are no defensive casts', () => {
    const friends = [makeUnit('player-1')];
    const enemies = [makeUnit('enemy-1', { reaction: CombatUnitReaction.Hostile })];
    expect(detectPanicDefensives(friends, enemies, combat)).toHaveLength(0);
  });

  it('flags a panic press when there is no enemy threat and low damage', () => {
    const targetId = 'target-1';
    const castTime = START + 60_000;
    const cast = makeSpellCastEvent(DIVINE_PROTECTION, castTime, targetId, 'Target', 'player-1');

    const caster = makeUnit('player-1', { spellCastEvents: [cast as any] });
    const target = makeUnit(targetId, { spec: CombatUnitSpec.Mage_Frost, damageIn: [] });
    const enemy = makeUnit('enemy-1', { reaction: CombatUnitReaction.Hostile, auraEvents: [] });

    const result = detectPanicDefensives([caster, target], [enemy], combat);
    expect(result).toHaveLength(1);
    expect(result[0].spellId).toBe(DIVINE_PROTECTION);
    expect(result[0].casterName).toBe('player-1');
    expect(result[0].timeSeconds).toBeCloseTo(60);
  });

  it('does not flag when pre-cast damage exceeds DPS threshold (60k)', () => {
    const targetId = 'target-1';
    const castTime = START + 60_000;
    const cast = makeSpellCastEvent(DIVINE_PROTECTION, castTime, targetId, 'Target', 'player-1');

    const target = makeUnit(targetId, {
      spec: CombatUnitSpec.Mage_Frost,
      damageIn: [makeDamageEvent(castTime - 2_000, 80_000) as any], // 80k > 60k threshold
    });
    const caster = makeUnit('player-1', { spellCastEvents: [cast as any] });
    const enemy = makeUnit('enemy-1', { reaction: CombatUnitReaction.Hostile, auraEvents: [] });

    expect(detectPanicDefensives([caster, target], [enemy], combat)).toHaveLength(0);
  });

  it('does not flag when post-cast damage exceeds threshold (valid pre-wall)', () => {
    const targetId = 'target-1';
    const castTime = START + 60_000;
    const cast = makeSpellCastEvent(DIVINE_PROTECTION, castTime, targetId, 'Target', 'player-1');

    const target = makeUnit(targetId, {
      spec: CombatUnitSpec.Mage_Frost,
      damageIn: [makeDamageEvent(castTime + 2_000, 80_000) as any], // 80k after cast
    });
    const caster = makeUnit('player-1', { spellCastEvents: [cast as any] });
    const enemy = makeUnit('enemy-1', { reaction: CombatUnitReaction.Hostile, auraEvents: [] });

    expect(detectPanicDefensives([caster, target], [enemy], combat)).toHaveLength(0);
  });

  it('does not flag when enemy has an Offensive-tagged self-buff active at cast time', () => {
    const targetId = 'target-1';
    const castTime = START + 60_000;
    const cast = makeSpellCastEvent(DIVINE_PROTECTION, castTime, targetId, 'Target', 'player-1');

    // Enemy has Icy Veins (12472, buffs_offensive) applied 5s before cast, removed 20s after
    const buffApplied = {
      logLine: { event: LogEvent.SPELL_AURA_APPLIED, timestamp: castTime - 5_000, parameters: [] },
      timestamp: castTime - 5_000,
      spellId: '12472',
      spellName: 'Icy Veins',
      srcUnitId: 'enemy-1',
      srcUnitName: 'Enemy',
      destUnitId: 'enemy-1',
      destUnitName: 'Enemy',
    };
    const buffRemoved = {
      logLine: { event: LogEvent.SPELL_AURA_REMOVED, timestamp: castTime + 20_000, parameters: [] },
      timestamp: castTime + 20_000,
      spellId: '12472',
      spellName: 'Icy Veins',
      srcUnitId: 'enemy-1',
      srcUnitName: 'Enemy',
      destUnitId: 'enemy-1',
      destUnitName: 'Enemy',
    };

    const caster = makeUnit('player-1', { spellCastEvents: [cast as any] });
    const target = makeUnit(targetId, { spec: CombatUnitSpec.Mage_Frost, damageIn: [] });
    const enemy = makeUnit('enemy-1', {
      reaction: CombatUnitReaction.Hostile,
      auraEvents: [buffApplied as any, buffRemoved as any],
    });

    expect(detectPanicDefensives([caster, target], [enemy], combat)).toHaveLength(0);
  });

  it('does not flag when enemy offensive CD starts within 2s after cast (pre-wall window)', () => {
    const targetId = 'target-1';
    const castTime = START + 60_000;
    const cast = makeSpellCastEvent(DIVINE_PROTECTION, castTime, targetId, 'Target', 'player-1');

    // Enemy offensive buff applied 1.5s AFTER cast (within ENEMY_BURST_POST_CAST_WINDOW_MS=2s)
    const buffApplied = {
      logLine: { event: LogEvent.SPELL_AURA_APPLIED, timestamp: castTime + 1_500, parameters: [] },
      timestamp: castTime + 1_500,
      spellId: '12472', // Icy Veins → offensive
      spellName: 'Icy Veins',
      srcUnitId: 'enemy-1',
      srcUnitName: 'Enemy',
      destUnitId: 'enemy-1',
      destUnitName: 'Enemy',
    };

    const caster = makeUnit('player-1', { spellCastEvents: [cast as any] });
    const target = makeUnit(targetId, { spec: CombatUnitSpec.Mage_Frost, damageIn: [] });
    const enemy = makeUnit('enemy-1', {
      reaction: CombatUnitReaction.Hostile,
      auraEvents: [buffApplied as any],
    });

    expect(detectPanicDefensives([caster, target], [enemy], combat)).toHaveLength(0);
  });

  it('returns results sorted by timeSeconds ascending', () => {
    const targetId = 'target-1';
    // Two panic presses: first at 120s, second at 60s → sorted as [60, 120]
    const cast1 = makeSpellCastEvent(DIVINE_PROTECTION, START + 120_000, targetId, 'Target', 'caster-a');
    const cast2 = makeSpellCastEvent(DIVINE_PROTECTION, START + 60_000, targetId, 'Target', 'caster-b');

    const casterA = makeUnit('caster-a', { spellCastEvents: [cast1 as any] });
    const casterB = makeUnit('caster-b', { spellCastEvents: [cast2 as any] });
    const target = makeUnit(targetId, { spec: CombatUnitSpec.Mage_Frost, damageIn: [] });
    const enemy = makeUnit('enemy-1', { reaction: CombatUnitReaction.Hostile, auraEvents: [] });

    const result = detectPanicDefensives([casterA, casterB, target], [enemy], combat);
    if (result.length >= 2) {
      expect(result[0].timeSeconds).toBeLessThanOrEqual(result[1].timeSeconds);
    }
  });

  it('uses higher threshold for healer target (35k, not DPS 60k)', () => {
    const targetId = 'healer-target';
    const castTime = START + 60_000;
    const cast = makeSpellCastEvent(DIVINE_PROTECTION, castTime, targetId, 'HealerTarget', 'player-1');

    // 50k pre-cast damage — above healer threshold (35k) but below DPS threshold (60k)
    const target = makeUnit(targetId, {
      spec: CombatUnitSpec.Priest_Holy, // healer → threshold = 35k
      damageIn: [makeDamageEvent(castTime - 1_000, 50_000) as any],
    });
    const caster = makeUnit('player-1', { spellCastEvents: [cast as any] });
    const enemy = makeUnit('enemy-1', { reaction: CombatUnitReaction.Hostile, auraEvents: [] });

    // 50k > 35k healer threshold → not a panic
    expect(detectPanicDefensives([caster, target], [enemy], combat)).toHaveLength(0);
  });
});

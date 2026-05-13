import { CombatUnitReaction, CombatUnitSpec } from '@wowarenalogs/parser';

import { spellEffectData } from '../../data/spellEffectData';
import { IDamageBucket } from '../cooldowns';
import { formatKillAttemptWindowsForContext, reconstructEnemyCDTimeline } from '../enemyCDs';
import { isOffensiveSpell } from '../spellDanger';
import { makeCombat, makeSpellCastEvent, makeUnit } from './testHelpers';

// ─── Static data integrity ────────────────────────────────────────────────────

describe('offensive spell registry - confirmed cast IDs must be present', () => {
  it('includes Havoc DH Metamorphosis cast ID (191427) as offensive', () => {
    expect(isOffensiveSpell('191427')).toBe(true);
  });

  it('includes Enhancement Shaman Feral Spirit cast ID (51533) as offensive', () => {
    expect(isOffensiveSpell('51533')).toBe(true);
  });

  it('does not exclusively rely on stale Metamorphosis proc ID (162264)', () => {
    // 162264 has cooldownSeconds=999.999 in spellEffects → always filtered out by MAX_CD_SECONDS=360.
    // This test ensures we never add it back as the sole DH meta entry.
    const cd = spellEffectData['162264']?.cooldownSeconds ?? 0;
    expect(cd).toBeGreaterThan(360);
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
      spellCastEvents: [makeSpellCastEvent('596', START + 5_000, 'player-1')], // Prayer of Healing
    });
    const combat = makeCombat(START, END);
    const timeline = reconstructEnemyCDTimeline([healer], combat as never);
    expect(timeline.players).toHaveLength(0);
  });
});

describe('formatKillAttemptWindowsForContext', () => {
  function makeBurst(
    fromSeconds: number,
    toSeconds: number,
    spellName: string,
    dangerLabel: 'Low' | 'Moderate' | 'High' | 'Critical',
  ): import('../enemyCDs').IAlignedBurstWindow {
    return {
      fromSeconds,
      toSeconds,
      activeCDs: [{ playerName: 'Enemy', spellName, spellId: '12345' }],
      dangerScore: 2.0,
      dangerLabel,
      dampeningPct: 0,
      damageInWindow: 500_000,
      damageRatio: 1.0,
      healerCCed: false,
    };
  }

  function makeSpike(fromSeconds: number, totalDamage: number): IDamageBucket {
    return { fromSeconds, toSeconds: fromSeconds + 10, totalDamage, targetName: 'Healer', targetSpec: 'Resto Druid' };
  }

  it('returns no-windows message when burst windows array is empty', () => {
    const result = formatKillAttemptWindowsForContext([], []);
    expect(result).toEqual(['KILL ATTEMPT WINDOWS: None detected (no aligned enemy burst windows).']);
  });

  it('emits a kill attempt line for a burst window that has an overlapping spike', () => {
    const burst = makeBurst(14, 24, 'Combustion', 'High');
    const spike = makeSpike(14, 840_000); // 0.84M — above 300k threshold
    const result = formatKillAttemptWindowsForContext([burst], [spike]);
    expect(result[0]).toBe('KILL ATTEMPT WINDOWS (enemy burst CDs + confirmed damage spike):');
    const killLine = result.find((l) => l.includes('0:14'));
    expect(killLine).toBeDefined();
    expect(killLine).toContain('0:14–0:24');
    expect(killLine).toContain('[HIGH]');
    expect(killLine).toContain('0.84M');
    expect(killLine).toContain('Combustion');
    expect(killLine).toContain('Resto Druid');
  });

  it('does not emit a kill attempt line when spike is below threshold (300k)', () => {
    const burst = makeBurst(30, 40, 'Avenging Wrath', 'Moderate');
    const spike = makeSpike(30, 200_000); // 0.2M — below 300k threshold
    const result = formatKillAttemptWindowsForContext([burst], [spike]);
    expect(result.some((l) => l.includes('0:30'))).toBe(false);
    expect(result.some((l) => l.includes('1 burst window(s) had no confirmed spike'))).toBe(true);
  });

  it('notes unconfirmed burst windows separately from confirmed ones', () => {
    const confirmed = makeBurst(10, 20, 'Combustion', 'High');
    const unconfirmed = makeBurst(60, 70, 'Avenging Wrath', 'Moderate');
    const spike = makeSpike(10, 900_000); // only matches first burst
    const result = formatKillAttemptWindowsForContext([confirmed, unconfirmed], [spike]);
    expect(result.some((l) => l.includes('0:10'))).toBe(true);
    expect(result.some((l) => l.includes('0:60') || l.includes('1:00'))).toBe(false);
    expect(result.some((l) => l.includes('1 burst window(s) had no confirmed spike'))).toBe(true);
  });

  it('shows "no confirmed spike" message when all burst windows are unconfirmed', () => {
    const burst = makeBurst(30, 40, 'Avenging Wrath', 'Moderate');
    const result = formatKillAttemptWindowsForContext([burst], []);
    expect(result.some((l) => l.includes('No burst windows had a confirmed damage spike'))).toBe(true);
  });
});

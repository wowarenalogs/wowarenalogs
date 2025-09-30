import { CombatAbsorbAction } from '../src';
import { LoaderResults, loadLogFile } from './testLogLoader';

describe('parsing a log with disc priest shields', () => {
  const results: LoaderResults = {
    combats: [],
    malformedCombats: [],
    shuffleRounds: [],
    shuffles: [],
  };

  beforeAll(() => {
    const loaded = loadLogFile('hunter_priest_match.txt');
    results.combats = loaded.combats;
    results.malformedCombats = loaded.malformedCombats;
    results.shuffleRounds = loaded.shuffleRounds;
    results.shuffles = loaded.shuffles;
  });

  it('should allow consumers to examine all events', () => {
    expect(results.combats).toHaveLength(1);
    // Pattern 1: instanceof for events more specific than CombatAction
    const absorbs = results.combats[0].events.filter((e) => e instanceof CombatAbsorbAction) as CombatAbsorbAction[];
    expect(absorbs.length).toBe(78);
    expect(absorbs.filter((a) => a.absorbedAmount > 450000).length).toBe(7);

    // Pattern 2: events by name from logline values
    const castFailedEvents = results.combats[0].events.filter((e) => e.logLine.event === 'SPELL_CAST_FAILED');
    expect(castFailedEvents.length).toBe(45);
  });

  it('should count spell absorbs correctly', () => {
    // Disc priest Player-11-0E932E68,"Whitejudas-Tichondrius-US"
    const discPriestId = 'Player-11-0E932E68';
    const discPriestTeammateId = 'Player-11-0E6358FC';
    // teammate surv Player-11-0E6358FC,"Miahunt-Tichondrius-US"
    // opponents:
    // MM Toiphatjack Player-11-0E8D6834,"Tophatjack-Tichondrius-US"
    const enemyMMId = 'Player-11-0E8D6834';
    // Boomy Pepeggas Player-63-0CAF140F,"Pepeggas-Ysera-US"
    // const enemyBoomyId = 'Player-63-0CAF140F';

    // Absorbs out should only be counting shields the caster owns
    Object.keys(results.combats[0].units).forEach((k) => {
      results.combats[0].units[k].absorbsOut.forEach((c) => {
        expect(c.shieldOwnerUnitId).toBe(k);
      });
    });

    // Absorbs in should be counting all absorbs that prevent dmg on you
    Object.keys(results.combats[0].units).forEach((k) => {
      results.combats[0].units[k].absorbsIn.forEach((c) => {
        expect(c.destUnitId).toBe(k);
      });
    });

    // 8/31/2025 01:31:31.4909  SPELL_ABSORBED,Player-11-0E8D6834,"Tophatjack-Tichondrius-US",0x548,0x80000000,Player-11-0E6358FC,"Miahunt-Tichondrius-US",0x10512,0x80000008,257045,"속사",0x1,Player-11-0E932E68,"Whitejudas-Tichondrius-US",0x511,0x80000010,17,"신의 권능: 보호막",0x2,121934,506362,nil

    // enemyMMId casts 257045 (rapid fire) on discPriestTeammateId a shield cast by discPriestId absorbs it
    // with 121934 (power word shield)
    const sampleCast = results.combats[0].units[discPriestId].absorbsOut[28];

    expect(sampleCast.spellId).toBe('257045');
    expect(sampleCast.destUnitName).toBe('Miahunt-Tichondrius-US');
    expect(sampleCast.srcUnitName).toBe('Tophatjack-Tichondrius-US');
    expect(sampleCast.shieldSpellId).toBe('17');
    expect(sampleCast.shieldSpellName).toBe('신의 권능: 보호막');
    expect(sampleCast.shieldOwnerUnitName).toBe('Whitejudas-Tichondrius-US');

    // Total absorb by disc
    const totalAbs = results.combats[0].units[discPriestId].absorbsOut.reduce(
      (prev, cur) => prev + cur.absorbedAmount,
      0,
    );
    expect(totalAbs).toBe(12582429);

    // Total absorb-damage by discPriestTeammate
    const totalDamageAbs = results.combats[0].units[discPriestTeammateId].absorbsDamaged.reduce(
      (prev, cur) => prev + cur.absorbedAmount,
      0,
    );
    expect(totalDamageAbs).toBe(855664);

    expect(results.combats[0].units[enemyMMId].absorbsDamaged.length).toBe(38);
  });
});

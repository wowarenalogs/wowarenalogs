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

  xit('should allow consumers to examine all events', () => {
    expect(results.combats).toHaveLength(1);
    // Pattern 1: instanceof for events more specific than CombatAction
    const absorbs = results.combats[0].events.filter((e) => e instanceof CombatAbsorbAction) as CombatAbsorbAction[];
    expect(absorbs.length).toBe(198);
    expect(absorbs.filter((a) => a.absorbedAmount > 200).length).toBe(183);

    // Pattern 2: events by name from logline values
    const castFailedEvents = results.combats[0].events.filter((e) => e.logLine.event === 'SPELL_CAST_FAILED');
    expect(castFailedEvents.length).toBe(135);
  });

  xit('should count spell absorbs correctly', () => {
    // Disc priest 286d3193-c3bb-4033-b1a0-b3318a06e0d5, InvolvedGibbon
    // teammate ARMS xxx InternalSwift 2e292443-3689-451b-a125-d99e463ee255
    // opponents:
    // BM ExternalSwordtail c5f3ff0a-040a-4e88-a171-59d4ceca1a42
    // RET PromisingPigeon 28ba73a6-fc64-4a47-844e-5e0d813d5a49

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

    // ExternalSwordtail casts Flayed Shot on InternalSwift a shield cast by InvolvedGibbon absorbs it
    const sampleCast = results.combats[0].units['286d3193-c3bb-4033-b1a0-b3318a06e0d5'].absorbsOut[5];

    expect(sampleCast.shieldSpellName).toBe('Power Word: Shield');
    expect(sampleCast.destUnitName).toBe('InternalSwift');
    expect(sampleCast.srcUnitName).toBe('ExternalSwordtail');
    expect(sampleCast.shieldOwnerUnitName).toBe('InvolvedGibbon');

    // Total absorb by LiberalWildebeast
    const totalAbs = results.combats[0].units['286d3193-c3bb-4033-b1a0-b3318a06e0d5'].absorbsOut.reduce(
      (prev, cur) => prev + cur.absorbedAmount,
      0,
    );
    expect(totalAbs).toBe(97139);

    // Total absorb-damage by DearShark
    const totalDamageAbs = results.combats[0].units['2e292443-3689-451b-a125-d99e463ee255'].absorbsDamaged.reduce(
      (prev, cur) => prev + cur.absorbedAmount,
      0,
    );
    expect(totalDamageAbs).toBe(87929);
    expect(results.combats[0].units['2e292443-3689-451b-a125-d99e463ee255'].absorbsDamaged.length).toBe(37);
  });
});

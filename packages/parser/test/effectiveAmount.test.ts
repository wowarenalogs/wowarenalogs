import { LoaderResults, loadLogFile } from './testLogLoader';

describe('parsing a log with overheals and pets', () => {
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

  it('should count effective amount correctly', () => {
    // Disc priest 286d3193-c3bb-4033-b1a0-b3318a06e0d5, InvolvedGibbon
    // teammate ARMS xxx InternalSwift 2e292443-3689-451b-a125-d99e463ee255
    // opponents:
    // BM ExternalSwordtail c5f3ff0a-040a-4e88-a171-59d4ceca1a42
    // RET PromisingPigeon 28ba73a6-fc64-4a47-844e-5e0d813d5a49

    // Total absorb by InvolvedGibbon
    const totalAbs = results.combats[0].units['286d3193-c3bb-4033-b1a0-b3318a06e0d5'].absorbsOut.reduce(
      (prev, cur) => prev + cur.absorbedAmount,
      0,
    );
    expect(totalAbs).toBe(97139);
    // effective absorb by InvolvedGibbon
    const effectiveAbs = results.combats[0].units['286d3193-c3bb-4033-b1a0-b3318a06e0d5'].absorbsOut.reduce(
      (prev, cur) => prev + cur.effectiveAmount,
      0,
    );
    expect(effectiveAbs).toBe(97139);

    // Total heal by InvolvedGibbon
    const totalHeal = results.combats[0].units['286d3193-c3bb-4033-b1a0-b3318a06e0d5'].healOut.reduce(
      (prev, cur) => prev + cur.amount,
      0,
    );
    expect(totalHeal).toBe(495715);
    // effective heal by InvolvedGibbon
    const effectiveHeal = results.combats[0].units['286d3193-c3bb-4033-b1a0-b3318a06e0d5'].healOut.reduce(
      (prev, cur) => prev + cur.effectiveAmount,
      0,
    );
    expect(effectiveHeal).toBe(283960);

    // Total damage by InternalSwift
    const totalDamage = results.combats[0].units['2e292443-3689-451b-a125-d99e463ee255'].damageOut.reduce(
      (prev, cur) => prev + cur.amount,
      0,
    );
    expect(totalDamage).toBe(-355713);
    // Effective damage by InternalSwift
    const effectiveDamage = results.combats[0].units['2e292443-3689-451b-a125-d99e463ee255'].damageOut.reduce(
      (prev, cur) => prev + cur.effectiveAmount,
      0,
    );
    expect(effectiveDamage).toBe(-295070);
  });
});

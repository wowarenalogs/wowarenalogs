import { LoaderResults, loadLogFile } from './testLogLoader';

describe('parsing a log with conscious death', () => {
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

  xit('should return a single match', () => {
    expect(results.combats).toHaveLength(1);

    // TODO: DAMAGE_SPLIT isnt parsed yet
    // SWING_DAMAGE_LANDED is not parsed intentionally
    expect(results.combats[0].linesNotParsedCount).toBe(231);
  });

  xit('should have correct conscious death data', () => {
    expect(results.combats[0].units['2e292443-3689-451b-a125-d99e463ee255'].deathRecords).toHaveLength(1);

    expect(results.combats[0].units['c5f3ff0a-040a-4e88-a171-59d4ceca1a42'].consciousDeathRecords).toHaveLength(1);
  });
});

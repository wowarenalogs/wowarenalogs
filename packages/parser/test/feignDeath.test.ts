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

  it('should return a single match', () => {
    expect(results.combats).toHaveLength(1);

    // TODO: DAMAGE_SPLIT isnt parsed yet
    // SWING_DAMAGE_LANDED is not parsed intentionally
    expect(results.combats[0].linesNotParsedCount).toBe(42);
  });

  it('should have correct conscious death data', () => {
    expect(results.combats[0].units['Player-11-0E6358FC'].deathRecords).toHaveLength(0);
    expect(results.combats[0].units['Player-11-0E6358FC'].consciousDeathRecords).toHaveLength(1);

    expect(results.combats[0].units['Player-11-0E8D6834'].deathRecords).toHaveLength(1);
    expect(results.combats[0].units['Player-11-0E8D6834'].consciousDeathRecords).toHaveLength(1);
  });
});

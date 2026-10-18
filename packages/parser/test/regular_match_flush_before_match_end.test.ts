import { LoaderResults, loadLogFile } from './testLogLoader';

// hunter_priest_match.txt (a real 2v2) with its final ARENA_MATCH_END line removed: it must
// be reported as malformed, never decoded as a shuffle round.
describe('parsing a regular arena match whose final round is only recovered via flush', () => {
  const results: LoaderResults = {
    combats: [],
    malformedCombats: [],
    shuffleRounds: [],
    shuffles: [],
  };

  beforeAll(() => {
    const loaded = loadLogFile('regular_match_flush_before_match_end.txt');
    results.combats = loaded.combats;
    results.malformedCombats = loaded.malformedCombats;
    results.shuffleRounds = loaded.shuffleRounds;
    results.shuffles = loaded.shuffles;
  });

  it('should never misreport a regular match as a shuffle round', () => {
    expect(results.shuffleRounds).toHaveLength(0);
    expect(results.shuffles).toHaveLength(0);
  });

  it('should report it as malformed rather than guess a result', () => {
    expect(results.combats).toHaveLength(0);
    expect(results.malformedCombats).toHaveLength(1);
  });
});

import { LoaderResults, loadLogFile } from './testLogLoader';

// hunter_priest_match.txt with a synthetic ZONE_CHANGE / COMBATANT_INFO / ZONE_CHANGE
// segment spliced in front: the bad segment must be dropped, not kill the pipeline.
describe('parsing a log where a battleground-shaped segment contains unexpected COMBATANT_INFO', () => {
  const results: LoaderResults = {
    combats: [],
    malformedCombats: [],
    shuffleRounds: [],
    shuffles: [],
  };

  beforeAll(() => {
    const loaded = loadLogFile('battleground_segment_crash_recovery.txt');
    results.combats = loaded.combats;
    results.malformedCombats = loaded.malformedCombats;
    results.shuffleRounds = loaded.shuffleRounds;
    results.shuffles = loaded.shuffles;
  });

  it('should drop the bad segment but keep processing the real match after it', () => {
    expect(results.combats).toHaveLength(1);
    expect(results.malformedCombats).toHaveLength(0);
  });
});

import { LoaderResults, loadLogFile } from './testLogLoader';

// Regression test for a real bug: a regular (non-shuffle) 2v2/3v3 match whose
// ARENA_MATCH_END line never arrived (app/game closed right after the match ended) used to
// get routed through the solo-shuffle decoder, since isShuffleRound didn't check the bracket
// - it only checked "starts with ArenaMatchStart, doesn't end with ArenaMatchEnd". That let a
// real arena match's data be misreported as a ShuffleRound. This is `hunter_priest_match.txt`
// (a real 2v2) with its final ARENA_MATCH_END line removed.
//
// Unlike solo shuffle, a regular match's winner can't be reliably reconstructed from combat
// data alone when the closing line is missing (see the comment above validateRounds in
// segmentToCombat.ts), so the expectation here is that it's reported as malformed rather than
// guessed at - the important thing is that it must NOT show up as a shuffle round.
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

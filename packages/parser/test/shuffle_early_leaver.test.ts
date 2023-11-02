import _ from 'lodash';

import { LoaderResults, loadLogFile } from './testLogLoader';

/**
 * Match starts
 * round 1 ends with a unit death
 *
 * round 2 starts
 * round 2 ends with a unit death
 *
 * before another round starts, ARENA_MATCH_END is fired
 * this means someone left in the warmup
 *
 * the shuffle will have 2 valid rounds
 */
describe('parsing a log where someone leaves a shuffle match early', () => {
  const results: LoaderResults = {
    combats: [],
    malformedCombats: [],
    shuffleRounds: [],
    shuffles: [],
  };

  beforeAll(() => {
    const loaded = loadLogFile('shuffle_early_leaver.txt');
    results.combats = loaded.combats;
    results.malformedCombats = loaded.malformedCombats;
    results.shuffleRounds = loaded.shuffleRounds;
    results.shuffles = loaded.shuffles;
  });

  it('should return the rounds before the leaver left and no matches', () => {
    expect(results.shuffles).toHaveLength(1);
    expect(results.shuffleRounds).toHaveLength(2);
    expect(results.malformedCombats).toHaveLength(0);
    expect(results.combats).toHaveLength(0);
  });
});

/**
 * Match starts
 * round 1 ends with a unit death
 *
 * round 2 starts
 * ARENA_MATCH_END is fired
 * this means someone left in the match after warmup
 *
 * the shuffle will only have 1 valid round
 */
// describe('parsing a log where someone leaves a shuffle match in the middle of a live round', () => {
//   const results: LoaderResults = {
//     combats: [],
//     malformedCombats: [],
//     shuffleRounds: [],
//     shuffles: [],
//   };

//   beforeAll(() => {
//     const loaded = loadLogFile('shuffle_early_leaver_mid_round.txt');
//     results.combats = loaded.combats;
//     results.malformedCombats = loaded.malformedCombats;
//     results.shuffleRounds = loaded.shuffleRounds;
//     results.shuffles = loaded.shuffles;
//   });

//   it('should return the rounds before the leaver left and no matches', () => {
//     expect(results.shuffles).toHaveLength(1);
//     expect(results.shuffleRounds).toHaveLength(1);
//     expect(results.malformedCombats).toHaveLength(0);
//     expect(results.combats).toHaveLength(0);
//   });
// });

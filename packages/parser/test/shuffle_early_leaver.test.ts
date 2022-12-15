import _ from 'lodash';

import { LoaderResults, loadLogFile } from './testLogLoader';

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

  it('should return a single match', () => {
    expect(results.shuffles).toHaveLength(0);
    expect(results.shuffleRounds).toHaveLength(2);
    expect(results.malformedCombats).toHaveLength(0);
    expect(results.combats).toHaveLength(0);
  });
});

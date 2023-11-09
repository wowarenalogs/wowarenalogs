import _ from 'lodash';

import { LoaderResults, loadLogFile } from './testLogLoader';

describe('3v3 match parsing', () => {
  describe('parsing a short match', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
    };

    beforeAll(() => {
      const loaded = loadLogFile('bg_blitz.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    it('emit unhandled', () => {
      expect(results.combats).toHaveLength(1);
      expect(results.malformedCombats).toHaveLength(0);
    });
  });
});

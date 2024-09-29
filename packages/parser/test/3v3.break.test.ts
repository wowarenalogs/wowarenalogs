import _ from 'lodash';

import { LoaderResults, loadLogFile } from './testLogLoader';

describe('match parsing interrupted by a severe log error', () => {
  describe('parses errors but continues', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
      errors: [],
    };

    beforeAll(() => {
      const loaded = loadLogFile('two_match_synthetic.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    it('should return two matches and one parser error', () => {
      expect(results.errors).toHaveLength(1);
      expect(results.combats).toHaveLength(2);

      expect(results.malformedCombats).toHaveLength(0);
      expect(results.shuffleRounds).toHaveLength(0);
      expect(results.shuffles).toHaveLength(0);
    });
  });
});

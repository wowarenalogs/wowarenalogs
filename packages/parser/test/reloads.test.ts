import _ from 'lodash';

import { LoaderResults, loadLogFile } from './testLogLoader';

/**
 * This log has multiple instances of COMBAT_LOG_VERSION which could trick the parser into resetting internal state
 * or declaring a new WoW version entirely.
 */
describe('shuffle matches with a lot of commands to reload the ui done', () => {
  describe('parse all shuffles from a weird log', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
    };

    beforeAll(() => {
      const loaded = loadLogFile('shuffle_reloads.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    it('parses the right number of matches', () => {
      console.log(
        `shuffleRounds=${results.shuffleRounds.length} shuffleMatches=${results.shuffles.length} malf=${results.malformedCombats.length}`,
      );
      expect(results.malformedCombats).toHaveLength(0);
      expect(results.combats).toHaveLength(0);
      expect(results.malformedCombats).toHaveLength(0);
      expect(results.shuffleRounds.length).toBe(24);
      expect(results.shuffles.length).toBe(4);
    });
  });
});

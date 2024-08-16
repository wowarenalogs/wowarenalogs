/* eslint-disable no-console */
import { LoaderResults, loadLogFile } from './testLogLoader';

describe('solo shuffle tests', () => {
  describe('parsing a beta log', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
    };

    beforeAll(() => {
      const loaded = loadLogFile('beta.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    it('should return a single shuffle match with 6 rounds', () => {
      console.log(results.combats.length);
      console.log(`num events=${results.combats[0].events.length}`);
      console.log(`num raw lines=${results.combats[0].rawLines.length}`);
      console.log(`lines not parsed=${results.combats[0].linesNotParsedCount}`);
      expect(results.combats).toHaveLength(1);
    });
  });
});

import { LoaderResults, loadLogFile } from './testLogLoader';
import _ from 'lodash';

describe('parsing a log with conscious death', () => {
  const results: LoaderResults = {
    combats: [],
    malformedCombats: [],
    shuffleRounds: [],
    shuffles: [],
  };

  beforeAll(() => {
    const loaded = loadLogFile('testlog.txt');
    results.combats = loaded.combats;
    results.malformedCombats = loaded.malformedCombats;
    results.shuffleRounds = loaded.shuffleRounds;
    results.shuffles = loaded.shuffles;
  });

  it('should return a single match', () => {
    _.values(results.combats[0].units).forEach(u => {
      console.log(`${u.type} ${u.info?.specId}`);
    });
    expect(results.combats).toHaveLength(1);
  });
});

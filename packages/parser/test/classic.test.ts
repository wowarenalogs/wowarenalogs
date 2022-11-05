import { CombatResult, CombatUnitClass } from '../src/types';
import { LoaderResults, loadLogFile } from './testLogLoader';

/**
 * Tests for Classic files are defunct until we resume wow classic development
 */
describe('parsing a classic log file', () => {
  const results: LoaderResults = {
    combats: [],
    malformedCombats: [],
    shuffleRounds: [],
    shuffles: [],
  };

  beforeAll(() => {
    const loaded = loadLogFile('classic_matches.txt');
    results.combats = loaded.combats;
    results.malformedCombats = loaded.malformedCombats;
    results.shuffleRounds = loaded.shuffleRounds;
    results.shuffles = loaded.shuffles;
  });

  it('should return no malformed matches', () => {
    expect(results.malformedCombats).toHaveLength(0);
  });
  it('should return 5 matches', () => {
    expect(results.combats).toHaveLength(5);
  });

  it('should have 2 loss', () => {
    expect(results.combats.filter((c) => c.result === CombatResult.Lose)).toHaveLength(2);
  });
  it('should have 3 wins', () => {
    expect(results.combats.filter((c) => c.result === CombatResult.Win)).toHaveLength(3);
  });
  it('should have the correct class inferred', () => {
    expect(Object.values(results.combats[0].units).filter((u) => u.name === 'Assinoth-Whitemane')[0].class).toEqual(
      CombatUnitClass.Rogue,
    );
  });

  it('should have the correct bracket inferred', () => {
    expect(results.combats[0].startInfo.bracket).toEqual('2v2');
  });
});

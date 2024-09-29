import _ from 'lodash';

import { CombatUnitType } from '../src';
import { LoaderResults, loadLogFile } from './testLogLoader';

describe('2v2 bugged match parsing', () => {
  describe('parsing a match where the outsider bug occurs', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
      errors: [],
    };

    beforeAll(() => {
      const loaded = loadLogFile('test_outsider_bug.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    it('should filter out players that appear to be in the combat log by accident by downgrading them to NPC type', () => {
      expect(results.combats).toHaveLength(1);

      const combat = results.combats[0];
      const players = _.values(combat.units).filter((u) => u.type === CombatUnitType.Player);

      expect(players.length).toBe(4);
      expect(combat.units['Player-2073-09C9A32A'].type).toBe(CombatUnitType.NPC);
    });
  });
});

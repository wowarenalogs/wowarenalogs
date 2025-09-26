import _ from 'lodash';

import { CombatUnitType } from '../src';
import { LoaderResults, loadLogFile } from './testLogLoader';

describe('Bugged match parsing', () => {
  describe('parsing a match where the outsider bug occurs', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
    };

    beforeAll(() => {
      const loaded = loadLogFile('3v3_tww_1120_reduced_with_outsider.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    it('should filter out players that appear to be in the combat log by accident by downgrading them to NPC type', () => {
      expect(results.combats).toHaveLength(1);

      const combat = results.combats[0];
      const players = _.values(combat.units).filter((u) => u.type === CombatUnitType.Player);

      expect(players.length).toBe(6);
      expect(combat.units['Player-11-0EA1CFD3'].type).toBe(CombatUnitType.NPC);
    });
  });
});

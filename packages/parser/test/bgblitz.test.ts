import _ from 'lodash';

import { CombatUnitType } from '../src';
import { LoaderResults, loadLogFile } from './testLogLoader';

describe('BG Blitz parsing', () => {
  describe('Parsing an example bg blitz', () => {
    let results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
      activityStarts: [],
      battlegrounds: [],
    };

    beforeAll(() => {
      results = loadLogFile('bg_blitz.txt');
    });

    xit('Should emit activity start and bg info for battleground parses', () => {
      expect(results.shuffleRounds).toHaveLength(0);
      expect(results.shuffles).toHaveLength(0);
      expect(results.combats).toHaveLength(0);
      expect(results.malformedCombats).toHaveLength(0);
      expect(results.activityStarts).toHaveLength(1);
      expect(results.battlegrounds).toHaveLength(1);

      const players = Object.values(results.battlegrounds?.at(0)?.units || {}).filter(
        (e) => e.type === CombatUnitType.Player,
      );
      const bg = results.battlegrounds?.at(0);

      expect(bg?.dataType).toBe('BattlegroundCombat');
      expect(bg?.timezone).toBe('America/New_York');

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const samplePlayer = bg!.units['Player-3725-0AD4FBDB']; // ! here because it's okay to crash
      expect(samplePlayer.spellCastEvents.length + samplePlayer.damageOut.length + samplePlayer.healOut.length).toBe(
        1244,
      );

      expect(players).toHaveLength(16);
      expect(bg?.zoneInEvent.instanceId).toBe(998);
      expect(bg?.zoneOutEvent.instanceId).toBe(2444);
      expect(bg?.id).toBe('4e3ff617d1b17cb4dcfb01dd6839fccd');
    });
  });
});

import { CombatUnitClass, CombatUnitSpec } from '../src';
import { LoaderResults, loadLogFile } from './testLogLoader';

describe('parser tests', () => {
  describe('parsing a short match', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
    };

    beforeAll(() => {
      const loaded = loadLogFile('one_solo_shuffle.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    it('should return a single match', () => {
      expect(results.combats).toHaveLength(1);
    });

    //   it('reaction based fields should populate', () => {
    //     expect(combats[0].playerTeamId).toEqual('1');
    //     expect(combats[0].playerTeamRating).toEqual(0);
    //   });

    //   it('should buffer the raw log', () => {
    //     expect(combats[0].rawLines.length).toEqual(3641);
    //   });

    //   it('should count the lines it cant parse', () => {
    //     expect(combats[0].linesNotParsedCount).toEqual(386);
    //   });

    it('should have correct combatant metadata', () => {
      const combat = results.combats[0];
      const combatant = combat.units['Player-3684-0D80A58F'];
      expect(combatant.class).toEqual(CombatUnitClass.Warrior);
      expect(combatant.spec).toEqual(CombatUnitSpec.Warrior_Fury);
      expect(combatant.info?.specId).toEqual(CombatUnitSpec.Warrior_Fury);

      console.log(JSON.stringify(combatant.info?.talents, null, 2));
      const someTalent = combatant.info?.talents.find((a) => a?.id1 === 90394);
      expect(someTalent?.id2).toBe(112263);
      expect(someTalent?.count).toBe(1);

      const gloves = combatant.info?.equipment.find((i) => i.id === '192271');
      expect(gloves).not.toBeNull();

      expect(combatant.info?.teamId).toEqual('1');
      expect(combatant.info?.highestPvpTier).toEqual(4);
    });

    //   it('should parse arena start event', () => {
    //     const combat = combats[0];
    //     expect(combat.startInfo.timestamp).toBeGreaterThan(5000);
    //     expect(combat.startInfo.zoneId).toEqual('1504');
    //     expect(combat.startInfo.item1).toEqual('34');
    //     expect(combat.startInfo.bracket).toEqual('Skirmish');
    //     expect(combat.startInfo.isRanked).toEqual(false);
    //   });

    //   it('should parse arena end event', () => {
    //     const combat = combats[0];
    //     expect(combat.endInfo.timestamp).toBeGreaterThan(5000);
    //     expect(combat.endInfo.matchDurationInSeconds).toEqual(73);
    //     expect(combat.endInfo.winningTeamId).toEqual('0');
    //     expect(combat.endInfo.team0MMR).toEqual(0);
    //     expect(combat.endInfo.team1MMR).toEqual(0);
    //   });

    //   it('should have a correct death record', () => {
    //     const combat = combats[0];
    //     expect(combat.units['Player-4184-00216AC8']?.deathRecords).toHaveLength(1);
    //   });

    //   it('should be counted as a lost match', () => {
    //     const combat = combats[0];
    //     expect(combat.result).toEqual(CombatResult.Lose);
    //   });

    //   it('should have advanced logs parsed correctly', () => {
    //     const combat = combats[0];
    //     expect(combat.units['Player-4184-00216AC8']?.advancedActions).toHaveLength(148);
    //   });

    //   it('should compute the correct hash id', () => {
    //     const combat = combats[0];
    //     expect(combat.id).toEqual('13f86bc508ebc6ab3e03f5272ea48333');
    //   });
  });
});

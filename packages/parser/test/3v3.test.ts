// import { CombatResult, CombatUnitSpec, CombatUnitClass } from '../src';
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
      const loaded = loadLogFile('one_match_synthetic.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    it('should return a single match', () => {
      expect(results.malformedCombats).toHaveLength(0);
      expect(results.combats).toHaveLength(1);
      expect(results.malformedCombats).toHaveLength(0);
      expect(results.shuffleRounds).toHaveLength(0);
      expect(results.shuffles).toHaveLength(0);
    });

    // it('should compute the correct hash id', () => {
    //   const combat = results.combats[0];
    //   expect(combat.id).toEqual('f3750ed46db5cabc1d25882e6fa2c67b');
    // });

    // it('reaction based fields should populate', () => {
    //   expect(results.combats[0].playerTeamId).toEqual('0');
    //   expect(results.combats[0].playerTeamRating).toEqual(1440);
    // });

    // it('should buffer the raw log', () => {
    //   expect(results.combats[0].rawLines.length).toEqual(12);
    // });

    // it('should count the lines it cant parse', () => {
    //   expect(results.combats[0].linesNotParsedCount).toEqual(1);
    // });

    // it('should have correct combatant metadata', () => {
    //   const combat = results.combats[0];
    //   const combatant = combat.units['Player-57-0CE7FCBF'];
    //   expect(combatant.class).toEqual(CombatUnitClass.Warrior);
    //   expect(combatant.spec).toEqual(CombatUnitSpec.Warrior_Arms);
    //   expect(combatant.info?.specId).toEqual(CombatUnitSpec.Warrior_Arms);
    //   expect(combatant.info?.equipment[10].bonuses[2]).toEqual('1492');
    //   expect(combatant.info?.teamId).toEqual('0');
    //   expect(combatant.info?.highestPvpTier).toEqual(2);
    // });

    // it('should parse arena start event', () => {
    //   const combat = results.combats[0];
    //   expect(combat.startInfo.timestamp).toBeGreaterThan(5000);
    //   expect(combat.startInfo.zoneId).toEqual('1552');
    //   expect(combat.startInfo.item1).toEqual('30');
    //   expect(combat.startInfo.bracket).toEqual('2v2');
    //   expect(combat.startInfo.isRanked).toEqual(true);
    // });

    // it('should parse arena end event', () => {
    //   const combat = results.combats[0];
    //   expect(combat.endInfo.timestamp).toBeGreaterThan(5000);
    //   expect(combat.endInfo.matchDurationInSeconds).toEqual(465);
    //   expect(combat.endInfo.winningTeamId).toEqual('1');
    //   expect(combat.endInfo.team0MMR).toEqual(1440);
    //   expect(combat.endInfo.team1MMR).toEqual(1437);
    // });

    // it('should have a correct death record', () => {
    //   const combat = results.combats[0];
    //   expect(combat.units['Player-57-0CE7FCBF']?.deathRecords).toHaveLength(1);
    // });

    // it('should be counted as a lost match', () => {
    //   const combat = results.combats[0];
    //   expect(combat.result).toEqual(CombatResult.Lose);
    // });

    // it('should have advanced logs parsed correctly', () => {
    //   const combat = results.combats[0];
    //   expect(combat.units['Player-57-0CE7FCBF']?.advancedActions).toHaveLength(1);
    // });

    // it('should compute the correct hash id', () => {
    //   const combat = results.combats[0];
    //   expect(combat.id).toEqual('65801fbacf7700cc1fa3744ecaffd4a2');
    // });
  });
});

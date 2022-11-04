import { CombatResult, CombatUnitClass, CombatUnitSpec } from '../src/types';
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

    it('should compute the correct hash id', () => {
      const combat = results.combats[0];
      expect(combat.id).toEqual('f9a98f6c18127eefaa89cab84e24727a');
    });

    it('reaction based fields should populate', () => {
      expect(results.combats[0].playerTeamId).toEqual('0');
      expect(results.combats[0].playerTeamRating).toEqual(1422);
    });

    it('should have accounting for the raw lines', () => {
      expect(results.combats[0].rawLines.length).toEqual(19);
      expect(results.combats[0].linesNotParsedCount).toEqual(1);
    });

    it('should have correct combatant metadata', () => {
      const combat = results.combats[0];
      const combatant = combat.units['c21e81ad-747e-476b-949e-986b55265bb5'];
      expect(combatant.class).toEqual(CombatUnitClass.DemonHunter);
      expect(combatant.spec).toEqual(CombatUnitSpec.DemonHunter_Havoc);
      expect(combatant.info?.specId).toEqual(CombatUnitSpec.DemonHunter_Havoc);
      expect(combatant.info?.equipment[10].bonuses[2]).toEqual('8765');
      expect(combatant.info?.teamId).toEqual('1');
      expect(combatant.info?.highestPvpTier).toEqual(8);

      expect(combat.units['ce9434a7-b379-4919-b825-f94e1df6cbef']?.deathRecords).toHaveLength(1);
      expect(combat.units['fd138480-ce7b-4d1c-b09d-d4214c69e022']?.advancedActions).toHaveLength(2);
    });

    it('should parse arena start event', () => {
      const combat = results.combats[0];
      expect(combat.startInfo.timestamp).toBeGreaterThan(5000);
      expect(combat.startInfo.zoneId).toEqual('1672');
      expect(combat.startInfo.item1).toEqual('0');
      expect(combat.startInfo.bracket).toEqual('3v3');
      expect(combat.startInfo.isRanked).toEqual(true);
    });

    it('should parse arena end event', () => {
      const combat = results.combats[0];
      expect(combat.endInfo.timestamp).toBeGreaterThan(5000);
      expect(combat.endInfo.matchDurationInSeconds).toEqual(27);
      expect(combat.endInfo.winningTeamId).toEqual('0');
      expect(combat.endInfo.team0MMR).toEqual(1422);
      expect(combat.endInfo.team1MMR).toEqual(1496);

      expect(combat.result).toEqual(CombatResult.Win);
    });
  });
});

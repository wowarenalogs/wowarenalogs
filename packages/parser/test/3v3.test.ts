import _ from 'lodash';

import { CombatResult, CombatUnitAffiliation, CombatUnitClass, CombatUnitSpec, CombatUnitType } from '../src/types';
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
      const loaded = loadLogFile('3v3_tww_1120_reduced.txt');
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
      expect(combat.id).toEqual('9a71413bf9652a7166c2435bafb3be79');
      expect(combat.dataType).toBe('ArenaMatch');
      expect(combat.timezone).toBe('America/New_York');
    });

    it('reaction based fields should populate', () => {
      expect(results.combats[0].playerTeamId).toEqual('1');
      expect(results.combats[0].playerTeamRating).toEqual(1756);
    });

    it('should have accounting for the raw lines', () => {
      expect(results.combats[0].events.length).toBe(24);
      expect(results.combats[0].rawLines.length).toEqual(32);
      expect(results.combats[0].linesNotParsedCount).toEqual(0);
      expect(results.combats[0].hasAdvancedLogging).toBe(true);
    });

    it('should have correct combatant metadata', () => {
      const combat = results.combats[0];
      expect(_.values(combat.units).filter((u) => u.type === CombatUnitType.Player).length).toBe(6);

      const team0Ids = Object.values(combat.units)
        .filter((u) => u.info?.teamId === '0')
        .map((u) => u.id);
      const team1Ids = Object.values(combat.units)
        .filter((u) => u.info?.teamId === '1')
        .map((u) => u.id);

      expect(combat.units[team0Ids[0]].affiliation).toBe(CombatUnitAffiliation.Outsider);
      expect(combat.units[team0Ids[1]].affiliation).toBe(CombatUnitAffiliation.Outsider);
      expect(combat.units[team0Ids[2]].affiliation).toBe(CombatUnitAffiliation.Outsider);

      expect(combat.units[team1Ids[0]].affiliation).toBe(CombatUnitAffiliation.Mine);
      expect(combat.units[team1Ids[1]].affiliation).toBe(CombatUnitAffiliation.Party);
      expect(combat.units[team1Ids[2]].affiliation).toBe(CombatUnitAffiliation.Party);

      expect(results.combats[0].playerId).toBe(team1Ids[0]);

      const combatant = combat.units[team1Ids[0]];
      expect(combatant.class).toEqual(CombatUnitClass.Paladin);
      expect(combatant.spec).toEqual(CombatUnitSpec.Paladin_Retribution);
      expect(combatant.info?.specId).toEqual(CombatUnitSpec.Paladin_Retribution);
      expect(combatant.info?.equipment[10].bonuses[2]).toEqual('10832');
      expect(combatant.info?.teamId).toEqual('1');
      expect(combatant.info?.highestPvpTier).toEqual(9);

      expect(combat.units[team1Ids[0]]?.deathRecords).toHaveLength(1);
      expect(combat.units[team1Ids[0]]?.advancedActions).toHaveLength(2);

      expect(combat.playerTeamId).toBe('1');
      expect(combat.winningTeamId).toBe('0');
      expect(combat.playerTeamRating).toBe(1756);
    });

    it('should parse arena start event', () => {
      const combat = results.combats[0];
      expect(combat.startInfo.timestamp).toBeGreaterThan(5000);
      expect(combat.startTime).toBe(combat.startInfo.timestamp);
      expect(combat.startInfo.zoneId).toEqual('2373');
      expect(combat.startInfo.item1).toEqual('40');
      expect(combat.startInfo.bracket).toEqual('3v3');
      expect(combat.startInfo.isRanked).toEqual(true);
    });

    it('should parse arena end event', () => {
      const combat = results.combats[0];
      expect(combat.endInfo.timestamp).toBeGreaterThan(5000);
      expect(combat.endTime).toBe(combat.endInfo.timestamp);
      expect(combat.endInfo.matchDurationInSeconds).toEqual(27);
      expect(combat.durationInSeconds).toBe(combat.endInfo.matchDurationInSeconds);
      expect(combat.endInfo.winningTeamId).toEqual('0');
      expect(combat.endInfo.team0MMR).toEqual(1734);
      expect(combat.endInfo.team1MMR).toEqual(1756);

      expect(combat.result).toEqual(CombatResult.Lose);
    });
  });
});

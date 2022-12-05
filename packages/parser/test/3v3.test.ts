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
      expect(combat.id).toEqual('f972d3d639ddb2f048b2f21ec137462c');
      expect(combat.dataType).toBe('ArenaMatch');
      expect(combat.timezone).toBe('America/New_York');
    });

    it('reaction based fields should populate', () => {
      expect(results.combats[0].playerTeamId).toEqual('0');
      expect(results.combats[0].playerTeamRating).toEqual(1422);
    });

    it('should have accounting for the raw lines', () => {
      expect(results.combats[0].events.length).toBe(11);
      expect(results.combats[0].rawLines.length).toEqual(20);
      expect(results.combats[0].linesNotParsedCount).toEqual(0);
      expect(results.combats[0].hasAdvancedLogging).toBe(true);
    });

    it('should have correct combatant metadata', () => {
      const combat = results.combats[0];
      expect(_.values(combat.units).filter((u) => u.type === CombatUnitType.Player).length).toBe(6);

      expect(combat.units['fd138480-ce7b-4d1c-b09d-d4214c69e022'].affiliation).toBe(CombatUnitAffiliation.Mine);
      expect(combat.units['21867f31-48f2-461d-8f11-a9232d3219af'].affiliation).toBe(CombatUnitAffiliation.Party);
      expect(combat.units['dd6dcc4e-fe9c-4485-84db-f5beb34b748a'].affiliation).toBe(CombatUnitAffiliation.Party);

      expect(combat.units['79fb8ee7-f33d-4cb1-83f4-4d4c5fe615bd'].affiliation).toBe(CombatUnitAffiliation.Outsider);
      expect(combat.units['ce9434a7-b379-4919-b825-f94e1df6cbef'].affiliation).toBe(CombatUnitAffiliation.Outsider);
      expect(combat.units['c21e81ad-747e-476b-949e-986b55265bb5'].affiliation).toBe(CombatUnitAffiliation.Outsider);

      expect(results.combats[0].playerId).toBe('fd138480-ce7b-4d1c-b09d-d4214c69e022');

      const combatant = combat.units['c21e81ad-747e-476b-949e-986b55265bb5'];
      expect(combatant.class).toEqual(CombatUnitClass.DemonHunter);
      expect(combatant.spec).toEqual(CombatUnitSpec.DemonHunter_Havoc);
      expect(combatant.info?.specId).toEqual(CombatUnitSpec.DemonHunter_Havoc);
      expect(combatant.info?.equipment[10].bonuses[2]).toEqual('8765');
      expect(combatant.info?.teamId).toEqual('1');
      expect(combatant.info?.highestPvpTier).toEqual(8);

      expect(combat.units['ce9434a7-b379-4919-b825-f94e1df6cbef']?.deathRecords).toHaveLength(1);
      expect(combat.units['fd138480-ce7b-4d1c-b09d-d4214c69e022']?.advancedActions).toHaveLength(2);

      expect(combat.playerTeamId).toBe('0');
      expect(combat.winningTeamId).toBe('0');
      expect(combat.playerTeamRating).toBe(1422);
    });

    it('should parse arena start event', () => {
      const combat = results.combats[0];
      expect(combat.startInfo.timestamp).toBeGreaterThan(5000);
      expect(combat.startTime).toBe(combat.startInfo.timestamp);
      expect(combat.startInfo.zoneId).toEqual('1672');
      expect(combat.startInfo.item1).toEqual('0');
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
      expect(combat.endInfo.team0MMR).toEqual(1422);
      expect(combat.endInfo.team1MMR).toEqual(1496);

      expect(combat.result).toEqual(CombatResult.Win);
    });
  });
});

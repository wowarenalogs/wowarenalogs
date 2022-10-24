import lineReader from 'line-reader';
import path from 'path';

import { ICombatData, WoWCombatLogParser } from '../src';
import { IMalformedCombatData } from '../src/CombatData';

const parseLogFileAsync = (logFileName: string): Promise<[ICombatData[], IMalformedCombatData[]]> => {
  return new Promise((resolve) => {
    const logParser = new WoWCombatLogParser();
    const results: ICombatData[] = [];
    const malformedResults: IMalformedCombatData[] = [];

    logParser.on('arena_match_ended', (data) => {
      const combat = data as ICombatData;
      results.push(combat);
    });

    logParser.on('malformed_arena_match_detected', (data) => {
      const combat = data as IMalformedCombatData;
      malformedResults.push(combat);
    });

    lineReader.eachLine(path.join(__dirname, 'logs', logFileName), (line, last) => {
      logParser.parseLine(line);
      if (last) {
        resolve([results, malformedResults]);
        return false;
      }
      return true;
    });

    logParser.flush();
  });
};

describe('parser tests', () => {
  describe('parsing a short match', () => {
    let combats: ICombatData[] = [];
    let malformed: IMalformedCombatData[] = [];

    beforeAll(async () => {
      [combats, malformed] = await parseLogFileAsync('dfbeta_skirmish.txt');
    });

    it('should return a single match', () => {
      console.log({ malformed });
      expect(combats).toHaveLength(1);
    });

    // it('reaction based fields should populate', () => {
    //   expect(combats[0].playerTeamId).toEqual('0');
    //   expect(combats[0].playerTeamRating).toEqual(1440);
    // });

    // it('should buffer the raw log', () => {
    //   expect(combats[0].rawLines.length).toEqual(12);
    // });

    // it('should count the lines it cant parse', () => {
    //   expect(combats[0].linesNotParsedCount).toEqual(1);
    // });

    // it('should have correct combatant metadata', () => {
    //   const combat = combats[0];
    //   const combatant = combat.units['Player-57-0CE7FCBF'];
    //   expect(combatant.class).toEqual(CombatUnitClass.Warrior);
    //   expect(combatant.spec).toEqual(CombatUnitSpec.Warrior_Arms);
    //   expect(combatant.info?.specId).toEqual(CombatUnitSpec.Warrior_Arms);
    //   expect(combatant.info?.equipment[10].bonuses[2]).toEqual('1492');
    //   expect(combatant.info?.teamId).toEqual('0');
    //   expect(combatant.info?.highestPvpTier).toEqual(2);
    //   expect(combatant.info?.covenantInfo.conduitIdsJSON).toEqual('[[169,184],[8,145]]');
    //   expect(combatant.info?.covenantInfo.item3JSON).toEqual('[[1393],[1395],[1406],[1397]]');
    // });

    // it('should parse arena start event', () => {
    //   const combat = combats[0];
    //   expect(combat.startInfo.timestamp).toBeGreaterThan(5000);
    //   expect(combat.startInfo.zoneId).toEqual('1552');
    //   expect(combat.startInfo.item1).toEqual('30');
    //   expect(combat.startInfo.bracket).toEqual('2v2');
    //   expect(combat.startInfo.isRanked).toEqual(true);
    // });

    // it('should parse arena end event', () => {
    //   const combat = combats[0];
    //   expect(combat.endInfo.timestamp).toBeGreaterThan(5000);
    //   expect(combat.endInfo.matchDurationInSeconds).toEqual(465);
    //   expect(combat.endInfo.winningTeamId).toEqual('1');
    //   expect(combat.endInfo.team0MMR).toEqual(1440);
    //   expect(combat.endInfo.team1MMR).toEqual(1437);
    // });

    // it('should have a correct death record', () => {
    //   const combat = combats[0];
    //   expect(combat.units['Player-57-0CE7FCBF']?.deathRecords).toHaveLength(1);
    // });

    // it('should be counted as a lost match', () => {
    //   const combat = combats[0];
    //   expect(combat.result).toEqual(CombatResult.Lose);
    // });

    // it('should have advanced logs parsed correctly', () => {
    //   const combat = combats[0];
    //   expect(combat.units['Player-57-0CE7FCBF']?.advancedActions).toHaveLength(1);
    // });

    // it('should compute the correct hash id', () => {
    //   const combat = combats[0];
    //   expect(combat.id).toEqual('65801fbacf7700cc1fa3744ecaffd4a2');
    // });
  });
});

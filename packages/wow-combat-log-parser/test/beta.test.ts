import lineReader from 'line-reader';
import path from 'path';

import { CombatUnitClass, CombatUnitSpec, ICombatData, WoWCombatLogParser } from '../src';
import { IMalformedCombatData } from '../src/CombatData';
import { CombatResult } from '../src/types';

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

    it('reaction based fields should populate', () => {
      expect(combats[0].playerTeamId).toEqual('1');
      expect(combats[0].playerTeamRating).toEqual(0);
    });

    it('should buffer the raw log', () => {
      expect(combats[0].rawLines.length).toEqual(3641);
    });

    it('should count the lines it cant parse', () => {
      expect(combats[0].linesNotParsedCount).toEqual(386);
    });

    it('should have correct combatant metadata', () => {
      const combat = combats[0];
      const combatant = combat.units['Player-4184-00216AC8'];
      expect(combatant.class).toEqual(CombatUnitClass.Shaman);
      expect(combatant.spec).toEqual(CombatUnitSpec.Shaman_Restoration);
      expect(combatant.info?.specId).toEqual(CombatUnitSpec.Shaman_Restoration);

      const gloves = combatant.info?.equipment.find((i) => i.id === '153976');
      expect(gloves).not.toBeNull();

      expect(combatant.info?.teamId).toEqual('1');
      expect(combatant.info?.highestPvpTier).toEqual(0);
    });

    it('should parse arena start event', () => {
      const combat = combats[0];
      expect(combat.startInfo.timestamp).toBeGreaterThan(5000);
      expect(combat.startInfo.zoneId).toEqual('1504');
      expect(combat.startInfo.item1).toEqual('34');
      expect(combat.startInfo.bracket).toEqual('Skirmish');
      expect(combat.startInfo.isRanked).toEqual(false);
    });

    it('should parse arena end event', () => {
      const combat = combats[0];
      expect(combat.endInfo.timestamp).toBeGreaterThan(5000);
      expect(combat.endInfo.matchDurationInSeconds).toEqual(73);
      expect(combat.endInfo.winningTeamId).toEqual('0');
      expect(combat.endInfo.team0MMR).toEqual(0);
      expect(combat.endInfo.team1MMR).toEqual(0);
    });

    it('should have a correct death record', () => {
      const combat = combats[0];
      expect(combat.units['Player-4184-00216AC8']?.deathRecords).toHaveLength(1);
    });

    it('should be counted as a lost match', () => {
      const combat = combats[0];
      expect(combat.result).toEqual(CombatResult.Lose);
    });

    it('should have advanced logs parsed correctly', () => {
      const combat = combats[0];
      expect(combat.units['Player-4184-00216AC8']?.advancedActions).toHaveLength(148);
    });

    it('should compute the correct hash id', () => {
      const combat = combats[0];
      expect(combat.id).toEqual('13f86bc508ebc6ab3e03f5272ea48333');
    });
  });
});

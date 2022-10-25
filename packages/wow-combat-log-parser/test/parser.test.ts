import lineReader from 'line-reader';
import path from 'path';

import {
  CombatResult,
  CombatUnitSpec,
  ICombatData,
  CombatUnitPowerType,
  WoWCombatLogParser,
  CombatUnitClass,
  CombatAbsorbAction,
} from '../src';
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
  describe('parsing logs outside of arena matches', () => {
    let combats: ICombatData[] = [];
    beforeAll(async () => {
      [combats] = await parseLogFileAsync('no_arena.txt');
    });

    it('should not return any Combat objects', async () => {
      expect(combats).toHaveLength(0);
    });
  });

  describe('parsing a short match to verify ID hashing', () => {
    let combats: ICombatData[] = [];
    beforeAll(async () => {
      [combats] = await parseLogFileAsync('short_match_original.txt');
    });

    it('should return a single match', () => {
      expect(combats).toHaveLength(1);
    });

    it('should compute the correct hash id', () => {
      const combat = combats[0];
      expect(combat.id).toEqual('f3750ed46db5cabc1d25882e6fa2c67b');
    });
  });

  describe('parsing a short match', () => {
    let combats: ICombatData[] = [];
    beforeAll(async () => {
      [combats] = await parseLogFileAsync('short_match.txt');
    });

    it('should return a single match', () => {
      expect(combats).toHaveLength(1);
    });

    it('reaction based fields should populate', () => {
      expect(combats[0].playerTeamId).toEqual('0');
      expect(combats[0].playerTeamRating).toEqual(1440);
    });

    it('should buffer the raw log', () => {
      expect(combats[0].rawLines.length).toEqual(12);
    });

    it('should count the lines it cant parse', () => {
      expect(combats[0].linesNotParsedCount).toEqual(1);
    });

    it('should have correct combatant metadata', () => {
      const combat = combats[0];
      const combatant = combat.units['Player-57-0CE7FCBF'];
      expect(combatant.class).toEqual(CombatUnitClass.Warrior);
      expect(combatant.spec).toEqual(CombatUnitSpec.Warrior_Arms);
      expect(combatant.info?.specId).toEqual(CombatUnitSpec.Warrior_Arms);
      expect(combatant.info?.equipment[10].bonuses[2]).toEqual('1492');
      expect(combatant.info?.teamId).toEqual('0');
      expect(combatant.info?.highestPvpTier).toEqual(2);
    });

    it('should parse arena start event', () => {
      const combat = combats[0];
      expect(combat.startInfo.timestamp).toBeGreaterThan(5000);
      expect(combat.startInfo.zoneId).toEqual('1552');
      expect(combat.startInfo.item1).toEqual('30');
      expect(combat.startInfo.bracket).toEqual('2v2');
      expect(combat.startInfo.isRanked).toEqual(true);
    });

    it('should parse arena end event', () => {
      const combat = combats[0];
      expect(combat.endInfo.timestamp).toBeGreaterThan(5000);
      expect(combat.endInfo.matchDurationInSeconds).toEqual(465);
      expect(combat.endInfo.winningTeamId).toEqual('1');
      expect(combat.endInfo.team0MMR).toEqual(1440);
      expect(combat.endInfo.team1MMR).toEqual(1437);
    });

    it('should have a correct death record', () => {
      const combat = combats[0];
      expect(combat.units['Player-57-0CE7FCBF']?.deathRecords).toHaveLength(1);
    });

    it('should be counted as a lost match', () => {
      const combat = combats[0];
      expect(combat.result).toEqual(CombatResult.Lose);
    });

    it('should have advanced logs parsed correctly', () => {
      const combat = combats[0];
      expect(combat.units['Player-57-0CE7FCBF']?.advancedActions).toHaveLength(1);
    });

    it('should compute the correct hash id', () => {
      const combat = combats[0];
      expect(combat.id).toEqual('65801fbacf7700cc1fa3744ecaffd4a2');
    });
  });

  describe('parsing a malformed log file that has double start bug', () => {
    let combats: ICombatData[] = [];
    let malformedCombats: IMalformedCombatData[] = [];
    beforeAll(async () => {
      [combats, malformedCombats] = await parseLogFileAsync('double_start.txt');
    });

    it('should return one valid match', () => {
      expect(combats).toHaveLength(1);
    });
    it('should return one malformed match', () => {
      expect(malformedCombats).toHaveLength(1);
    });

    it('should buffer the malformed raw log', () => {
      expect(malformedCombats[0].rawLines.length).toEqual(7);
    });

    it('should buffer the valid raw log', () => {
      expect(combats[0].rawLines.length).toEqual(10);
    });
  });

  describe('parsing a real log file without advanced combat logging', () => {
    let combats: ICombatData[] = [];
    beforeAll(async () => {
      [combats] = await parseLogFileAsync('real_match_no_advanced.txt');
    });

    it('should return a single match', () => {
      expect(combats).toHaveLength(1);
    });

    it('should buffer the raw log', () => {
      expect(combats[0].rawLines.length).toEqual(2074);
    });

    it('should not mark the combat as having advanced logging', () => {
      expect(combats[0].hasAdvancedLogging).toBeFalsy();
    });

    it('should count the lines it cant parse', () => {
      expect(combats[0].linesNotParsedCount).toEqual(87);
    });

    it('should have aura events', () => {
      expect(combats[0].units['Player-57-0CE7FCBF']?.auraEvents || []).not.toHaveLength(0);
    });

    it('should have spell cast events', () => {
      expect(combats[0].units['Player-57-0CE7FCBF']?.spellCastEvents || []).not.toHaveLength(0);
    });
  });

  describe('parsing a log with two matches', () => {
    let combats: ICombatData[] = [];
    beforeAll(async () => {
      [combats] = await parseLogFileAsync('two_short_matches.txt');
    });

    it('should return two matches', () => {
      expect(combats).toHaveLength(2);
    });

    it('should buffer the raw logs', () => {
      expect(combats[0].rawLines.length).toEqual(11);
      expect(combats[1].rawLines.length).toEqual(10);
    });

    it('should count the lines it cant parse', () => {
      expect(combats[0].linesNotParsedCount).toEqual(1);
      expect(combats[1].linesNotParsedCount).toEqual(0);
    });

    it('should parse arena start events', () => {
      expect(combats[0].startInfo.zoneId).toEqual('1552');
      expect(combats[0].startInfo.item1).toEqual('30');
      expect(combats[0].startInfo.bracket).toEqual('2v2');
      expect(combats[0].startInfo.isRanked).toEqual(true);

      expect(combats[1].startInfo.zoneId).toEqual('1551');
      expect(combats[1].startInfo.item1).toEqual('30');
      expect(combats[1].startInfo.bracket).toEqual('3v3');
      expect(combats[1].startInfo.isRanked).toEqual(false);
    });

    it('should parse arena end events', () => {
      expect(combats[0].endInfo.winningTeamId).toEqual('1');
      expect(combats[0].endInfo.matchDurationInSeconds).toEqual(465);
      expect(combats[0].endInfo.team0MMR).toEqual(1440);
      expect(combats[0].endInfo.team1MMR).toEqual(1437);

      expect(combats[1].endInfo.winningTeamId).toEqual('0');
      expect(combats[1].endInfo.matchDurationInSeconds).toEqual(465);
      expect(combats[1].endInfo.team0MMR).toEqual(1333);
      expect(combats[1].endInfo.team1MMR).toEqual(1437);
    });
  });

  describe('parsing a log with no end will time out', () => {
    let combats: ICombatData[] = [];
    let malformedCombats: IMalformedCombatData[] = [];
    beforeAll(async () => {
      [combats, malformedCombats] = await parseLogFileAsync('match_without_end.txt');
    });

    it('should return no valid match', () => {
      expect(combats).toHaveLength(0);
    });
    it('should return one malformed match', () => {
      expect(malformedCombats).toHaveLength(1);
    });

    it('should buffer the raw logs', () => {
      expect(malformedCombats[0].rawLines.length).toEqual(10);
    });

    it('should count the lines it cant parse', () => {
      expect(malformedCombats[0].linesNotParsedCount).toEqual(1);
    });
  });

  describe('parsing a log with disc priest shields', () => {
    let combats: ICombatData[] = [];
    beforeAll(async () => {
      [combats] = await parseLogFileAsync('disc_priest_2v2.txt');
    });

    it('should allow consumers to examine all events', () => {
      expect(combats).toHaveLength(1);
      // Pattern 1: instanceof for events more specific than CombatAction
      const absorbs = combats[0].events.filter((e) => e instanceof CombatAbsorbAction) as CombatAbsorbAction[];
      expect(absorbs.filter((a) => a.absorbedAmount > 200).length).toBe(27);

      // Pattern 2: events by name from logline values
      const castFailedEvents = combats[0].events.filter((e) => e.logLine.event === 'SPELL_CAST_FAILED');
      expect(castFailedEvents.length).toBe(4);
    });

    it('should count spell absorbs correctly', () => {
      // Absorbs out should only be counting shields the caster owns
      Object.keys(combats[0].units).forEach((k) => {
        combats[0].units[k].absorbsOut.forEach((c) => {
          expect(c.shieldOwnerUnitId).toBe(k);
        });
      });

      // Absorbs in should be counting all absorbs that prevent dmg on you
      Object.keys(combats[0].units).forEach((k) => {
        combats[0].units[k].absorbsIn.forEach((c) => {
          expect(c.destUnitId).toBe(k);
        });
      });

      // DearShark-Purge the Wicked->ExcellentGayal [LiberalWildebeest-Power Word: Shield]
      // Purge the wicked is cast on ExcellentGayal and a shield cast by LiberalW absorbs it
      const sampleCast = combats[0].units['c66f15ba-fe98-405a-9cba-881612324e62'].absorbsOut[1];

      expect(sampleCast.shieldSpellName).toBe('Power Word: Shield');
      expect(sampleCast.destUnitName).toBe('ExcellentGayal');
      expect(sampleCast.srcUnitName).toBe('DearShark');
      expect(sampleCast.shieldOwnerUnitName).toBe('LiberalWildebeest');

      // Total absorb by LiberalWildebeast
      const totalAbs = combats[0].units['c66f15ba-fe98-405a-9cba-881612324e62'].absorbsOut.reduce(
        (prev, cur) => prev + cur.absorbedAmount,
        0,
      );
      expect(totalAbs).toBe(8413);

      // Total absorb-damage by DearShark
      const totalDamageAbs = combats[0].units['d745035e-8d20-4ba5-8e0a-3567f4172fa0'].absorbsDamaged.reduce(
        (prev, cur) => prev + cur.absorbedAmount,
        0,
      );
      expect(totalDamageAbs).toBe(4576);
      expect(combats[0].units['d745035e-8d20-4ba5-8e0a-3567f4172fa0'].absorbsDamaged.length).toBe(12);

      expect(combats).toHaveLength(1);
    });
  });

  describe('parsing a log with advanced logging', () => {
    let combats: ICombatData[] = [];
    beforeAll(async () => {
      [combats] = await parseLogFileAsync('skirmish_with_advanced_logging.txt');
    });

    it('should return a single match', () => {
      expect(combats).toHaveLength(1);
    });

    it('should have correct mana data', () => {
      expect(combats[0].units['Player-57-0A628E42'].advancedActions[0].advancedActorPowers).toHaveLength(1);

      expect(combats[0].units['Player-57-0A628E42'].advancedActions[0].advancedActorPowers[0].type).toEqual(
        CombatUnitPowerType.Mana,
      );

      expect(combats[0].units['Player-57-0A628E42'].advancedActions[0].advancedActorPowers[0].max).toEqual(42565);
    });

    it('should have merged pet activities correctly', () => {
      expect(
        combats[0].units['Player-57-0C9DA89C'].damageOut.filter(
          (e) => e.srcUnitId === 'Creature-0-3886-1505-13080-103673-00001E55D3',
        ).length,
      ).toEqual(7);
    });
  });

  describe('parsing a log with conscious death', () => {
    let combats: ICombatData[] = [];
    beforeAll(async () => {
      [combats] = await parseLogFileAsync('short_match_consciousdeath.txt');
    });

    it('should return a single match', () => {
      expect(combats).toHaveLength(1);
    });

    it('should have correct conscious death data', () => {
      expect(combats[0].units['Player-127-0827487A'].deathRecords).toHaveLength(1);

      expect(combats[0].units['Player-127-0827487A'].consciousDeathRecords).toHaveLength(2);
    });
  });

  describe('parsing a tbc log file', () => {
    let combats: ICombatData[] = [];
    let malformedCombats: IMalformedCombatData[] = [];
    beforeAll(async () => {
      [combats, malformedCombats] = await parseLogFileAsync('tbc_multiple_matches.txt');
    });

    it('should return no malformed matches', () => {
      expect(malformedCombats).toHaveLength(0);
    });
    it('should return 5 matches', () => {
      expect(combats).toHaveLength(5);
    });

    it('should have 2 loss', () => {
      expect(combats.filter((c) => c.result === CombatResult.Lose)).toHaveLength(2);
    });
    it('should have 3 wins', () => {
      expect(combats.filter((c) => c.result === CombatResult.Win)).toHaveLength(3);
    });
    it('should have the correct class inferred', () => {
      expect(Object.values(combats[0].units).filter((u) => u.name === 'Assinoth-Whitemane')[0].class).toEqual(
        CombatUnitClass.Rogue,
      );
    });

    it('should have the correct bracket inferred', () => {
      expect(combats[0].startInfo.bracket).toEqual('2v2');
    });
  });
});

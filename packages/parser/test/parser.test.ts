import { CombatUnitPowerType } from '../src';
import { LoaderResults, loadLogFile } from './testLogLoader';

describe('parser tests', () => {
  describe('parsing logs outside of arena matches', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
    };

    beforeAll(() => {
      const loaded = loadLogFile('no_valid_segments.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    it('should not return any Combat objects', async () => {
      expect(results.combats).toHaveLength(0);
    });
  });

  describe('parsing a malformed log file that has double start bug', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
    };

    beforeAll(() => {
      const loaded = loadLogFile('double_start.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    it('should return one valid match', () => {
      expect(results.combats).toHaveLength(1);
    });
    it('should return one malformed match', () => {
      expect(results.malformedCombats).toHaveLength(1);
    });

    it('should buffer the malformed raw log', () => {
      expect(results.malformedCombats[0].rawLines.length).toEqual(5);
    });

    it('should buffer the valid raw log', () => {
      expect(results.combats[0].rawLines.length).toEqual(226);
    });
  });

  describe('parsing a real log file without advanced combat logging', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
    };

    beforeAll(() => {
      const loaded = loadLogFile('no_advanced.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    xit('should return a single match', () => {
      expect(results.combats).toHaveLength(1);
    });

    xit('should buffer the raw log', () => {
      expect(results.combats[0].rawLines.length).toEqual(2074);
    });

    xit('should not mark the combat as having advanced logging', () => {
      expect(results.combats[0].hasAdvancedLogging).toBeFalsy();
    });

    xit('should count the lines it cant parse', () => {
      expect(results.combats[0].linesNotParsedCount).toEqual(0);
    });

    xit('should have aura events', () => {
      expect(results.combats[0].units['Player-57-0CE7FCBF']?.auraEvents || []).not.toHaveLength(0);
    });

    xit('should have spell cast events', () => {
      expect(results.combats[0].units['Player-57-0CE7FCBF']?.spellCastEvents || []).not.toHaveLength(0);
    });
  });

  describe('parsing a log with two matches', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
    };

    beforeAll(() => {
      const loaded = loadLogFile('two_matches.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    xit('should return two matches', () => {
      expect(results.combats).toHaveLength(2);
    });

    xit('should buffer the raw logs', () => {
      expect(results.combats[0].rawLines.length).toEqual(11);
      expect(results.combats[1].rawLines.length).toEqual(10);
    });

    xit('should count the lines it cant parse', () => {
      expect(results.combats[0].linesNotParsedCount).toEqual(1);
      expect(results.combats[1].linesNotParsedCount).toEqual(0);
    });

    xit('should parse arena start events', () => {
      expect(results.combats[0].startInfo.zoneId).toEqual('1552');
      expect(results.combats[0].startInfo.item1).toEqual('30');
      expect(results.combats[0].startInfo.bracket).toEqual('2v2');
      expect(results.combats[0].startInfo.isRanked).toEqual(true);

      expect(results.combats[1].startInfo.zoneId).toEqual('1551');
      expect(results.combats[1].startInfo.item1).toEqual('30');
      expect(results.combats[1].startInfo.bracket).toEqual('3v3');
      expect(results.combats[1].startInfo.isRanked).toEqual(false);
    });

    xit('should parse arena end events', () => {
      expect(results.combats[0].endInfo.winningTeamId).toEqual('1');
      expect(results.combats[0].endInfo.matchDurationInSeconds).toEqual(465);
      expect(results.combats[0].endInfo.team0MMR).toEqual(1440);
      expect(results.combats[0].endInfo.team1MMR).toEqual(1437);

      expect(results.combats[1].endInfo.winningTeamId).toEqual('0');
      expect(results.combats[1].endInfo.matchDurationInSeconds).toEqual(465);
      expect(results.combats[1].endInfo.team0MMR).toEqual(1333);
      expect(results.combats[1].endInfo.team1MMR).toEqual(1437);
    });
  });

  describe('parsing a log with no end will time out', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
    };

    beforeAll(() => {
      const loaded = loadLogFile('one_match_synthetic_no_end.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    xit('should return no valid match', () => {
      expect(results.combats).toHaveLength(0);
      expect(results.malformedCombats).toHaveLength(1);
      expect(results.shuffleRounds).toHaveLength(0);
      expect(results.shuffles).toHaveLength(0);
    });

    xit('should buffer the raw logs', () => {
      expect(results.malformedCombats[0].rawLines.length).toEqual(14);
      expect(results.malformedCombats[0].linesNotParsedCount).toEqual(0);
    });
  });

  describe('parsing a log with advanced logging', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
    };

    beforeAll(() => {
      const loaded = loadLogFile('hunter_priest_match.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    xit('should have correct mana data', () => {
      expect(results.combats).toHaveLength(1);

      expect(
        results.combats[0].units['286d3193-c3bb-4033-b1a0-b3318a06e0d5'].advancedActions[0].advancedActorPowers,
      ).toHaveLength(1);

      expect(
        results.combats[0].units['286d3193-c3bb-4033-b1a0-b3318a06e0d5'].advancedActions[0].advancedActorPowers[0].type,
      ).toEqual(CombatUnitPowerType.Mana);

      expect(
        results.combats[0].units['286d3193-c3bb-4033-b1a0-b3318a06e0d5'].advancedActions[0].advancedActorPowers[0].max,
      ).toEqual(53000);
    });

    xit('should have merged pet activities correctly', () => {
      // BM hunter has two pets:
      expect(
        results.combats[0].units['c5f3ff0a-040a-4e88-a171-59d4ceca1a42'].damageOut.filter(
          (e) => e.srcUnitId === 'Pet-0-4221-2167-21249-165189-050415A773',
        ).length,
      ).toEqual(112);

      expect(
        results.combats[0].units['c5f3ff0a-040a-4e88-a171-59d4ceca1a42'].damageOut.filter(
          (e) => e.srcUnitId === 'Pet-0-4221-2167-21249-165189-0304151C51',
        ).length,
      ).toEqual(145);
    });
  });
});

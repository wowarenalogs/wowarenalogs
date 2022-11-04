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

  xdescribe('parsing a malformed log file that has double start bug', () => {
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

    it('should return one valid match', () => {
      expect(results.combats).toHaveLength(1);
    });
    it('should return one malformed match', () => {
      expect(results.malformedCombats).toHaveLength(1);
    });

    it('should buffer the malformed raw log', () => {
      expect(results.malformedCombats[0].rawLines.length).toEqual(7);
    });

    it('should buffer the valid raw log', () => {
      expect(results.combats[0].rawLines.length).toEqual(10);
    });
  });

  xdescribe('parsing a real log file without advanced combat logging', () => {
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
      expect(results.combats).toHaveLength(1);
    });

    it('should buffer the raw log', () => {
      expect(results.combats[0].rawLines.length).toEqual(2074);
    });

    it('should not mark the combat as having advanced logging', () => {
      expect(results.combats[0].hasAdvancedLogging).toBeFalsy();
    });

    it('should count the lines it cant parse', () => {
      expect(results.combats[0].linesNotParsedCount).toEqual(87);
    });

    it('should have aura events', () => {
      expect(results.combats[0].units['Player-57-0CE7FCBF']?.auraEvents || []).not.toHaveLength(0);
    });

    it('should have spell cast events', () => {
      expect(results.combats[0].units['Player-57-0CE7FCBF']?.spellCastEvents || []).not.toHaveLength(0);
    });
  });

  xdescribe('parsing a log with two matches', () => {
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

    it('should return two matches', () => {
      expect(results.combats).toHaveLength(2);
    });

    it('should buffer the raw logs', () => {
      expect(results.combats[0].rawLines.length).toEqual(11);
      expect(results.combats[1].rawLines.length).toEqual(10);
    });

    it('should count the lines it cant parse', () => {
      expect(results.combats[0].linesNotParsedCount).toEqual(1);
      expect(results.combats[1].linesNotParsedCount).toEqual(0);
    });

    it('should parse arena start events', () => {
      expect(results.combats[0].startInfo.zoneId).toEqual('1552');
      expect(results.combats[0].startInfo.item1).toEqual('30');
      expect(results.combats[0].startInfo.bracket).toEqual('2v2');
      expect(results.combats[0].startInfo.isRanked).toEqual(true);

      expect(results.combats[1].startInfo.zoneId).toEqual('1551');
      expect(results.combats[1].startInfo.item1).toEqual('30');
      expect(results.combats[1].startInfo.bracket).toEqual('3v3');
      expect(results.combats[1].startInfo.isRanked).toEqual(false);
    });

    it('should parse arena end events', () => {
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

  xdescribe('parsing a log with no end will time out', () => {
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

    it('should return no valid match', () => {
      expect(results.combats).toHaveLength(0);
    });
    it('should return one malformed match', () => {
      expect(results.malformedCombats).toHaveLength(1);
    });

    it('should buffer the raw logs', () => {
      expect(results.malformedCombats[0].rawLines.length).toEqual(10);
    });

    it('should count the lines it cant parse', () => {
      expect(results.malformedCombats[0].linesNotParsedCount).toEqual(1);
    });
  });

  xdescribe('parsing a log with advanced logging', () => {
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

    it('should have correct mana data', () => {
      expect(results.combats[0].units['Player-57-0A628E42'].advancedActions[0].advancedActorPowers).toHaveLength(1);

      expect(results.combats[0].units['Player-57-0A628E42'].advancedActions[0].advancedActorPowers[0].type).toEqual(
        CombatUnitPowerType.Mana,
      );

      expect(results.combats[0].units['Player-57-0A628E42'].advancedActions[0].advancedActorPowers[0].max).toEqual(
        42565,
      );
    });

    it('should have merged pet activities correctly', () => {
      expect(
        results.combats[0].units['Player-57-0C9DA89C'].damageOut.filter(
          (e) => e.srcUnitId === 'Creature-0-3886-1505-13080-103673-00001E55D3',
        ).length,
      ).toEqual(7);
    });
  });
});

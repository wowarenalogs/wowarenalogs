import { LoaderResults, loadLogFile } from './testLogLoader';

describe('solo shuffle tests', () => {
  describe('parsing a log with a complete solo shuffle', () => {
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

    it('should return a single shuffle match with 6 rounds', () => {
      expect(results.shuffleRounds).toHaveLength(6);
      expect(results.shuffles).toHaveLength(1);
      expect(results.combats).toHaveLength(0);
      expect(results.malformedCombats).toHaveLength(0);
    });

    it('should have normal metadata', () => {
      const shuffle = results.shuffles[0];
      expect(shuffle.isWellFormed).toBe(true);
      expect(shuffle.hasAdvancedLogging).toBe(true);
    });

    it('should parse round 0', () => {
      const round = results.shuffleRounds[0];
      const team0Ids = ['Player-580-0A594065', 'Player-2073-094DF239', 'Player-1335-09D86B90'];
      const team1Ids = ['Player-1084-0979C1C5', 'Player-1098-0A781F24', 'Player-1929-0675D6C6'];

      team1Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe('1'));
      team0Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe('0'));

      expect(round.sequenceNumber).toBe(0);

      expect(round.winningTeamId).toBe('0');
      expect(round.roundEndInfo.killedUnitId).toBe('Player-1098-0A781F24');

      // Check the scoreboard after round 1
      const scores = [
        ['Player-580-0A594065', 1],
        ['Player-2073-094DF239', 1],
        ['Player-1335-09D86B90', 1],
        ['Player-1084-0979C1C5', 0],
        ['Player-1098-0A781F24', 0],
        ['Player-1929-0675D6C6', 0],
      ];
      scores.forEach((score) => {
        expect(round.scoreboard[score[0]]).toBe(score[1]);
      });
    });

    it('should parse round 1', () => {
      const round = results.shuffleRounds[1];
      expect(round.sequenceNumber).toBe(1);
      expect(round.winningTeamId).toBe('1');
    });

    it('should parse round 2', () => {
      const round = results.shuffleRounds[2];
      expect(round.sequenceNumber).toBe(2);
      expect(round.winningTeamId).toBe('1');
    });

    it('should parse round 3', () => {
      const round = results.shuffleRounds[3];
      expect(round.sequenceNumber).toBe(3);
      expect(round.winningTeamId).toBe('1');
    });

    it('should parse round 4', () => {
      const round = results.shuffleRounds[4];
      expect(round.sequenceNumber).toBe(4);
      expect(round.winningTeamId).toBe('0');
    });

    it('should parse round 5', () => {
      const round = results.shuffleRounds[5];
      const team0Ids = ['Player-2073-094DF239', 'Player-580-0A594065', 'Player-1929-0675D6C6'];
      const team1Ids = ['Player-1335-09D86B90', 'Player-1084-0979C1C5', 'Player-1098-0A781F24'];

      team0Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe('0'));
      team1Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe('1'));

      expect(round.sequenceNumber).toBe(5);

      expect(round.winningTeamId).toBe('0');
      expect(round.roundEndInfo.killedUnitId).toBe('Player-1098-0A781F24');

      // Check the scoreboard after round 6
      const scores = [
        ['Player-1098-0A781F24', 1],
        ['Player-1084-0979C1C5', 2],
        ['Player-1335-09D86B90', 5],
        ['Player-1929-0675D6C6', 3],
        ['Player-580-0A594065', 3],
        ['Player-2073-094DF239', 4],
      ];
      scores.forEach((score) => {
        expect(round.scoreboard[score[0]]).toBe(score[1]);
      });
    });
  });
});
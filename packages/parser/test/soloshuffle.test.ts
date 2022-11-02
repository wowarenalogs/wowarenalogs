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
      expect(results.combats).toHaveLength(0);
      expect(results.malformedCombats).toHaveLength(0);
      expect(results.shuffleRounds).toHaveLength(6);
      expect(results.shuffles).toHaveLength(1);
    });

    it('should have normal metadata', () => {
      const shuffle = results.shuffles[0];
      expect(shuffle.isWellFormed).toBe(true);
      expect(shuffle.hasAdvancedLogging).toBe(true);
    });

    it('should parse round 0', () => {
      const round = results.shuffleRounds[0];
      const team0Ids = ['1', '2', '3'];
      const team1Ids = ['1', '2', '3'];

      team0Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe(0));
      team1Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe(1));

      expect(round.sequenceNumber).toBe(0);

      expect(round.winningTeamId).toBe(0);
      expect(round.roundEndInfo.killedUnitId).toBe('some-guid');
    });

    it('should parse round 1', () => {
      const round = results.shuffleRounds[1];
      const team0Ids = ['1', '2', '3'];
      const team1Ids = ['1', '2', '3'];

      team0Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe(0));
      team1Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe(1));

      expect(round.sequenceNumber).toBe(1);

      expect(round.winningTeamId).toBe(0);
      expect(round.roundEndInfo.killedUnitId).toBe('some-guid');
    });

    it('should parse round 2', () => {
      const round = results.shuffleRounds[2];
      const team0Ids = ['1', '2', '3'];
      const team1Ids = ['1', '2', '3'];

      team0Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe(0));
      team1Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe(1));

      expect(round.sequenceNumber).toBe(2);

      expect(round.winningTeamId).toBe(0);
      expect(round.roundEndInfo.killedUnitId).toBe('some-guid');
    });

    it('should parse round 3', () => {
      const round = results.shuffleRounds[3];
      const team0Ids = ['1', '2', '3'];
      const team1Ids = ['1', '2', '3'];

      team0Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe(0));
      team1Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe(1));

      expect(round.sequenceNumber).toBe(3);

      expect(round.winningTeamId).toBe(0);
      expect(round.roundEndInfo.killedUnitId).toBe('some-guid');
    });

    it('should parse round 4', () => {
      const round = results.shuffleRounds[4];
      const team0Ids = ['1', '2', '3'];
      const team1Ids = ['1', '2', '3'];

      team0Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe(0));
      team1Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe(1));

      expect(round.sequenceNumber).toBe(4);

      expect(round.winningTeamId).toBe(0);
      expect(round.roundEndInfo.killedUnitId).toBe('some-guid');
    });

    it('should parse round 5', () => {
      const round = results.shuffleRounds[5];
      const team0Ids = ['1', '2', '3'];
      const team1Ids = ['1', '2', '3'];

      team0Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe(0));
      team1Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe(1));

      expect(round.sequenceNumber).toBe(5);

      expect(round.winningTeamId).toBe(0);
      expect(round.roundEndInfo.killedUnitId).toBe('some-guid');

      // Check the scoreboard after round 6
      const scores = [
        ['some-player-guid', 0],
        ['some-player-guid', 0],
        ['some-player-guid', 0],
        ['some-player-guid', 0],
        ['some-player-guid', 0],
        ['some-player-guid', 0],
      ];
      scores.forEach((score) => {
        expect(round.scoreboard[score[0]]).toBe(score[1]);
      });
    });
  });
});

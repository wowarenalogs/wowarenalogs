import { CombatResult, CombatUnitAffiliation, CombatUnitType } from '../src/types';
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

    it('should parse the shuffle as a match', () => {
      const shuffle = results.shuffles[0];
      const firstRound = results.shuffleRounds[0];
      const lastRound = results.shuffleRounds[5];

      expect(shuffle.startTime).toBe(1756347022553);
      expect(shuffle.startTime).toBe(firstRound.startTime);
      expect(shuffle.endTime).toBe(1756347984841);
      expect(shuffle.endTime).toBe(lastRound.endTime);
      expect(shuffle.timezone).toBe('America/New_York');

      expect(shuffle.endInfo.matchDurationInSeconds).toBe(155);
      expect(shuffle.durationInSeconds).toBe(962.288);
      expect(shuffle.endInfo.team0MMR).toBe(1729);
      expect(shuffle.endInfo.team1MMR).toBe(1730);
      expect(shuffle.endInfo.winningTeamId).toBe('0');

      expect(shuffle.rounds.length).toBe(6);
      expect(shuffle.dataType).toBe('ShuffleMatch');
      expect(shuffle.id).toBe(lastRound.id);
    });

    it('should parse round 0', () => {
      const round = results.shuffleRounds[0];

      const totem = round.units['Creature-0-3132-1504-17829-100943-00002FBA9D'];
      expect(totem.name).toBe('Earthen Wall Totem');
      expect(totem.type).toBe(CombatUnitType.Guardian);

      // hamlindigo Player-60-0FBAAEF3
      const team0Ids = ['Player-5-0E6A77BA', 'Player-120-05DF010C', 'Player-11-0EA1CFD3'];
      const team1Ids = ['Player-60-0FBAAEF3', 'Player-61-0FBBCD8C', 'Player-60-0F9D7A1B'];

      expect(round.units[team1Ids[0]].affiliation).toBe(CombatUnitAffiliation.Mine);
      expect(round.units[team1Ids[1]].affiliation).toBe(CombatUnitAffiliation.Party);
      expect(round.units[team1Ids[2]].affiliation).toBe(CombatUnitAffiliation.Party);

      expect(round.units[team0Ids[0]].affiliation).toBe(CombatUnitAffiliation.Outsider);
      expect(round.units[team0Ids[1]].affiliation).toBe(CombatUnitAffiliation.Outsider);
      expect(round.units[team0Ids[2]].affiliation).toBe(CombatUnitAffiliation.Outsider);

      expect(round.playerId).toBe(team1Ids[0]);

      team1Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe('1'));
      team0Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe('0'));

      expect(round.id).toBe('67cf17bff3b98800f8c6489ef1acd8ab');
      expect(round.dataType).toBe('ShuffleRound');
      expect(round.sequenceNumber).toBe(0);
      expect(round.winningTeamId).toBe('0');
      expect(round.killedUnitId).toBe('Player-60-0F9D7A1B');

      expect(round.timezone).toBe('America/New_York');
      expect(round.startTime).toBe(1756347022553);
      expect(round.endTime).toBe(1756347202724);
      expect(round.hasAdvancedLogging).toBe(true);
      expect(round.playerTeamId).toBe('1');
      expect(round.playerTeamRating).toBe(0);
      expect(round.result).toBe(CombatResult.Lose);

      expect(Math.round(round.durationInSeconds)).toBe(180);
      expect(round.durationInSeconds).toBe((round.endTime - round.startTime) / 1000);

      expect(round.shuffleMatchEndInfo).toBeFalsy();
      expect(round.shuffleMatchResult).toBeFalsy();

      // Check the scoreboard after round 1
      const scores = [
        [team0Ids[0], 1],
        [team0Ids[1], 1],
        [team0Ids[2], 1],
        [team1Ids[0], 0],
        [team1Ids[1], 0],
        [team1Ids[2], 0],
      ];
      scores.forEach((score) => {
        expect(round.scoreboard.find((u) => u.unitId === score[0])?.wins).toBe(score[1]);
      });
    });

    it('should parse round 1', () => {
      const round = results.shuffleRounds[1];
      expect(round.sequenceNumber).toBe(1);
      expect(round.winningTeamId).toBe('0');
    });

    it('should parse round 2', () => {
      const round = results.shuffleRounds[2];
      expect(round.sequenceNumber).toBe(2);
      expect(round.winningTeamId).toBe('0');
    });

    it('should parse round 3', () => {
      const round = results.shuffleRounds[3];
      expect(round.sequenceNumber).toBe(3);
      expect(round.winningTeamId).toBe('0');
    });

    it('should parse round 4', () => {
      const round = results.shuffleRounds[4];
      expect(round.sequenceNumber).toBe(4);
      expect(round.winningTeamId).toBe('1');
    });

    it('should parse round 5', () => {
      const round = results.shuffleRounds[5];
      const team0Ids = ['Player-61-0FBBCD8C', 'Player-60-0F9D7A1B', 'Player-120-05DF010C'];
      const team1Ids = ['Player-5-0E6A77BA', 'Player-60-0FBAAEF3', 'Player-11-0EA1CFD3'];

      team0Ids.forEach((id) => {
        expect(round.units[id].info?.teamId).toBe('0');
      });
      team1Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe('1'));

      expect(round.sequenceNumber).toBe(5);

      expect(round.winningTeamId).toBe('1');
      expect(round.killedUnitId).toBe('Player-60-0F9D7A1B');

      expect(Math.round(round.durationInSeconds)).toBe(156);
      expect(round.durationInSeconds).toBe((round.endTime - round.startTime) / 1000);

      // Check the scoreboard after round 6
      const scores = [
        [team0Ids[0], 1],
        [team0Ids[1], 2],
        [team0Ids[2], 4],
        [team1Ids[0], 5],
        [team1Ids[1], 2],
        [team1Ids[2], 4],
      ];
      scores.forEach((score) => {
        expect(round.scoreboard.find((u) => u.unitId === score[0])?.wins).toBe(score[1]);
      });
    });
  });
});

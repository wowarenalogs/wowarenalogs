import { CombatResult, CombatUnitAffiliation, CombatUnitType } from '../src/types';
import { LoaderResults, loadLogFile } from './testLogLoader';

describe('solo shuffle tests', () => {
  describe('parsing a log with a complete solo shuffle', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
      errors: [],
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

      expect(shuffle.startTime).toBe(1734136389259);
      expect(shuffle.startTime).toBe(firstRound.startTime);
      expect(shuffle.endTime).toBe(1734136783080);
      expect(shuffle.endTime).toBe(lastRound.endTime);
      expect(shuffle.timezone).toBe('America/New_York');

      expect(shuffle.endInfo.matchDurationInSeconds).toBe(25);
      expect(shuffle.durationInSeconds).toBe(393.821);
      expect(shuffle.endInfo.team0MMR).toBe(1500);
      expect(shuffle.endInfo.team1MMR).toBe(1500);
      expect(shuffle.endInfo.winningTeamId).toBe('1');

      expect(shuffle.rounds.length).toBe(6);
      expect(shuffle.dataType).toBe('ShuffleMatch');
      expect(shuffle.id).toBe(lastRound.id);
    });

    it('should parse round 0', () => {
      const round = results.shuffleRounds[0];

      const totem = round.units['Creature-0-3884-1505-12983-60561-00001927DB'];
      expect(totem.name).toBe('Earthgrab Totem');
      expect(totem.type).toBe(CombatUnitType.Guardian);

      const team0Ids = ['Player-11-0E3E33C2', 'Player-60-0EBDD42A', 'Player-3684-0DF0B4B2'];
      const team1Ids = ['Player-54-0B7EB8E0', 'Player-1168-0A98486C', 'Player-162-09F354CE'];

      expect(round.units['Player-11-0E3E33C2'].affiliation).toBe(CombatUnitAffiliation.Party);
      expect(round.units['Player-60-0EBDD42A'].affiliation).toBe(CombatUnitAffiliation.Mine);
      expect(round.units['Player-3684-0DF0B4B2'].affiliation).toBe(CombatUnitAffiliation.Party);

      expect(round.units['Player-54-0B7EB8E0'].affiliation).toBe(CombatUnitAffiliation.Outsider);
      expect(round.units['Player-1168-0A98486C'].affiliation).toBe(CombatUnitAffiliation.Outsider);
      expect(round.units['Player-162-09F354CE'].affiliation).toBe(CombatUnitAffiliation.Outsider);

      expect(round.playerId).toBe('Player-60-0EBDD42A');

      team1Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe('1'));
      team0Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe('0'));

      expect(round.id).toBe('9ce503a8d5ebd79b8043b34cc23bf313');
      expect(round.dataType).toBe('ShuffleRound');
      expect(round.sequenceNumber).toBe(0);
      expect(round.winningTeamId).toBe('1');
      expect(round.killedUnitId).toBe('Player-3684-0DF0B4B2');

      expect(round.timezone).toBe('America/New_York');
      expect(round.startTime).toBe(1734136389259);
      expect(round.endTime).toBe(1734136424027);
      expect(round.hasAdvancedLogging).toBe(true);
      expect(round.playerTeamId).toBe('0');
      expect(round.playerTeamRating).toBe(0);
      expect(round.result).toBe(CombatResult.Lose);

      expect(Math.round(round.durationInSeconds)).toBe(35);
      expect(round.durationInSeconds).toBe((round.endTime - round.startTime) / 1000);

      expect(round.shuffleMatchEndInfo).toBeFalsy();
      expect(round.shuffleMatchResult).toBeFalsy();

      // Check the scoreboard after round 1
      const scores = [
        ['Player-54-0B7EB8E0', 1],
        ['Player-1168-0A98486C', 1],
        ['Player-162-09F354CE', 1],
        ['Player-11-0E3E33C2', 0],
        ['Player-60-0EBDD42A', 0],
        ['Player-3684-0DF0B4B2', 0],
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
      expect(round.winningTeamId).toBe('0');
    });

    it('should parse round 5', () => {
      const round = results.shuffleRounds[5];
      const team0Ids = ['Player-11-0E3E33C2', 'Player-60-0EBDD42A', 'Player-1168-0A98486C'];
      const team1Ids = ['Player-3684-0DF0B4B2', 'Player-54-0B7EB8E0', 'Player-162-09F354CE'];

      team0Ids.forEach((id) => {
        expect(round.units[id].info?.teamId).toBe('0');
      });
      team1Ids.forEach((id) => expect(round.units[id].info?.teamId).toBe('1'));

      expect(round.sequenceNumber).toBe(5);

      expect(round.winningTeamId).toBe('1');
      expect(round.killedUnitId).toBe('Player-60-0EBDD42A');

      expect(Math.round(round.durationInSeconds)).toBe(26);
      expect(round.durationInSeconds).toBe((round.endTime - round.startTime) / 1000);

      // Check the scoreboard after round 6
      const scores = [
        ['Player-54-0B7EB8E0', 4],
        ['Player-1168-0A98486C', 2],
        ['Player-162-09F354CE', 5],
        ['Player-11-0E3E33C2', 1],
        ['Player-60-0EBDD42A', 4],
        ['Player-3684-0DF0B4B2', 2],
      ];
      scores.forEach((score) => {
        expect(round.scoreboard.find((u) => u.unitId === score[0])?.wins).toBe(score[1]);
      });
    });
  });
});

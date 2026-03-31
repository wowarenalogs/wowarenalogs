import { CombatUnitReaction, CombatUnitType } from '../src/types';
import { LoaderResults, loadLogFile } from './testLogLoader';

describe('reaction normalization tests', () => {
  describe('parsing a shuffle log with contradictory reaction proofs', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
    };

    beforeAll(() => {
      const loaded = loadLogFile('ad6c60db729c858668343bdc7d92260b_round0_reduced.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    it('should parse as a complete shuffle with no arena match records', () => {
      expect(results.combats).toHaveLength(0);
      expect(results.malformedCombats).toHaveLength(0);
      expect(results.shuffleRounds).toHaveLength(1);
      expect(results.shuffles).toHaveLength(0);
    });

    it('should normalize player reactions from team ids for each round', () => {
      results.shuffleRounds.forEach((round) => {
        const players = Object.values(round.units).filter((u) => u.type === CombatUnitType.Player);
        const friendly = players.filter((u) => u.reaction === CombatUnitReaction.Friendly);
        const hostile = players.filter((u) => u.reaction === CombatUnitReaction.Hostile);

        expect(players.length).toBe(6);
        expect(friendly.length).toBe(3);
        expect(hostile.length).toBe(3);

        players.forEach((unit) => {
          expect(unit.info?.teamId).toBeDefined();
          const expectedReaction =
            unit.info?.teamId === round.playerTeamId ? CombatUnitReaction.Friendly : CombatUnitReaction.Hostile;
          expect(unit.reaction).toBe(expectedReaction);
        });
      });
    });
  });
});

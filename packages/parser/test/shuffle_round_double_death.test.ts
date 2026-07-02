import { CombatResult } from '../src/types';
import { LoaderResults, loadLogFile } from './testLogLoader';

// A shuffle round is a DRAW when both teams lose a player before the game closes out the
// round - i.e. a second opposite-team death lands before the next Arena Preparation aura
// (32727) is applied. A death after the prep aura belongs to the post-round window and
// must not turn the round into a draw.
describe('shuffle round draw detection', () => {
  describe('second opposite-team death before the prep aura (a draw)', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
    };

    beforeAll(() => {
      // one_solo_shuffle.txt with a second real death (Vaayl, team 0) injected 176ms after
      // round 1's round-ending kill (Kyberz, team 1) - well before the prep aura burst.
      const loaded = loadLogFile('shuffle_round_double_death.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    it('should still return a single shuffle match with 6 rounds', () => {
      expect(results.shuffleRounds).toHaveLength(6);
      expect(results.shuffles).toHaveLength(1);
      expect(results.combats).toHaveLength(0);
      expect(results.malformedCombats).toHaveLength(0);
    });

    it('should report the round as a draw with no winning team', () => {
      const round = results.shuffleRounds[0];
      expect(round.result).toBe(CombatResult.DrawGame);
      expect(round.winningTeamId).toBe('');
      // First victim is still recorded
      expect(round.killedUnitId).toBe('Player-60-0F9D7A1B');
    });

    it('should award no scoreboard win to anyone for the drawn round', () => {
      const round = results.shuffleRounds[0];
      expect(round.scoreboard.every((s) => s.wins === 0)).toBe(true);
    });
  });

  describe('second death after the prep aura (not a draw)', () => {
    const results: LoaderResults = {
      combats: [],
      malformedCombats: [],
      shuffleRounds: [],
      shuffles: [],
    };

    beforeAll(() => {
      // Same log but the second death (Vaayl) lands ~1.5s AFTER the prep aura burst.
      const loaded = loadLogFile('shuffle_round_death_after_prep.txt');
      results.combats = loaded.combats;
      results.malformedCombats = loaded.malformedCombats;
      results.shuffleRounds = loaded.shuffleRounds;
      results.shuffles = loaded.shuffles;
    });

    it('should still return a single shuffle match with 6 rounds', () => {
      expect(results.shuffleRounds).toHaveLength(6);
      expect(results.shuffles).toHaveLength(1);
    });

    it('should credit the round to the first death normally', () => {
      const round = results.shuffleRounds[0];
      expect(round.result).not.toBe(CombatResult.DrawGame);
      expect(round.killedUnitId).toBe('Player-60-0F9D7A1B');
      expect(round.winningTeamId).toBe('0');
    });
  });
});

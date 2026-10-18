import { CombatResult } from '../src/types';
import { LoaderResults, loadLogFile } from './testLogLoader';

// one_solo_shuffle.txt with its final ARENA_MATCH_END line removed, then flushed - what
// happens when the app quits or the log goes idle right after the 6th round.
describe('parsing a solo shuffle whose final round is only recovered via flush', () => {
  const results: LoaderResults = {
    combats: [],
    malformedCombats: [],
    shuffleRounds: [],
    shuffles: [],
  };

  beforeAll(() => {
    const loaded = loadLogFile('shuffle_flush_before_match_end.txt');
    results.combats = loaded.combats;
    results.malformedCombats = loaded.malformedCombats;
    results.shuffleRounds = loaded.shuffleRounds;
    results.shuffles = loaded.shuffles;
  });

  it('should still recover all 6 rounds and a completed shuffle match', () => {
    expect(results.shuffleRounds).toHaveLength(6);
    expect(results.shuffles).toHaveLength(1);
    expect(results.combats).toHaveLength(0);
    expect(results.malformedCombats).toHaveLength(0);
  });

  it('should derive the match result from the recording player scoreboard tally', () => {
    const shuffle = results.shuffles[0];
    const lastRound = results.shuffleRounds[5];

    expect(shuffle.rounds.length).toBe(6);
    expect(shuffle.startTime).toBe(results.shuffleRounds[0].startTime);
    expect(shuffle.endTime).toBe(lastRound.endTime);
    expect(shuffle.id).toBe(lastRound.id);

    // Matches what the removed ARENA_MATCH_END reported.
    expect(shuffle.result).toBe(CombatResult.Lose);
    expect(shuffle.endInfo.winningTeamId).toBe('0');
  });
});

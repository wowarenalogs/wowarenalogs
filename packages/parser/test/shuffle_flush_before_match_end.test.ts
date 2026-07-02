import { CombatResult } from '../src/types';
import { LoaderResults, loadLogFile } from './testLogLoader';

// Regression test for a shuffle where the app/game closed (or the log went idle) right
// after the 6th round finished, before the ARENA_MATCH_END line for the whole match was
// ever written. This is `one_solo_shuffle.txt` with its final ARENA_MATCH_END line removed;
// `loadLogFile` always calls `parser.flush()` after reading, which is what would happen on
// app quit or an idle-timeout flush in the real app.
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

    // Same fixture as one_solo_shuffle.txt, whose real ARENA_MATCH_END reports
    // result=Lose, winningTeamId='0' for the recording player - confirms the
    // synthesized result matches what Blizzard actually reported.
    expect(shuffle.result).toBe(CombatResult.Lose);
    expect(shuffle.endInfo.winningTeamId).toBe('0');
  });
});

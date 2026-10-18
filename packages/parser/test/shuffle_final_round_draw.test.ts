import { CombatResult, CombatUnitType } from '../src/types';
import { loadLogFile, loadLogLines, readLogFileLines, shiftLogLineTimestamp } from './testLogLoader';

// The final round is closed by ARENA_MATCH_END rather than a prep aura burst, so it is the one
// round whose end is decided by the match ending. Measured across 19 real shuffle matches that
// lands 0.016s-0.966s after the round-deciding kill, but nothing covered the path before this.
describe('draw detection on the ARENA_MATCH_END round', () => {
  it('should decide the final round normally when only one player dies', () => {
    const finalRound = loadLogFile('one_solo_shuffle.txt').shuffleRounds[5];

    expect(finalRound.result).not.toBe(CombatResult.DrawGame);
    expect(finalRound.winningTeamId).not.toBe('');
  });

  it('should report a draw when an opposite-team death lands before ARENA_MATCH_END', () => {
    const baseline = loadLogFile('one_solo_shuffle.txt');
    const finalRound = baseline.shuffleRounds[5];

    const losingTeam = finalRound.units[finalRound.killedUnitId].info?.teamId;
    expect(typeof losingTeam).toBe('string');

    // Someone on the team that won the round; their death makes it a draw instead.
    const victim = Object.values(finalRound.units).find(
      (u) => u.type === CombatUnitType.Player && u.info?.teamId !== losingTeam,
    );
    if (!victim) throw new Error('expected to find a player on the winning team');

    const lines = readLogFileLines('one_solo_shuffle.txt');
    const roundStarts = lines.reduce<number[]>(
      (acc, l, i) => (l.includes('ARENA_MATCH_START') ? [...acc, i] : acc),
      [],
    );
    expect(roundStarts).toHaveLength(6);

    // The deciding kill of the LAST round specifically - the dead player also has UNIT_DIED
    // records in earlier rounds, and "unconscious at death" records (parameters[8] === 1) share
    // the event name. Injecting against the wrong one puts a stale timestamp in this segment.
    const killIndex = lines.findIndex((l, i) => {
      if (i < roundStarts[5] || !l.includes('UNIT_DIED') || !l.includes(finalRound.killedUnitId)) return false;
      return l.slice(l.indexOf('  ') + 2).split(',')[9] !== '1';
    });
    expect(killIndex).toBeGreaterThan(-1);

    // 200ms later: inside the draw window, and still ahead of ARENA_MATCH_END.
    const injected = shiftLogLineTimestamp(lines[killIndex], 200).replace(finalRound.killedUnitId, victim.id);
    const results = loadLogLines([...lines.slice(0, killIndex + 1), injected, ...lines.slice(killIndex + 1)]);

    expect(results.shuffleRounds).toHaveLength(6);

    const drawnRound = results.shuffleRounds[5];
    expect(drawnRound.result).toBe(CombatResult.DrawGame);
    expect(drawnRound.winningTeamId).toBe('');

    // A draw awards nobody a win, so the running tally must not move off round 5's.
    const totalWins = (round: typeof drawnRound) => round.scoreboard.reduce((sum, s) => sum + s.wins, 0);
    expect(totalWins(drawnRound)).toBe(totalWins(results.shuffleRounds[4]));
  });
});

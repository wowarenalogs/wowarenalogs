import { SHUFFLE_DRAW_WINDOW_MS } from '../src/pipeline/retail/constants';
import { CombatResult, CombatUnitType } from '../src/types';
import { LoaderResults, loadLogFile, loadLogLines, readLogFileLines, shiftLogLineTimestamp } from './testLogLoader';

// A prep aura burst arrives ~6s after the round-deciding kill, so the segment boundary alone
// would call an opposite-team death 5s later a draw. SHUFFLE_DRAW_WINDOW_MS is what keeps the
// rule to "both teams lost a player together".
describe('the shuffle draw window', () => {
  let baseline: LoaderResults;
  let lines: string[];
  let victimId: string;
  let killLineIndex: number;

  beforeAll(() => {
    baseline = loadLogFile('one_solo_shuffle.txt');
    lines = readLogFileLines('one_solo_shuffle.txt');

    const round = baseline.shuffleRounds[0];
    const losingTeam = round.units[round.killedUnitId].info?.teamId;
    const victim = Object.values(round.units).find(
      (u) => u.type === CombatUnitType.Player && u.info?.teamId !== losingTeam,
    );
    if (!victim) throw new Error('expected to find a player on the winning team');
    victimId = victim.id;

    // The round-deciding kill: a UNIT_DIED for the dead player that is a real death, not one of
    // the "unconscious at death" records (parameters[8] === 1) that share the event name.
    killLineIndex = lines.findIndex((l) => {
      if (!l.includes('UNIT_DIED') || !l.includes(round.killedUnitId)) return false;
      const fields = l.slice(l.indexOf('  ') + 2).split(',');
      return fields[9] !== '1';
    });
    expect(killLineIndex).toBeGreaterThan(-1);
  });

  const injectDeathAfter = (offsetMs: number): LoaderResults => {
    const killLine = lines[killLineIndex];
    const shifted = shiftLogLineTimestamp(killLine, offsetMs).replace(baseline.shuffleRounds[0].killedUnitId, victimId);
    return loadLogLines([...lines.slice(0, killLineIndex + 1), shifted, ...lines.slice(killLineIndex + 1)]);
  };

  it('should call it a draw when the second death lands inside the window', () => {
    const round = injectDeathAfter(SHUFFLE_DRAW_WINDOW_MS / 2).shuffleRounds[0];

    expect(round.result).toBe(CombatResult.DrawGame);
    expect(round.winningTeamId).toBe('');
    expect(round.scoreboard.every((s) => s.wins === 0)).toBe(true);
  });

  it('should not call it a draw when the second death lands past the window', () => {
    // Still well before the prep aura burst that closes the segment ~6s after the kill, so only
    // the draw window can exclude it.
    const round = injectDeathAfter(SHUFFLE_DRAW_WINDOW_MS * 2).shuffleRounds[0];

    expect(round.result).not.toBe(CombatResult.DrawGame);
    expect(round.winningTeamId).not.toBe('');
    expect(round.killedUnitId).toBe(baseline.shuffleRounds[0].killedUnitId);
  });
});

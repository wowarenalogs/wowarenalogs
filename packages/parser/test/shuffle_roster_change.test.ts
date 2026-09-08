import { CombatUnitType } from '../src/types';
import { LoaderResults, loadLogFile, loadLogLines, readLogFileLines, shiftLogLineTimestamp } from './testLogLoader';

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const SUBSTITUTE_PLAYER_ID = 'Player-99-0AAAAAAA';

// Quitting mid-match and queueing again produces no zone change, and the new match's rounds are
// later in time, so neither the zone-out reset nor the contiguity check sees anything wrong. The
// roster is the only thing that differs: a shuffle keeps the same six players throughout.
describe('a truncated shuffle followed by a later shuffle with a different roster', () => {
  const results: LoaderResults = {
    combats: [],
    malformedCombats: [],
    shuffleRounds: [],
    shuffles: [],
  };

  beforeAll(() => {
    const baseline = loadLogFile('one_solo_shuffle.txt');
    const firstRound = baseline.shuffleRounds[0];

    // Swap one player out of the second match so its roster differs by exactly one seat.
    const replaced = Object.values(firstRound.units).find(
      (u) => u.type === CombatUnitType.Player && u.id !== firstRound.killedUnitId,
    );
    if (!replaced) throw new Error('expected to find a player to substitute');

    const lines = readLogFileLines('one_solo_shuffle.txt');
    const roundStarts = lines.reduce<number[]>(
      (acc, l, i) => (l.includes('ARENA_MATCH_START') ? [...acc, i] : acc),
      [],
    );
    expect(roundStarts).toHaveLength(6);

    // Match A stops after 5 rounds, leaving a partial match in the buffer.
    const matchA = lines.slice(0, roundStarts[5]);
    // Match B is the same log half an hour later, so every round is strictly after match A's -
    // the contiguity check cannot reject it - with one different player.
    const matchB = lines.map((l) =>
      shiftLogLineTimestamp(l, THIRTY_MINUTES_MS).split(replaced.id).join(SUBSTITUTE_PLAYER_ID),
    );

    const loaded = loadLogLines([...matchA, ...matchB]);
    results.combats = loaded.combats;
    results.malformedCombats = loaded.malformedCombats;
    results.shuffleRounds = loaded.shuffleRounds;
    results.shuffles = loaded.shuffles;
  });

  it('should report only the second match, not a splice of the two', () => {
    expect(results.shuffleRounds).toHaveLength(11);
    expect(results.shuffles).toHaveLength(1);
    expect(results.shuffles[0].rounds.map((r) => r.id)).toEqual(results.shuffleRounds.slice(5).map((r) => r.id));
  });

  it('should report the match whose roster contains the substitute', () => {
    const shuffle = results.shuffles[0];
    expect(shuffle.rounds).toHaveLength(6);

    shuffle.rounds.forEach((round) => {
      const roster = Object.values(round.units)
        .filter((u) => u.type === CombatUnitType.Player)
        .map((u) => u.id);
      expect(roster).toContain(SUBSTITUTE_PLAYER_ID);
    });
  });
});

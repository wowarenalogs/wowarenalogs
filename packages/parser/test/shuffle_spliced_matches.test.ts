import { LoaderResults, loadLogLines, readLogFileLines } from './testLogLoader';

// A shuffle that stops after 5 rounds, followed by a complete shuffle on the same map. Every
// field roundsBelongToSameMatch compares (bracket / isRanked / item1 / zoneId) is identical
// across the two, so nothing but round contiguity can tell them apart. Built in memory rather
// than committed as a fixture because the inputs are ~92k lines each.
describe('a truncated shuffle followed by a second shuffle in the same arena', () => {
  const results: LoaderResults = {
    combats: [],
    malformedCombats: [],
    shuffleRounds: [],
    shuffles: [],
  };

  beforeAll(() => {
    const matchA = readLogFileLines('shuffle_flush_before_match_end.txt');
    const matchB = readLogFileLines('one_solo_shuffle.txt');

    // Cut match A at its 6th ARENA_MATCH_START so only 5 rounds are ever buffered.
    const roundStarts = matchA.reduce<number[]>((acc, line, index) => {
      if (line.includes('ARENA_MATCH_START')) acc.push(index);
      return acc;
    }, []);
    expect(roundStarts).toHaveLength(6);

    const loaded = loadLogLines([...matchA.slice(0, roundStarts[5]), ...matchB]);
    results.combats = loaded.combats;
    results.malformedCombats = loaded.malformedCombats;
    results.shuffleRounds = loaded.shuffleRounds;
    results.shuffles = loaded.shuffles;
  });

  it('should not fabricate a match out of rounds from both shuffles', () => {
    // 5 rounds from the truncated match plus 6 from the complete one.
    expect(results.shuffleRounds).toHaveLength(11);
    // Only the complete match may be reported.
    expect(results.shuffles).toHaveLength(1);

    // The counts above hold even when the rounds are spliced, so pin down which rounds were
    // reported: they must be the 6 emitted after the truncated match, not 5 of its rounds
    // topped up by the second match's first.
    expect(results.shuffles[0].rounds.map((r) => r.id)).toEqual(results.shuffleRounds.slice(5).map((r) => r.id));
  });

  it('should report the second match, with all 6 of its own rounds', () => {
    const shuffle = results.shuffles[0];
    expect(shuffle.rounds).toHaveLength(6);

    // The rounds of a real match are strictly sequential; a spliced buffer is not.
    shuffle.rounds.forEach((round, i) => {
      expect(round.sequenceNumber).toBe(i);
      if (i > 0) {
        expect(round.startTime).toBeGreaterThanOrEqual(shuffle.rounds[i - 1].endTime);
      }
    });

    // Every round emitted after the splice point belongs to the second match.
    expect(shuffle.rounds[0].startTime).toBe(results.shuffleRounds[5].startTime);
    expect(shuffle.startTime).toBe(shuffle.rounds[0].startTime);
  });
});

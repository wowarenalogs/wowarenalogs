import { LoaderResults, loadLogFile } from './testLogLoader';

// A disconnect/reload mid-match writes a ZONE_CHANGE back INTO the arena the match is
// being played in. That must not be treated as a segment boundary: splitting the round
// there leaves a deathless fragment that can't be decoded, silently losing the round
// (and with it the 6-round match). Zoning out to a DIFFERENT zone (leaver/abort) is
// still a boundary - covered by shuffle_early_leaver.test.ts.
describe('parsing a shuffle with a reconnect zone-change mid-round', () => {
  const results: LoaderResults = {
    combats: [],
    malformedCombats: [],
    shuffleRounds: [],
    shuffles: [],
  };

  beforeAll(() => {
    // one_solo_shuffle.txt with ZONE_CHANGE,1504 (the match's own arena) injected into
    // round 1, ~22s before the round-ending kill.
    const loaded = loadLogFile('shuffle_reconnect_mid_round.txt');
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

  it('should keep round 0 intact across the reconnect', () => {
    const round = results.shuffleRounds[0];
    expect(round.killedUnitId).toBe('Player-60-0F9D7A1B');
    expect(round.winningTeamId).toBe('0');
  });
});

import { LoaderResults, loadLogFile } from './testLogLoader';

// Regression test for the most serious bug found in this session: a single unexpected segment
// used to permanently kill match detection for the rest of the session, not just fail once.
//
// segmentToCombat treats any segment bounded by two ZoneChange events as a battleground and
// routes it to BattlegroundData.readEvent, which throws "This is not possible but needed for
// TS (CombatantInfoAction)" if a COMBATANT_INFO line lands inside that segment - a real,
// reachable scenario (e.g. walking from a city into a queue). Since that throw happened inside
// an rxjs map() with no error boundary, it terminated the *entire* subscription: every match
// played afterward in that session was silently lost until the app was restarted.
//
// This fixture is `hunter_priest_match.txt` (a real, complete 2v2) with a synthetic
// ZONE_CHANGE / COMBATANT_INFO / ZONE_CHANGE segment spliced in front of it, which reproduces
// the crash trigger. The fix wraps segmentToCombat's per-segment processing so a bad segment
// is dropped instead of killing the pipeline - so the real match after it must still come
// through.
describe('parsing a log where a battleground-shaped segment contains unexpected COMBATANT_INFO', () => {
  const results: LoaderResults = {
    combats: [],
    malformedCombats: [],
    shuffleRounds: [],
    shuffles: [],
  };

  beforeAll(() => {
    const loaded = loadLogFile('battleground_segment_crash_recovery.txt');
    results.combats = loaded.combats;
    results.malformedCombats = loaded.malformedCombats;
    results.shuffleRounds = loaded.shuffleRounds;
    results.shuffles = loaded.shuffles;
  });

  it('should drop the bad segment but keep processing the real match after it', () => {
    expect(results.combats).toHaveLength(1);
    expect(results.malformedCombats).toHaveLength(0);
  });
});

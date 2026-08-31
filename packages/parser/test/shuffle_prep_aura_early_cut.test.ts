import { loadLogFile } from './testLogLoader';

// Behavioral verification for the early-cut change: rounds 1-5 of a solo shuffle should now
// close on the next round's Arena Preparation (32727) aura burst, well before that round's
// ARENA_MATCH_START. We assert this by inspecting the last raw line of each emitted round.
describe('shuffle round early-cut on prep-aura burst', () => {
  const loaded = loadLogFile('one_solo_shuffle.txt');
  const rounds = loaded.shuffleRounds;

  it('emits 6 rounds', () => {
    expect(rounds).toHaveLength(6);
  });

  it('closes rounds 0-4 on a 32727 prep-aura apply, not on ARENA_MATCH_END/START', () => {
    for (let i = 0; i <= 4; i++) {
      const lastLine = rounds[i].rawLines[rounds[i].rawLines.length - 1];
      expect(lastLine).toContain('SPELL_AURA_APPLIED');
      expect(lastLine).toContain('32727');
      expect(lastLine).not.toContain('ARENA_MATCH_START');
    }
  });

  it('closes the final round (5) on ARENA_MATCH_END', () => {
    const lastLine = rounds[5].rawLines[rounds[5].rawLines.length - 1];
    expect(lastLine).toContain('ARENA_MATCH_END');
  });
});

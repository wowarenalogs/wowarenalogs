import { CombatUnitReaction } from '../src/types';
import { LoaderResults, loadLogFile } from './testLogLoader';

describe('parsing a log with heal-absorb (SPELL_HEAL_ABSORBED) events', () => {
  const results: LoaderResults = {
    combats: [],
    malformedCombats: [],
    shuffleRounds: [],
    shuffles: [],
  };

  beforeAll(() => {
    const loaded = loadLogFile('ad6c60db729c858668343bdc7d92260b_round0_reduced.txt');
    results.combats = loaded.combats;
    results.malformedCombats = loaded.malformedCombats;
    results.shuffleRounds = loaded.shuffleRounds;
    results.shuffles = loaded.shuffles;
  });

  it('credits the heal-absorb applier (source) with healAbsorbsOut', () => {
    expect(results.shuffleRounds).toHaveLength(1);
    const round = results.shuffleRounds[0];

    // Musfångarn-TarrenMill applied Necrotic Wound (a DK heal-absorb) to the enemy Xabotr.
    const applierId = 'Player-1084-0B234587';
    const targetId = 'Player-3682-0917BD25';

    const applier = round.units[applierId];
    const target = round.units[targetId];

    // All 21 heal-absorbs are pressure from the applier onto the enemy target.
    expect(applier.healAbsorbsOut).toHaveLength(21);
    expect(target.healAbsorbsIn).toHaveLength(21);

    // The applier does not receive healing-denied-against-them, and the target does not
    // get credited with applying any heal-absorbs.
    expect(applier.healAbsorbsIn).toHaveLength(0);
    expect(target.healAbsorbsOut).toHaveLength(0);

    // healAbsorbsOut records the source (applier) and dest (target), and the base spell is
    // the heal-absorb ability (Necrotic Wound), not the eaten heal.
    applier.healAbsorbsOut.forEach((a) => {
      expect(a.srcUnitId).toBe(applierId);
      expect(a.destUnitId).toBe(targetId);
      expect(a.spellName).toBe('Necrotic Wound');
    });

    // Total healing denied matches the raw absorbed amounts in the log.
    const totalDenied = applier.healAbsorbsOut.reduce((sum, a) => sum + a.absorbedAmount, 0);
    expect(totalDenied).toBe(21165);

    // effectiveAmount equals absorbedAmount because the target is a player.
    const totalEffective = applier.healAbsorbsOut.reduce((sum, a) => sum + a.effectiveAmount, 0);
    expect(totalEffective).toBe(21165);
  });

  it('reads the healer and the denied heal from the trailing fields', () => {
    const round = results.shuffleRounds[0];
    const applier = round.units['Player-1084-0B234587'];
    const targetId = 'Player-3682-0917BD25';

    // CombatAbsorbAction reuses its shield fields here: shieldOwner is the healer whose heal
    // was eaten (the target healing itself) and shieldSpell is that heal, not the absorb.
    const deniedHeals: Record<string, number> = {};
    applier.healAbsorbsOut.forEach((a) => {
      expect(a.shieldOwnerUnitId).toBe(targetId);
      deniedHeals[a.shieldSpellName] = (deniedHeals[a.shieldSpellName] ?? 0) + 1;
    });
    expect(deniedHeals).toEqual({ Leech: 10, 'Fueled by Violence': 9, 'Pain and Gain': 2 });
  });

  it('applies heal-absorb pressure across enemy lines (applier vs target are hostile)', () => {
    const round = results.shuffleRounds[0];
    const applier = round.units['Player-1084-0B234587'];
    const target = round.units['Player-3682-0917BD25'];

    expect(applier.reaction).toBe(CombatUnitReaction.Friendly);
    expect(target.reaction).toBe(CombatUnitReaction.Hostile);
  });
});

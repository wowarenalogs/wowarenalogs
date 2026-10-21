import { from } from 'rxjs';

import { CombatData } from '../src/CombatData';
import { logLineToCombatEvent } from '../src/pipeline/common/logLineToCombatEvent';
import { stringToLogLine } from '../src/pipeline/common/stringToLogLine';
import { CombatEvent } from '../src/types';

const readLines = (lines: string[]) => {
  const combat = new CombatData('retail', 'America/Chicago');
  from(lines)
    .pipe(stringToLogLine('America/Chicago'), logLineToCombatEvent('retail'))
    .forEach((e: CombatEvent | string) => {
      if (typeof e !== 'string') {
        combat.readEvent(e);
      }
    });
  return combat;
};

const ghoul = 'Creature-0-3133-2547-158047-237409-0000D57C61';
const varlom = 'Player-3676-0E6727DD';

describe('meter accuracy', () => {
  const attackerSwing =
    '10/18/2026 20:12:07.508-6  SWING_DAMAGE,Creature-0-3133-2547-158047-237409-0000D57C61,"Lesser Ghoul",0x2112,0x80000000,Player-3676-0E6727DD,"Varlom-Area52-US",0x10548,0x80000000,Creature-0-3133-2547-158047-237409-0000D57C61,Player-60-0FF7AC07,454541,507910,1395,1396,2366,0,0,0,3,39,100,0,237.18,252.45,0,1.8715,338,583,1267,-1,1,0,0,311,nil,nil,nil';
  const victimSwing =
    '10/18/2026 20:12:07.509-6  SWING_DAMAGE_LANDED,Creature-0-3133-2547-158047-237409-0000D57C61,"Lesser Ghoul",0x2112,0x80000000,Player-3676-0E6727DD,"Varlom-Area52-US",0x10548,0x80000000,Player-3676-0E6727DD,0000000000000000,513853,1279832,466,5186,2238,3994,0,0,0,246685,250000,0,238.29,253.29,0,5.5529,343,850,1267,-1,1,0,0,44,nil,nil,nil';

  it.each([
    ['attacker side first', [attackerSwing, victimSwing]],
    ['victim side first', [victimSwing, attackerSwing]],
  ])('counts a swing logged from both sides once, %s', (_, lines) => {
    const combat = readLines(lines);
    expect(combat.units[ghoul].damageOut.map((a) => a.effectiveAmount)).toEqual([-850]);
    expect(combat.units[varlom].damageIn).toHaveLength(1);
    expect(combat.events).toHaveLength(1);
  });

  it('counts a swing logged only from the victim side', () => {
    const combat = readLines([
      '10/18/2026 20:11:46.626-6  SWING_DAMAGE_LANDED,Creature-0-3133-2547-158047-237409-0000D57C62,"Lesser Ghoul",0xa28,0x80000000,Player-3676-0E6727DD,"Varlom-Area52-US",0x548,0x80000000,Player-3676-0E6727DD,0000000000000000,1127960,1163484,466,5137,2238,3633,0,0,0,238560,250000,0,241.91,254.54,0,0.9995,343,485,899,-1,1,0,0,25,nil,nil,nil',
    ]);
    expect(
      combat.units['Creature-0-3133-2547-158047-237409-0000D57C62'].damageOut.map((a) => a.effectiveAmount),
    ).toEqual([-485]);
  });

  it('does not credit absorbed self-damage as damage done', () => {
    const priest = 'Player-11-0EA06676';
    const combat = readLines([
      '10/18/2026 20:32:57.402-6  SPELL_ABSORBED,Player-11-0EA06676,"Chatbanssuck-Tichondrius-US",0x548,0x80000000,Player-11-0EA06676,"Chatbanssuck-Tichondrius-US",0x548,0x80000000,361029,"Time Dilation",0x1,Player-11-0EA06676,"Chatbanssuck-Tichondrius-US",0x548,0x80000000,114214,"Angelic Bulwark",0x2,60205,60204,nil',
    ]);
    expect(combat.units[priest].damageOut).toEqual([]);
    expect(combat.units[priest].absorbsOut).toHaveLength(1);
  });

  it('counts the heal-absorbed part of a heal', () => {
    const dh = 'Player-57-0DB04FB9';
    const combat = readLines([
      '10/18/2026 20:11:50.752-6  SPELL_HEAL,Player-57-0DB04FB9,"Meowycat-Illidan-US",0x548,0x80000000,Player-57-0DB04FB9,"Meowycat-Illidan-US",0x548,0x80000000,143924,"Leech",0x1,Player-57-0DB04FB9,0000000000000000,888569,1043584,4043,744,1252,2846,0,0,17,115,120,0,244.45,256.61,0,4.1803,344,11,13,0,2,nil',
    ]);
    expect(combat.units[dh].healOut.map((a) => a.effectiveAmount)).toEqual([13]);
  });

  it('does not count delayed-damage absorbs as healing', () => {
    const evoker = 'Player-60-0EFF479D';
    const combat = readLines([
      '10/18/2026 20:11:44.190-6  SPELL_ABSORBED,Player-3676-0E6727DD,"Varlom-Area52-US",0x548,0x80000000,Player-60-0EFF479D,"Teritwo-Stormrage-US",0x512,0x80000000,1287663,"Rune of Lingering",0x6a,Player-60-0EFF479D,"Teritwo-Stormrage-US",0x512,0x80000000,410355,"Stretch Time",0x40,287,343,nil',
    ]);
    expect(combat.units[evoker].absorbsOut).toEqual([]);
    expect(combat.units[varlom].damageOut).toHaveLength(1);
  });

  it('counts Fel Armor as neither healing nor damage done', () => {
    const dk = 'Player-60-0FF7AC07';
    const combat = readLines([
      '10/18/2026 20:11:47.297-6  SPELL_ABSORBED,Player-60-0FF7AC07,"Grippydengo-Stormrage-US",0x512,0x80000040,Player-3676-0E6727DD,"Varlom-Area52-US",0x10548,0x80000000,191587,"Virulent Plague",0x20,Player-3676-0E6727DD,"Varlom-Area52-US",0x10548,0x80000000,386124,"Fel Armor",0x20,-12948,3586,nil',
    ]);
    expect(combat.units[varlom].absorbsOut).toEqual([]);
    expect(combat.units[dk].damageOut).toEqual([]);
  });

  it('pairs absorb support with its own shield, not the last absorb', () => {
    const combat = readLines([
      '10/18/2026 20:11:51.400-6  SPELL_AURA_APPLIED,Player-60-0EFF479D,"Teritwo-Stormrage-US",0x512,0x80000000,Player-3676-0E6727DD,"Varlom-Area52-US",0x10548,0x80000000,413984,"Shifting Sands",0x40,BUFF',
      '10/18/2026 20:11:51.462-6  SPELL_ABSORBED,Player-57-0DB04FB9,"Meowycat-Illidan-US",0x548,0x80000000,Player-3676-0E6727DD,"Varlom-Area52-US",0x10548,0x80000000,198030,"Eye Beam",0x7c,Player-3676-0E6727DD,"Varlom-Area52-US",0x10548,0x80000000,108366,"Soul Leech",0x20,9862,13534,nil',
      '10/18/2026 20:11:51.462-6  SPELL_ABSORBED,Player-60-0FF7AC07,"Grippydengo-Stormrage-US",0x512,0x80000040,Player-3676-0E6727DD,"Varlom-Area52-US",0x10548,0x80000000,191587,"Virulent Plague",0x20,Player-3676-0E6727DD,"Varlom-Area52-US",0x10548,0x80000000,386124,"Fel Armor",0x20,1000,3586,nil',
      '10/18/2026 20:11:51.462-6  SPELL_ABSORBED_SUPPORT,Player-57-0DB04FB9,"Meowycat-Illidan-US",0x548,0x80000000,Player-3676-0E6727DD,"Varlom-Area52-US",0x10548,0x80000000,198030,"Eye Beam",0x7c,Player-3676-0E6727DD,"Varlom-Area52-US",0x10548,0x80000000,413984,"Shifting Sands",0x40,392,538,nil,Player-60-0EFF479D',
    ]);
    expect(combat.units[varlom].supportAbsorbIn.map((a) => a.supportedShieldSpellId)).toEqual(['108366']);
  });
});

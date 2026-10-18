import { from } from 'rxjs';

import {
  CombatAbsorbSupportAction,
  CombatSupportAction,
  getCreditedAbsorbs,
  getCreditedDamage,
  getCreditedDamageTaken,
} from '../src';
import { CombatAction } from '../src/actions/CombatAction';
import { CombatGenerator } from '../src/CombatGenerator';
import { CombatUnit } from '../src/CombatUnit';
import { logLineToCombatEvent } from '../src/pipeline/common/logLineToCombatEvent';
import { stringToLogLine } from '../src/pipeline/common/stringToLogLine';
import { CombatEvent, CombatUnitReaction } from '../src/types';

const parseLines = (lines: string[]) => {
  const results: (CombatEvent | string)[] = [];
  from(lines)
    .pipe(stringToLogLine('America/Chicago'), logLineToCombatEvent('retail'))
    .forEach((e) => results.push(e));
  return results;
};

describe('augmentation evoker events', () => {
  it('parses SPELL_ABSORBED_SUPPORT for a spell absorb', () => {
    const [event] = parseLines([
      '10/16/2026 22:46:52.971-6  SPELL_ABSORBED_SUPPORT,Player-60-0A6A86CA,"Curtnasty-Stormrage-US",0x548,0x80000000,Player-60-0FEDDE18,"Marminale-Stormrage-US",0x511,0x80000020,1240996,"Dread Plague",0x20,Player-60-0FEDDE18,"Marminale-Stormrage-US",0x511,0x80000020,413984,"Shifting Sands",0x40,103,129,nil,Player-60-0EFF479D',
    ]);
    expect(event).toBeInstanceOf(CombatAbsorbSupportAction);
    const action = event as CombatAbsorbSupportAction;
    expect(action.spellName).toBe('Dread Plague');
    expect(action.shieldOwnerUnitId).toBe('Player-60-0FEDDE18');
    expect(action.shieldSpellName).toBe('Shifting Sands');
    expect(action.absorbedAmount).toBe(103);
    expect(action.supportActorId).toBe('Player-60-0EFF479D');
  });

  it('parses SPELL_ABSORBED_SUPPORT for a melee absorb', () => {
    const [event] = parseLines([
      '10/15/2026 19:26:51.369-6  SPELL_ABSORBED_SUPPORT,Creature-0-4229-3095-13996-268190-0000517D54,"Venomous Hulk",0xa48,0x80000000,Player-55-09A98648,"Fundus-Whisperwind-US",0x40514,0x80000000,Player-55-09A98648,"Fundus-Whisperwind-US",0x40514,0x80000000,413984,"Shifting Sands",0x40,8335,56519,nil,Player-76-0B8E5378',
    ]);
    expect(event).toBeInstanceOf(CombatAbsorbSupportAction);
    const action = event as CombatAbsorbSupportAction;
    expect(action.spellId).toBeNull();
    expect(action.shieldOwnerUnitId).toBe('Player-55-09A98648');
    expect(action.shieldSpellName).toBe('Shifting Sands');
    expect(action.absorbedAmount).toBe(8335);
    expect(action.supportActorId).toBe('Player-76-0B8E5378');
  });

  it('parses empower events as combat actions', () => {
    const events = parseLines([
      '10/16/2026 22:33:57.300-6  SPELL_EMPOWER_START,Player-60-0EFF479D,"Teritwo-Stormrage-US",0x512,0x80000000,Player-60-0EFF479D,"Teritwo-Stormrage-US",0x512,0x80000000,357208,"Fire Breath",0x4',
      '10/16/2026 22:33:58.068-6  SPELL_EMPOWER_END,Player-60-0EFF479D,"Teritwo-Stormrage-US",0x512,0x80000000,0000000000000000,nil,0x80000000,0x80000000,357208,"Fire Breath",0x4,1',
      '10/16/2026 22:58:42.552-6  SPELL_EMPOWER_INTERRUPT,Creature-0-3138-572-143344-253466-0000530075,"Future Self",0x2112,0x80000000,0000000000000000,nil,0x80000000,0x80000000,396286,"Upheaval",0xc,3',
    ]);
    expect(events).toHaveLength(3);
    events.forEach((e) => expect(e).toBeInstanceOf(CombatAction));
    expect((events[1] as CombatAction).spellName).toBe('Fire Breath');
  });

  it('reads the support actor from the last field of current-format support events', () => {
    const [event] = parseLines([
      '10/16/2026 22:51:18.609-6  SPELL_DAMAGE_SUPPORT,Player-60-0FF7AC07,"Grippydengo-Stormrage-US",0x512,0x80000040,Player-11-0EBC189C,"Samelan-Tichondrius-US",0x10548,0x80000000,434481,"Bombardments",0xc,Player-11-0EBC189C,0000000000000000,227203,951420,466,4199,1003,3274,0,0,0,247690,250000,0,1319.38,812.34,0,2.7147,338,14428,11838,-1,12,0,0,0,1,nil,nil,Player-60-0EFF479D',
    ]);
    expect(event).toBeInstanceOf(CombatSupportAction);
    expect((event as CombatSupportAction).supportActorId).toBe('Player-60-0EFF479D');
  });

  it('reads the absorbed share of a fully absorbed support hit', () => {
    const [event] = parseLines([
      '10/16/2026 22:54:55.429-6  SPELL_DAMAGE_SUPPORT,Player-60-0FF7AC07,"Grippydengo-Stormrage-US",0x512,0x80000040,Player-3675-0B07C559,"Wisavtwo-MoonGuard-US",0x10548,0x80000000,434481,"Bombardments",0xc,0000000000000000,0000000000000000,0,0,0,0,0,0,0,0,-1,0,0,0,0.00,0.00,0,0.0000,0,0,35934,-1,0,0,0,10440,nil,nil,nil,Player-60-0EFF479D',
    ]);
    const action = event as CombatSupportAction;
    expect(Math.abs(action.effectiveAmount)).toBe(0);
    expect(action.effectiveAbsorbedAmount).toBe(10440);
  });

  describe('evoker procs triggered by an ally', () => {
    class TestGenerator extends CombatGenerator {
      public feed(events: (CombatEvent | string)[]) {
        events.forEach((e) => {
          const action = e as CombatAction;
          this.parseEvent(this.units[action.srcUnitId], this.units[action.destUnitId], action);
        });
      }
    }

    const evokerId = 'Player-60-0EFF479D';
    const allyId = 'Player-60-0FF7AC07';
    const generator = new TestGenerator('retail', 'America/Chicago');
    [
      [evokerId, 'Teritwo-Stormrage-US'],
      [allyId, 'Grippydengo-Stormrage-US'],
      ['Player-11-0EBC189C', 'Samelan-Tichondrius-US'],
      ['Player-3675-0B07C559', 'Wisavtwo-MoonGuard-US'],
      ['Player-11-0EBCE3F3', 'Kadbane-Tichondrius-US'],
      ['Player-60-0A6A86CA', 'Curtnasty-Stormrage-US'],
    ].forEach(([id, name]) => (generator.units[id] = new CombatUnit(id, name)));

    generator.feed(
      parseLines([
        // An ally's own hit, buffed by Ebon Might: only part of it is support, so it stays the ally's
        '10/16/2026 22:46:45.961-6  SPELL_DAMAGE,Player-60-0FF7AC07,"Grippydengo-Stormrage-US",0x512,0x80000040,Player-60-0A6A86CA,"Curtnasty-Stormrage-US",0x10548,0x80000000,343294,"Soul Reaper",0x30,Player-60-0A6A86CA,0000000000000000,736641,935920,4380,402,1828,3141,0,0,6,700,1000,0,-508.35,4173.56,0,5.7580,331,20783,25976,-1,48,0,0,4732,nil,nil,nil,ST',
        '10/16/2026 22:46:45.961-6  SPELL_DAMAGE_SUPPORT,Player-60-0FF7AC07,"Grippydengo-Stormrage-US",0x512,0x80000040,Player-60-0A6A86CA,"Curtnasty-Stormrage-US",0x10548,0x80000000,395152,"Ebon Might",0xc,Player-60-0A6A86CA,0000000000000000,736641,935920,4380,402,1828,3141,0,0,6,700,1000,0,-508.35,4173.56,0,5.7580,331,3032,3790,-1,48,0,0,690,nil,nil,nil,Player-60-0EFF479D',
        // Inferno's Blessing, partially absorbed: both the absorb and the damage move
        '10/16/2026 22:46:50.974-6  SPELL_ABSORBED,Player-60-0FF7AC07,"Grippydengo-Stormrage-US",0x512,0x80000040,Player-60-0A6A86CA,"Curtnasty-Stormrage-US",0x10548,0x80000000,410265,"Inferno\'s Blessing",0x4,Player-60-0A6A86CA,"Curtnasty-Stormrage-US",0x10548,0x80000000,206967,"Will of the Necropolis",0x1,4325,28328,nil',
        '10/16/2026 22:46:50.974-6  SPELL_DAMAGE,Player-60-0FF7AC07,"Grippydengo-Stormrage-US",0x512,0x80000040,Player-60-0A6A86CA,"Curtnasty-Stormrage-US",0x10548,0x80000000,410265,"Inferno\'s Blessing",0x4,Player-60-0A6A86CA,0000000000000000,258136,935920,4380,402,1828,3141,0,0,6,700,1000,0,-494.38,4160.49,0,4.5445,331,16608,28328,-1,4,0,0,8107,nil,nil,nil,ST',
        '10/16/2026 22:46:50.974-6  SPELL_DAMAGE_SUPPORT,Player-60-0FF7AC07,"Grippydengo-Stormrage-US",0x512,0x80000040,Player-60-0A6A86CA,"Curtnasty-Stormrage-US",0x10548,0x80000000,410265,"Inferno\'s Blessing",0x4,Player-60-0A6A86CA,0000000000000000,258136,935920,4380,402,1828,3141,0,0,6,700,1000,0,-494.38,4160.49,0,4.5445,331,16608,28328,-1,4,0,0,8107,nil,nil,nil,Player-60-0EFF479D',
        // A Bombardments hit that lands
        '10/16/2026 22:51:18.609-6  SPELL_DAMAGE,Player-60-0FF7AC07,"Grippydengo-Stormrage-US",0x512,0x80000040,Player-11-0EBC189C,"Samelan-Tichondrius-US",0x10548,0x80000000,434481,"Bombardments",0xc,Player-11-0EBC189C,0000000000000000,227203,951420,466,4199,1003,3274,0,0,0,247690,250000,0,1319.38,812.34,0,2.7147,338,14428,11838,-1,12,0,0,0,1,nil,nil,AOE',
        '10/16/2026 22:51:18.609-6  SPELL_DAMAGE_SUPPORT,Player-60-0FF7AC07,"Grippydengo-Stormrage-US",0x512,0x80000040,Player-11-0EBC189C,"Samelan-Tichondrius-US",0x10548,0x80000000,434481,"Bombardments",0xc,Player-11-0EBC189C,0000000000000000,227203,951420,466,4199,1003,3274,0,0,0,247690,250000,0,1319.38,812.34,0,2.7147,338,14428,11838,-1,12,0,0,0,1,nil,nil,Player-60-0EFF479D',
        // A hit that is fully absorbed; the _SUPPORT line comes a millisecond later
        '10/16/2026 22:54:55.428-6  SPELL_ABSORBED,Player-60-0FF7AC07,"Grippydengo-Stormrage-US",0x512,0x80000040,Player-3675-0B07C559,"Wisavtwo-MoonGuard-US",0x10548,0x80000000,434481,"Bombardments",0xc,Player-3675-0B07C559,"Wisavtwo-MoonGuard-US",0x10548,0x80000000,17,"Power Word: Shield",0x2,10440,35934,nil',
        '10/16/2026 22:54:55.429-6  SPELL_DAMAGE_SUPPORT,Player-60-0FF7AC07,"Grippydengo-Stormrage-US",0x512,0x80000040,Player-3675-0B07C559,"Wisavtwo-MoonGuard-US",0x10548,0x80000000,434481,"Bombardments",0xc,0000000000000000,0000000000000000,0,0,0,0,0,0,0,0,-1,0,0,0,0.00,0.00,0,0.0000,0,0,35934,-1,0,0,0,10440,nil,nil,nil,Player-60-0EFF479D',
        // Breath of Eons
        '10/16/2026 22:51:20.893-6  SPELL_DAMAGE,Player-60-0FF7AC07,"Grippydengo-Stormrage-US",0x512,0x80000040,Player-11-0EBCE3F3,"Kadbane-Tichondrius-US",0x548,0x80000000,409632,"Breath of Eons",0x40,Player-11-0EBCE3F3,0000000000000000,423196,966620,4102,3944,2616,3896,301,0,0,239579,262500,0,1321.13,798.98,0,5.1728,335,32367,37930,-1,64,0,0,0,1,nil,nil,ST',
        '10/16/2026 22:51:20.893-6  SPELL_DAMAGE_SUPPORT,Player-60-0FF7AC07,"Grippydengo-Stormrage-US",0x512,0x80000040,Player-11-0EBCE3F3,"Kadbane-Tichondrius-US",0x548,0x80000000,409632,"Breath of Eons",0x40,Player-11-0EBCE3F3,0000000000000000,423196,966620,4102,3944,2616,3896,301,0,0,239579,262500,0,1321.13,798.98,0,5.1728,335,32367,37930,-1,64,0,0,0,1,nil,nil,Player-60-0EFF479D',
      ]),
    );

    it('credits proc hits to the evoker and leaves buffed hits with the ally', () => {
      const spellsOf = (id: string) => generator.units[id].damageOut.map((a) => `${a.logLine.event} ${a.spellName}`);
      expect(spellsOf(allyId)).toEqual(['SPELL_DAMAGE Soul Reaper']);
      expect(spellsOf(evokerId)).toEqual([
        "SPELL_DAMAGE Inferno's Blessing",
        "SPELL_ABSORBED Inferno's Blessing",
        'SPELL_DAMAGE Bombardments',
        'SPELL_ABSORBED Bombardments',
        'SPELL_DAMAGE Breath of Eons',
      ]);
    });

    it('counts only the buff as support', () => {
      const [support] = generator.units[allyId].supportDamageIn;
      expect(support.spellName).toBe('Ebon Might');
      expect(support.supportedSpell).toEqual({ spellId: '343294', spellName: 'Soul Reaper' });
      expect(generator.units[evokerId].supportDamageOut).toEqual([support]);
    });

    it('moves the buffed share of a hit from the ally to the evoker', () => {
      const sumBySpell = (id: string) => {
        const sums: Record<string, number> = {};
        getCreditedDamage(generator.units[id]).forEach((a) => {
          sums[a.spellName ?? ''] = (sums[a.spellName ?? ''] ?? 0) + a.effectiveAmount;
        });
        return sums;
      };
      // 3032 landed plus 690 of the absorbed part
      expect(sumBySpell(allyId)).toEqual({ 'Soul Reaper': 20783 - 3032 - 690 });
      expect(sumBySpell(evokerId)['Ebon Might']).toBe(3032 + 690);
    });

    it('leaves the buffed share on the ally when augmented', () => {
      expect(getCreditedDamage(generator.units[allyId], true).map((a) => [a.spellName, a.effectiveAmount])).toEqual([
        ['Soul Reaper', 20783],
      ]);
      expect(getCreditedDamage(generator.units[evokerId], true).map((a) => a.spellName)).not.toContain('Ebon Might');
    });

    it('credits moved procs to the evoker as the source', () => {
      const procs = getCreditedDamage(generator.units[evokerId]).filter((a) => a.spellName === 'Bombardments');
      expect(procs.map((a) => a.srcUnitId)).toEqual([evokerId, evokerId]);
    });

    it('splits damage taken between the attacker and the evoker', () => {
      const takenBySource = (augmented: boolean) => {
        const sums: Record<string, number> = {};
        getCreditedDamageTaken(generator.units['Player-60-0A6A86CA'], generator.units, augmented).forEach((a) => {
          const key = `${a.srcUnitId} ${a.spellName}`;
          sums[key] = (sums[key] ?? 0) + a.effectiveAmount;
        });
        return sums;
      };
      expect(takenBySource(false)).toEqual({
        [`${allyId} Soul Reaper`]: 20783 - 3032,
        [`${evokerId} Ebon Might`]: 3032,
        [`${evokerId} Inferno's Blessing`]: 16608,
      });
      expect(takenBySource(true)).toEqual({
        [`${allyId} Soul Reaper`]: 20783,
        [`${evokerId} Inferno's Blessing`]: 16608,
      });
    });
  });

  it('ignores support lines that credit an evoker with an enemy hit', () => {
    class TestGenerator extends CombatGenerator {
      public feed(events: (CombatEvent | string)[]) {
        events.forEach((e) => {
          const action = e as CombatAction;
          this.parseEvent(this.units[action.srcUnitId], this.units[action.destUnitId], action);
        });
      }
    }
    const generator = new TestGenerator('retail', 'America/Chicago');
    const evoker = new CombatUnit('Player-60-0EFF479D', 'Teritwo-Stormrage-US');
    evoker.proveReaction(CombatUnitReaction.Friendly);
    const enemy = new CombatUnit('Player-1427-0E8B6252', 'Hzïra-Ragnaros-US');
    generator.units[evoker.id] = evoker;
    generator.units[enemy.id] = enemy;
    generator.units['Player-60-0FF7AC07'] = new CombatUnit('Player-60-0FF7AC07', 'Grippydengo-Stormrage-US');
    generator.feed(
      parseLines([
        '10/16/2026 23:59:57.475-6  SPELL_DAMAGE_SUPPORT,Player-1427-0E8B6252,"Hzïra-Ragnaros-US",0x548,0x80000000,Player-60-0FF7AC07,"Grippydengo-Stormrage-US",0x512,0x80000040,395152,"Ebon Might",0xc,Player-60-0FF7AC07,0000000000000000,522743,963060,5234,402,1825,3358,0,0,6,930,1000,0,1402.42,1234.74,0,3.7955,333,3443,7269,-1,32,0,0,0,nil,nil,nil,Player-60-0EFF479D',
      ]),
    );
    expect(evoker.supportDamageOut).toEqual([]);
    expect(enemy.supportDamageIn).toEqual([]);
  });

  describe('Shifting Sands absorb support', () => {
    class TestGenerator extends CombatGenerator {
      public feed(events: (CombatEvent | string)[]) {
        events.forEach((e) => {
          const action = e as CombatAction;
          this.parseEvent(this.units[action.srcUnitId], this.units[action.destUnitId], action);
        });
      }
    }

    const evokerId = 'Player-60-0EFF479D';
    const monkId = 'Player-60-0FEDDE18';
    const generator = new TestGenerator('retail', 'America/Chicago');
    [
      [evokerId, 'Teritwo-Stormrage-US'],
      [monkId, 'Marminale-Stormrage-US'],
      ['Player-60-0A6A86CA', 'Curtnasty-Stormrage-US'],
    ].forEach(([id, name]) => (generator.units[id] = new CombatUnit(id, name)));

    generator.feed(
      parseLines([
        '10/16/2026 22:46:52.971-6  SPELL_ABSORBED,Player-60-0A6A86CA,"Curtnasty-Stormrage-US",0x548,0x80000000,Player-60-0FEDDE18,"Marminale-Stormrage-US",0x511,0x80000020,1240996,"Dread Plague",0x20,Player-60-0FEDDE18,"Marminale-Stormrage-US",0x511,0x80000020,414143,"Yu\'lon\'s Grace",0x8,2163,2709,nil',
        '10/16/2026 22:46:52.971-6  SPELL_ABSORBED_SUPPORT,Player-60-0A6A86CA,"Curtnasty-Stormrage-US",0x548,0x80000000,Player-60-0FEDDE18,"Marminale-Stormrage-US",0x511,0x80000020,1240996,"Dread Plague",0x20,Player-60-0FEDDE18,"Marminale-Stormrage-US",0x511,0x80000020,413984,"Shifting Sands",0x40,103,129,nil,Player-60-0EFF479D',
      ]),
    );

    it('pairs the support with the shield it added to', () => {
      const [support] = generator.units[monkId].supportAbsorbIn;
      expect(support.supportedShieldSpellName).toBe("Yu'lon's Grace");
      expect(generator.units[evokerId].supportAbsorbOut).toEqual([support]);
    });

    it('moves the supported share of the absorb from the shield owner to the evoker', () => {
      const sumBySpell = (id: string) => {
        const sums: Record<string, number> = {};
        getCreditedAbsorbs(generator.units[id]).forEach((a) => {
          sums[a.shieldSpellName] = (sums[a.shieldSpellName] ?? 0) + a.effectiveAmount;
        });
        return sums;
      };
      expect(sumBySpell(monkId)).toEqual({ "Yu'lon's Grace": 2163 - 103 });
      expect(sumBySpell(evokerId)).toEqual({ 'Shifting Sands': 103 });
    });
  });
});

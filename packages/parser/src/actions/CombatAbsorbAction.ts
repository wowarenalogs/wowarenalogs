import { ILogLine, WowVersion } from '../types';
import { parseQuotedName } from '../utils';
import { CombatAction } from './CombatAction';

export class CombatAbsorbAction extends CombatAction {
  public static supports(logLine: ILogLine): boolean {
    return super.supports(logLine) && logLine.event.endsWith('_ABSORBED');
  }

  public readonly absorbedAmount: number;

  public readonly shieldOwnerUnitName: string;
  public readonly shieldOwnerUnitId: string;
  public readonly shieldOwnerUnitFlags: number;

  public readonly shieldSpellId: string;
  public readonly shieldSpellName: string;
  public readonly shieldSpellSchool: string;
  public readonly critical: boolean | null;

  constructor(logLine: ILogLine, wowVersion: WowVersion) {
    super(logLine);
    if (!CombatAbsorbAction.supports(logLine)) {
      throw new Error('Event not supported as CombatAbsorbAction: ' + logLine.raw);
    }

    // classic are 17/20, sl are 18/21
    // 3 fields are missing for melee absorb events
    const meleeAbsorbOffset = logLine.parameters.length < 20 ? 3 : 0;

    // 8/20 22:11:20.529 SPELL_ABSORBED,
    //                0                     1              2       3
    // ATTACKER: Player-1084-09FC4747,"Acèdin-TarrenMill",0x10548,0x0,
    //                 4                  5               6   7
    // DEFENDER: Player-570-09AB722E, "Wuzzle-Azshara",0x511,0x0,
    //                  8            9           10
    // ATTACK SPELL: 184575,"Blade of Justice",0x1,
    //                    11                12             13   14
    // SHIELD OWNER: Player-570-09AB722E,"Wuzzle-Azshara",0x511,0x0,
    //                   15      16         17  18  19   20
    // SHIELD SPELL: 324867, "Fleshcraft",0x20,1830,3329,nil
    // spell id, spell name, spell school, absorbed amount, base incoming damage, crit flag

    // Classic
    // 5/21 16:34:31.398  SPELL_ABSORBED,
    //   0                        1               2    3
    // Player-4395-01C5EEA8,"Assinoth-Whitemane",0x511,0x0,
    //  4                       5                  6      7
    // Player-4700-01A0750A,"Darshath-Kirtonos",0x10548,0x0,
    //   8     9       10
    // 11269,"Ambush",0x1,
    //        11                   12               13   14
    // Player-4700-01A0750A,"Darshath-Kirtonos",0x10548,0x0,
    //  15    16                 17   18    19
    // 10901,"Power Word: Shield",0x2,1424,1518

    // 17 - melee - classic
    // 5/24 11:44:30.749  SPELL_ABSORBED,
    // Pet-0-4401-559-20609-17252-01004BFD4E,"Jhuuthun",0x1148,0x0,
    // Player-4399-0130E5C1,"Blury-Kurinnaxx",0x512,0x0,
    // Player-4399-0130E5C1,"Blury-Kurinnaxx",0x512,0x0,
    // 13033,"Ice Barrier",0x10,152,192

    // 18 - melee - retail, SL
    // 2/6 00:40:06.214  SPELL_ABSORBED,
    // Creature-0-3886-1505-13080-26125-00001E55D5,"Risen Ghoul",0x2148,0x0,
    // Player-57-0A628E42,"Teckkno-Illidan",0x512,0x0,
    // Player-57-0A628E42,"Teckkno-Illidan",0x512,0x0,
    // 17,"Power Word: Shield",0x2,70,156,nil

    this.shieldOwnerUnitId = logLine.parameters[11 - meleeAbsorbOffset].toString();
    this.shieldOwnerUnitName = parseQuotedName(logLine.parameters[12 - meleeAbsorbOffset]);
    this.shieldOwnerUnitFlags = logLine.parameters[13 - meleeAbsorbOffset];

    this.shieldSpellId = logLine.parameters[15 - meleeAbsorbOffset].toString();
    this.shieldSpellName = parseQuotedName(logLine.parameters[16 - meleeAbsorbOffset]);
    this.shieldSpellSchool = logLine.parameters[17 - meleeAbsorbOffset].toString();

    this.absorbedAmount = logLine.parameters[18 - meleeAbsorbOffset];

    if (wowVersion === 'retail') {
      this.critical = logLine.parameters[20 - meleeAbsorbOffset] === '1';
    } else {
      this.critical = null;
    }
  }
}

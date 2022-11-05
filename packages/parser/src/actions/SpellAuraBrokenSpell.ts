import { ILogLine, WowVersion } from '../types';
import { parseQuotedName } from '../utils';
import { CombatAction } from './CombatAction';

export class SpellAuraBrokenSpell extends CombatAction {
  public static supports(logLine: ILogLine): boolean {
    return super.supports(logLine) && logLine.event.endsWith('_BROKEN_SPELL');
  }

  public readonly breakingSpellId: string;
  public readonly breakingSpellName: string;

  constructor(logLine: ILogLine, wowVersion: WowVersion) {
    super(logLine);
    if (!SpellAuraBrokenSpell.supports(logLine)) {
      throw new Error('Event not supported as SpellAuraBrokenSpell');
    }

    this.breakingSpellId = logLine.parameters[11];
    this.breakingSpellName = parseQuotedName(logLine.parameters[12]);
  }
}

// Example from DF prepatch
// 11/4 04:10:18.748
// SPELL_AURA_BROKEN_SPELL
//[0] ,2e292443-3689-451b-a125-d99e463ee255
//[1] ,"InternalSwift"
//[2] ,0x511
//[3] ,0x0
//[4] ,c5f3ff0a-040a-4e88-a171-59d4ceca1a42
//[5] ,"ExternalSwordtail"
//[6] ,0x10548
//[7] ,0x0
//[8] ,5246
//[9] ,"Intimidating Shout"
//[10] ,0x1
//[11] ,317483
//[12] ,"Condemn"
//[13] ,32
//[14] ,DEBUFF

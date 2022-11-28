import { ILogLine, CombatantInfo, EquippedItem } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEquippedItems(val: any[]): EquippedItem[] {
  return val.map((eqi) => ({
    id: eqi[0].toString(),
    ilvl: eqi[1],
    enchants: eqi[2].map((v: number) => v.toString()),
    bonuses: eqi[3].map((v: number) => v.toString()),
    gems: eqi[4].map((v: number) => v.toString()),
  }));
}

export class CombatantInfoAction {
  public static supports(logLine: ILogLine): boolean {
    return logLine.event.startsWith('COMBATANT_INFO');
  }

  public readonly timestamp: number;
  public readonly info: CombatantInfo;

  constructor(public readonly logLine: ILogLine) {
    if (!CombatantInfoAction.supports(logLine)) {
      throw new Error('Event not supported as CombatantInfoAction: ' + logLine.raw);
    }

    this.timestamp = logLine.timestamp;

    this.info = {
      teamId: logLine.parameters[1].toString(),
      strength: logLine.parameters[2],
      agility: logLine.parameters[3],
      stamina: logLine.parameters[4],
      intelligence: logLine.parameters[5],
      dodge: logLine.parameters[6],
      parry: logLine.parameters[7],
      block: logLine.parameters[8],
      critMelee: logLine.parameters[9],
      critRanged: logLine.parameters[10],
      critSpell: logLine.parameters[11],
      speed: logLine.parameters[12],
      lifesteal: logLine.parameters[13],
      hasteMelee: logLine.parameters[14],
      hasteRanged: logLine.parameters[15],
      hasteSpell: logLine.parameters[16],
      avoidance: logLine.parameters[17],
      mastery: logLine.parameters[18],
      versatilityDamgeDone: logLine.parameters[19],
      versatilityHealingDone: logLine.parameters[20],
      versatilityDamageTaken: logLine.parameters[21],
      armor: logLine.parameters[22],
      specId: logLine.parameters[23].toString(),
      talents: logLine.parameters[24].map((v: number[]) => ({ id1: v[0], id2: v[1], count: v[2] })),
      pvpTalents: logLine.parameters[25].map((v: number) => v.toString()),
      equipment: parseEquippedItems(logLine.parameters[27]),
      interestingAurasJSON: JSON.stringify(logLine.parameters[28]),
      item28: logLine.parameters[29],
      item29: logLine.parameters[30],
      personalRating: logLine.parameters[31],
      highestPvpTier: logLine.parameters[32],
    };
  }
}

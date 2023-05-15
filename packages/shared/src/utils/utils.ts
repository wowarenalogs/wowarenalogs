import {
  CombatUnitClass,
  CombatUnitSpec,
  IArenaMatch,
  ICombatUnit,
  IShuffleMatch,
  WoWCombatLogParser,
  WowVersion,
} from '@wowarenalogs/parser';
import _ from 'lodash';

const combatUnitSpecReverse: Record<string, string> = {};
const combatUnitClassReverse: Record<string, string> = {};
const specNames: Record<string, string> = {};
const classNames: Record<string, string> = {};
// https://github.com/Microsoft/TypeScript/issues/21935#issuecomment-371583528
_.keys(CombatUnitSpec).forEach((k) => {
  combatUnitSpecReverse[CombatUnitSpec[k as keyof typeof CombatUnitSpec]] = k;
});
_.keys(CombatUnitClass).forEach((k) => {
  combatUnitClassReverse[CombatUnitClass[k as keyof typeof CombatUnitClass]] = k;
});

_.keys(CombatUnitSpec).forEach((k) => {
  specNames[CombatUnitSpec[k as keyof typeof CombatUnitSpec]] = k.split('_').reverse().join(' ');
});
_.keys(CombatUnitClass).forEach((k) => {
  classNames[CombatUnitClass[k as keyof typeof CombatUnitClass]] = k.split('_').reverse().join(' ');
});

type ParseResult = {
  arenaMatches: IArenaMatch[];
  shuffleMatches: IShuffleMatch[];
};

export const SIGNIFICANT_DAMAGE_HEAL_THRESHOLD = 10000;

export class Utils {
  public static parseFromStringArray(buffer: string[], wowVersion: WowVersion, timezone?: string): ParseResult {
    const logParser = new WoWCombatLogParser(wowVersion, timezone);

    const results: ParseResult = {
      arenaMatches: [],
      shuffleMatches: [],
    };

    logParser.on('arena_match_ended', (data: IArenaMatch) => {
      results.arenaMatches.push(data);
    });

    logParser.on('solo_shuffle_ended', (data: IShuffleMatch) => {
      results.shuffleMatches.push(data);
    });
    // TODO: handle onError here?

    for (const line of buffer) {
      logParser.parseLine(line);
    }
    logParser.flush();

    return results;
  }

  public static getSpecName(spec: CombatUnitSpec) {
    return specNames[spec];
  }

  public static getClassName(unitClass: CombatUnitClass) {
    return classNames[unitClass];
  }

  public static getSpecClass(spec: CombatUnitSpec): CombatUnitClass {
    switch (spec) {
      case CombatUnitSpec.Druid_Balance:
      case CombatUnitSpec.Druid_Feral:
      case CombatUnitSpec.Druid_Guardian:
      case CombatUnitSpec.Druid_Restoration:
        return CombatUnitClass.Druid;
      case CombatUnitSpec.Hunter_BeastMastery:
      case CombatUnitSpec.Hunter_Marksmanship:
      case CombatUnitSpec.Hunter_Survival:
        return CombatUnitClass.Hunter;
      case CombatUnitSpec.Mage_Arcane:
      case CombatUnitSpec.Mage_Fire:
      case CombatUnitSpec.Mage_Frost:
        return CombatUnitClass.Mage;
      case CombatUnitSpec.Paladin_Holy:
      case CombatUnitSpec.Paladin_Protection:
      case CombatUnitSpec.Paladin_Retribution:
        return CombatUnitClass.Paladin;
      case CombatUnitSpec.Priest_Discipline:
      case CombatUnitSpec.Priest_Holy:
      case CombatUnitSpec.Priest_Shadow:
        return CombatUnitClass.Priest;
      case CombatUnitSpec.Rogue_Assassination:
      case CombatUnitSpec.Rogue_Outlaw:
      case CombatUnitSpec.Rogue_Subtlety:
        return CombatUnitClass.Rogue;
      case CombatUnitSpec.Shaman_Elemental:
      case CombatUnitSpec.Shaman_Enhancement:
      case CombatUnitSpec.Shaman_Restoration:
        return CombatUnitClass.Shaman;
      case CombatUnitSpec.Warlock_Affliction:
      case CombatUnitSpec.Warlock_Demonology:
      case CombatUnitSpec.Warlock_Destruction:
        return CombatUnitClass.Warlock;
      case CombatUnitSpec.Warrior_Arms:
      case CombatUnitSpec.Warrior_Fury:
      case CombatUnitSpec.Warrior_Protection:
        return CombatUnitClass.Warrior;
      case CombatUnitSpec.DeathKnight_Blood:
      case CombatUnitSpec.DeathKnight_Frost:
      case CombatUnitSpec.DeathKnight_Unholy:
        return CombatUnitClass.DeathKnight;
      case CombatUnitSpec.Monk_BrewMaster:
      case CombatUnitSpec.Monk_Mistweaver:
      case CombatUnitSpec.Monk_Windwalker:
        return CombatUnitClass.Monk;
      case CombatUnitSpec.DemonHunter_Havoc:
      case CombatUnitSpec.DemonHunter_Vengeance:
        return CombatUnitClass.DemonHunter;
      case CombatUnitSpec.Evoker_Devastation:
      case CombatUnitSpec.Evoker_Preservation:
        return CombatUnitClass.Evoker;
      default:
        return CombatUnitClass.None;
    }
  }

  public static getAverageItemLevel(player: ICombatUnit): number {
    // advanced actions contain information about the character's item level. if that's available,
    // we should use that before trying to do our own calculations based on gear.
    const advancedActions = player.advancedActions.filter((action) => action.advancedActorItemLevel > 0);
    if (advancedActions.length > 0) {
      return Math.round(_.sum(advancedActions.map((a) => a.advancedActorItemLevel)) / advancedActions.length);
    }

    if (!(player.info?.equipment && player.info.equipment.length >= 16)) {
      return 0;
    }

    // if using offhand weapon this calculation is normal
    if (player.info.equipment[16].id !== '0') {
      return Math.round(_.sumBy(player.info.equipment, 'ilvl') / 16);
    }
    // otherwise, the 2h weapon counts as 2 slots with the same ilvl
    return Math.round((player.info.equipment[15].ilvl + Math.round(_.sumBy(player.info.equipment, 'ilvl'))) / 16);
  }

  public static filterNulls<T>(items: (T | null | undefined)[]): T[] {
    const results: T[] = [];
    items.forEach((i) => {
      if (i) {
        results.push(i);
      }
    });
    return results;
  }

  public static getSpellIcon(spellId: string): string | null {
    return `https://images.wowarenalogs.com/spells/${spellId}.jpg`;
  }

  public static getSpecIcon(spec: CombatUnitSpec): string | null {
    switch (spec) {
      default:
        return `https://images.wowarenalogs.com/specs/${combatUnitSpecReverse[spec].toLowerCase()}.jpg`;
      case CombatUnitSpec.None:
        return null;
    }
  }

  public static getClassIcon(unitClass: CombatUnitClass): string {
    switch (unitClass) {
      default:
        return `https://images.wowarenalogs.com/classes/${combatUnitClassReverse[unitClass].toLowerCase()}.jpeg`;
      case CombatUnitClass.None:
        return 'https://images.wowarenalogs.com/common/question_mark.jpeg';
    }
  }

  public static printCombatNumber(num: number, isCritical = false): string {
    const criticalMarker = '*';

    if (num < 1000) {
      return `${num.toFixed()}${isCritical ? criticalMarker : ''}`;
    }
    if (num < 10000) {
      return `${(num / 1000).toFixed(1)}k${isCritical ? criticalMarker : ''}`;
    }

    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}m${isCritical ? criticalMarker : ''}`;
    }

    return `${(num / 1000).toFixed()}k${isCritical ? criticalMarker : ''}`;
  }
}

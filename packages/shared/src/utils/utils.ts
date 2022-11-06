import { CombatUnitClass, CombatUnitSpec, ICombatUnit } from '@wowarenalogs/parser';
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

export class Utils {
  public static getSpecName(spec: CombatUnitSpec) {
    return specNames[spec];
  }

  public static getClassName(unitClass: CombatUnitClass) {
    return classNames[unitClass];
  }

  public static getAverageItemLevel(player: ICombatUnit): number {
    // advanced actions contain information about the character's item level. if that's available,
    // we should use that before trying to do our own calculations based on gear.
    const advancedActions = player.advancedActions.filter((action) => action.advancedActorItemLevel > 0);
    if (advancedActions.length > 0) {
      return _.sum(advancedActions.map((a) => a.advancedActorItemLevel)) / advancedActions.length;
    }

    if (!(player.info?.equipment && player.info.equipment.length >= 16)) {
      return 0;
    }

    // if using offhand weapon this calculation is normal
    if (player.info.equipment[16].id !== '0') {
      return Math.round(_.sumBy(player.info.equipment, 'ilvl') / 16);
    }
    // otherwise, the 2h weapon counts as 2 slots with the same ilvl
    return (player.info.equipment[15].ilvl + Math.round(_.sumBy(player.info.equipment, 'ilvl'))) / 16;
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

  public static printCombatNumber(num: number): string {
    if (num < 1000) {
      return num.toFixed();
    }
    if (num < 10000) {
      return `${(num / 1000).toFixed(1)}k`;
    }

    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}m`;
    }

    return `${(num / 1000).toFixed()}k`;
  }
}

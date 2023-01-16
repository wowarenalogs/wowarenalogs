import {
  AtomicArenaCombat,
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
      return `${num.toFixed()}${isCritical ? criticalMarker : ''}}`;
    }
    if (num < 10000) {
      return `${(num / 1000).toFixed(1)}k${isCritical ? criticalMarker : ''}`;
    }

    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}m${isCritical ? criticalMarker : ''}`;
    }

    return `${(num / 1000).toFixed()}k${isCritical ? criticalMarker : ''}`;
  }

  public static getEffectiveCombatDuration(combat: AtomicArenaCombat) {
    const damageEvents = combat.events.filter((e) => e.logLine.event.endsWith('_DAMAGE'));
    const effectiveStartTime = damageEvents.length > 0 ? damageEvents[0].logLine.timestamp : combat.startTime;
    const effectiveEndTime =
      damageEvents.length > 0 ? damageEvents[damageEvents.length - 1].logLine.timestamp : combat.endTime;
    return (effectiveEndTime - effectiveStartTime) / 1000;
  }

  public static getEffectiveDps(units: ICombatUnit[], effectiveDuration: number) {
    return _.sum(units.map((p) => _.sum(p.damageOut.map((d) => Math.abs(d.effectiveAmount))))) / effectiveDuration;
  }

  public static getBurstDps(units: ICombatUnit[], burstWindow = 3000) {
    const allDamageOut = _.sortBy(
      units.flatMap((p) => p.damageOut),
      (d) => d.timestamp,
    );

    let l = 0;
    let r = 0;
    let burstDps = 0;
    while (r < allDamageOut.length) {
      while (r < allDamageOut.length && allDamageOut[r].timestamp - allDamageOut[l].timestamp <= burstWindow) {
        r++;
      }
      const eventsInWindow = allDamageOut.slice(l, r);
      const totalDamageInWindow = _.sum(eventsInWindow.map((d) => Math.abs(d.effectiveAmount)));
      burstDps = Math.max(burstDps, totalDamageInWindow / (burstWindow / 1000));
      l++;
    }
    return burstDps;
  }

  public static getEffectiveHps(units: ICombatUnit[], effectiveDuration: number) {
    return (
      _.sum(
        units.map(
          (p) => _.sum(p.healOut.map((d) => d.effectiveAmount)) + _.sum(p.absorbsOut.map((d) => d.effectiveAmount)),
        ),
      ) / effectiveDuration
    );
  }
}

import md5 from 'md5';

import { CombatUnitClass, CombatUnitPowerType, CombatUnitReaction, CombatUnitType } from './types';

export const PIPELINE_FLUSH_SIGNAL = '__WOW_ARENA_LOGS_PIPELINE_FLUSH_SIGNAL__';

export function nullthrows<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw Error('this value cannot be null or undefined');
  }
  return value;
}

export const parseQuotedName = (quotedName: string): string => {
  return quotedName.replace(/"/g, '');
};

export function computeCanonicalHash(buffer: string[]): string {
  return md5(buffer.join('\n').slice(1024));
}

export function getUnitType(flag: number): CombatUnitType {
  // tslint:disable-next-line: no-bitwise
  const masked = flag & 0x0000fc00;
  switch (masked) {
    case 0x00001000:
      return CombatUnitType.Pet;
    case 0x00000400:
      return CombatUnitType.Player;
    default:
      return CombatUnitType.None;
  }
}
export function getUnitReaction(flag: number): CombatUnitReaction {
  // tslint:disable-next-line: no-bitwise
  const masked = flag & 0x000000f0;
  switch (masked) {
    case 0x00000040:
      return CombatUnitReaction.Hostile;
    case 0x00000010:
      return CombatUnitReaction.Friendly;
    default:
      return CombatUnitReaction.Neutral;
  }
}

export const getClassColor = (unitClass: CombatUnitClass): string => {
  switch (unitClass) {
    default:
      return '#607D8B';
    case CombatUnitClass.DeathKnight:
      return '#C41F3B';
    case CombatUnitClass.DemonHunter:
      return '#A330C9';
    case CombatUnitClass.Druid:
      return '#FF7D0A';
    case CombatUnitClass.Hunter:
      return '#A9D271';
    case CombatUnitClass.Mage:
      return '#40C7EB';
    case CombatUnitClass.Monk:
      return '#00FF96';
    case CombatUnitClass.Paladin:
      return '#F58CBA';
    case CombatUnitClass.Priest:
      return '#FFFFFF';
    case CombatUnitClass.Rogue:
      return '#FFF569';
    case CombatUnitClass.Shaman:
      return '#0070DE';
    case CombatUnitClass.Warlock:
      return '#8787ED';
    case CombatUnitClass.Warrior:
      return '#C79C6E';
  }
};

export const getPowerColor = (powerType: CombatUnitPowerType) => {
  switch (powerType) {
    case CombatUnitPowerType.Mana:
      return '#0000FF';
    case CombatUnitPowerType.Rage:
      return '#FF0000';
    case CombatUnitPowerType.Focus:
      return '#FF8040';
    case CombatUnitPowerType.Energy:
      return '#FFFF00';
    case CombatUnitPowerType.ComboPoints:
      return '#FFF569';
    case CombatUnitPowerType.Runes:
      return '#808080';
    case CombatUnitPowerType.RunicPower:
      return '#00D1FF';
    case CombatUnitPowerType.SoulShards:
      return '#80528C';
    case CombatUnitPowerType.LunarPower:
      return '#4D85E6';
    case CombatUnitPowerType.HolyPower:
      return '#F2E699';
    case CombatUnitPowerType.Maelstrom:
      return '#0080FF';
    case CombatUnitPowerType.Insanity:
      return '#6600CC';
    case CombatUnitPowerType.Chi:
      return '#B5FFEB';
    case CombatUnitPowerType.ArcaneCharges:
      return '#1A1AFA';
    case CombatUnitPowerType.Fury:
      return '#C942FD';
    case CombatUnitPowerType.Pain:
      return '#FF9C00';
    default:
      return 'transparent';
  }
};

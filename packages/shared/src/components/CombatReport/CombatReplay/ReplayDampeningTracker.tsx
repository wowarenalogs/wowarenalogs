import { CombatUnitSpec, ICombatUnit } from '@wowarenalogs/parser';
import React, { useMemo } from 'react';

interface IProps {
  players: ICombatUnit[];
  currentSecond: number;
}

const tanksOrHealers = [
  CombatUnitSpec.DeathKnight_Blood,
  CombatUnitSpec.DemonHunter_Vengeance,
  CombatUnitSpec.Druid_Guardian,
  CombatUnitSpec.Monk_BrewMaster,
  CombatUnitSpec.Warrior_Protection,
  CombatUnitSpec.Paladin_Protection,
  CombatUnitSpec.Paladin_Holy,
  CombatUnitSpec.Priest_Discipline,
  CombatUnitSpec.Priest_Holy,
  CombatUnitSpec.Shaman_Restoration,
  CombatUnitSpec.Druid_Restoration,
  CombatUnitSpec.Monk_Mistweaver,
];

// Rules of dampening
// Starts at 0%
// At 5 minutes it increases to 1%
// Every 10 seconds after it goes up 1%
//
// 2v2 changes:
// per - https://us.forums.blizzard.com/en/wow/t/pvp-tuning-changes-for-january-26/841816
// In 2v2 Arenas, Dampening will begin at 20% when both teams have either a tank or healer.
// TODO: check the rules for DF
function computeDampening(rules: string, currentSecond: number): number {
  if (rules === '2v2') {
    return Math.floor(currentSecond / 10) + 20;
  }
  if (currentSecond < 60 * 5) {
    return 0;
  }
  return Math.floor((currentSecond - 60 * 5) / 10) + 1;
}

function computeRules(players: ICombatUnit[]): '2v2' | '2v2_dps' | '3v3' {
  if (players.length > 4) {
    return '3v3';
  }
  const team0HasHealer = players.some((c) => c.info?.teamId === '0' && tanksOrHealers.includes(c.spec));
  const team1HasHealer = players.some((c) => c.info?.teamId === '1' && tanksOrHealers.includes(c.spec));
  if (team0HasHealer && team1HasHealer) {
    return '2v2';
  }
  return '2v2_dps';
}

export const ReplayDampeningTracker = React.memo(function ReplayDampeningTracker({ players, currentSecond }: IProps) {
  const rules = useMemo(() => computeRules(players), [players]);
  const dampening = computeDampening(rules, currentSecond);
  return (
    <div
      className={`font-bold cursor-default ${dampening > 0 ? 'text-error' : 'opacity-60'}`}
      title={`Healing received reduced by ${dampening}%`}
    >
      Dampening: -{dampening}%
    </div>
  );
});

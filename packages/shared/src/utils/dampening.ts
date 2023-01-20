import { CombatUnitSpec, ICombatUnit } from '@wowarenalogs/parser';

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

// DF RULES https://www.icy-veins.com/forums/topic/69530-dampening-and-healing-changes-in-dragonflight-pre-patch-phase-2-arenas/
// Solo Shuffle - Start at 10% Dampening and after 1 minute, ramp up at a pace of 25% per minute
// 2v2 (double DPS) - Start at 10% Dampening and immediately ramp up at a pace of 6% per minute
// 2v2 (with a healer) - Start at 30% Dampening (up from 20%) and immediately ramp up at a pace of 6% per minute
// 3v3 - Start at 10% Dampening and after 3 minutes (down from 5 minutes), ramp up at a pace of 6% per minute
function getInitialDampening(bracket: string, players: ICombatUnit[]) {
  const rules = computeRules(bracket, players);
  if (rules === 'Rated Solo Shuffle') {
    return 10;
  }
  if (rules === '2v2_dps') {
    return 10;
  }
  if (rules === '2v2') {
    return 30;
  }
  // 3v3
  return 10;
}

function computeRules(bracket: string, players: ICombatUnit[]): '2v2' | '2v2_dps' | '3v3' | 'Rated Solo Shuffle' {
  if (bracket === 'Rated Solo Shuffle') {
    return 'Rated Solo Shuffle';
  }
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

export function getDampeningPercentage(bracket: string, players: ICombatUnit[], timestamp: number) {
  const lastDampUpdate = players
    .flatMap((p) => p.auraEvents)
    .filter((a) => a.spellId === '110310' && a.logLine.event === 'SPELL_AURA_APPLIED_DOSE' && a.timestamp <= timestamp)
    .sort((a, b) => a.timestamp - b.timestamp);
  const stacks =
    lastDampUpdate.length > 0 && (lastDampUpdate[lastDampUpdate.length - 1].logLine.parameters[12] as number);
  const dampening = stacks || getInitialDampening(bracket, players);
  return dampening;
}

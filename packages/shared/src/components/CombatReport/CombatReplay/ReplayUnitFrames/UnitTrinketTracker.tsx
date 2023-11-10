import { CombatUnitSpec } from '@wowarenalogs/parser';

import { SpellIcon } from '../../SpellIcon';
import { IUnitFrameRenderData } from './UnitFrame';
import { ISpellCast } from './UnitFrame';
import styles from './UnitTrinketTracker.module.css';

function computePercentCDRemaining(casts: ISpellCast[], spellId: string, currentTimeOffset: number, cooldown: number) {
  const castsOfThis = casts.filter((c) => c.spellId === spellId);
  const nextCastIndex = castsOfThis.findIndex((c) => c.startTimeOffset > currentTimeOffset);
  let lastCast = castsOfThis[0];
  if (!lastCast) {
    return undefined;
  }
  if (nextCastIndex > 0) {
    lastCast = castsOfThis[nextCastIndex - 1];
  }
  if (lastCast.startTimeOffset > currentTimeOffset) {
    return undefined;
  }
  const timeCooling = currentTimeOffset - lastCast.startTimeOffset;
  if (timeCooling > 1000 * cooldown) {
    return undefined;
  }
  return timeCooling / (cooldown * 1000);
}

export const UnitTrinketTracker = (props: IUnitFrameRenderData) => {
  const relentlessTrinkets = ['181335', '184053', '186870', '185305', '186967', '185310', '184059', '184056']; // Spell: 196029
  const gladiatorTrinkets = [
    '185309',
    '181333',
    '184052',
    '186869',
    '185304',
    '186966',
    '185309',
    '201810',
    '201450',
    '205779',
    '205711',
    '209346', // Verdant Glad Medallion
    '208307', // Verdant Comb Medallion
    '209764', // Verdant Asp Medallion
  ]; // Spell: 336126
  const adaptationTrinkets = [
    '181816',
    '184054',
    '186871',
    '185306',
    '185311',
    '186968',
    '201453',
    '201811',
    '205782',
    '205712',
    '209767', // Verdant Asp Sigil
    '209347', // Verdant Glad Sigil
  ]; // Spell: 195756

  const isHealer = [
    CombatUnitSpec.Druid_Restoration,
    CombatUnitSpec.Monk_Mistweaver,
    CombatUnitSpec.Priest_Discipline,
    CombatUnitSpec.Evoker_Preservation,
    CombatUnitSpec.Shaman_Restoration,
    CombatUnitSpec.Priest_Holy,
    CombatUnitSpec.Paladin_Holy,
  ].includes(props.unit.spec);
  const trinketCooldown = isHealer ? 90 : 120;

  if (props.unit.info?.equipment.some((e) => relentlessTrinkets.includes(e.id))) {
    return (
      <div className={styles['unit-frame-trinkettracker']}>
        <SpellIcon circular className={styles['unit-frame-trinket-ready']} size={28} spellId={'336128'} />
      </div>
    );
  } else if (props.unit.info?.equipment.some((e) => adaptationTrinkets.includes(e.id))) {
    return (
      <div className={styles['unit-frame-trinkettracker']}>
        <SpellIcon circular className={styles['unit-frame-trinket-ready']} size={28} spellId={'336135'} />
      </div>
    );
  } else if (props.unit.info?.equipment.some((e) => gladiatorTrinkets.includes(e.id))) {
    const cooldownPercent = computePercentCDRemaining(
      props.trinketSpellCasts,
      '336126',
      props.currentTimeOffset,
      trinketCooldown,
    );
    return (
      <div className={styles['unit-frame-trinkettracker']}>
        <SpellIcon
          circular
          cooldownPercent={cooldownPercent}
          className={cooldownPercent ? styles['unit-frame-trinket-cooldown'] : styles['unit-frame-trinket-ready']}
          size={28}
          spellId={'336126'}
        />
      </div>
    );
  }
  // They dont have a trinket equipped
  if (process.env.NODE_ENV === 'development') {
    console.error(`Player ${props.unit.id} ${props.unit.name} has no trinket?`);
  }
  return null;
};

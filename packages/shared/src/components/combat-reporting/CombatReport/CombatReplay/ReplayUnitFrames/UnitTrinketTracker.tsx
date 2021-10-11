import styles from './UnitTrinketTracker.module.css';

import { SpellIcon } from '../../SpellIcon';
import { IUnitFrameRenderData } from './UnitFrame';
import { ISpellCast } from './UnitFrame';

function computePercentCDRemaining(casts: ISpellCast[], spellId: string, currentTimeOffset: number) {
  const cooldown = 120;
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
  const relentlessTrinkets = ['181335', '184053']; // Spell: 196029
  const gladiatorTrinkets = ['185309', '181333', '184052']; // Spell: 336126
  const adaptationTrinkets = ['181816', '184054']; // Spell: 195756

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
    const cooldownPercent = computePercentCDRemaining(props.trinketSpellCasts, '336126', props.currentTimeOffset);
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
  return null;
};

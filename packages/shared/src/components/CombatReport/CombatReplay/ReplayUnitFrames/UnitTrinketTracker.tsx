import { healerSpecs } from '../../../../utils/utils';
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
    '216369', // Draconic
    '211606', // Draconic
    '216282', // Draconic
    '218716', // Forged Gladiator's Medallion
    '218422', // Forged Aspirant's Medallion
    '229783', // Prized Gladiator's Medallion
    '229492', // Prized Aspirant's Medallion
    '230641', // Astral Gladiator's Medallion
    '230353', // Astral Aspirant's Medallion
    '270605', // Venomous Gladiator's Medallion
    '270556', // Venomous Aspirant's Medallion
    '280118', // Venomous Aspirant's Medallion
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
    '216372', // Draconic
    '216283', // Draconic
    '218717', // Forged Gladiator's Sigil
    '218425', // Forged Aspirant's Sigil
    '229784', // Prized Gladiator's Sigil
    '229495', // Prized Aspirant's Sigil
    '230642', // Astral Gladiator's Sigil
    '230356', // Astral Aspirant's Sigil
    '270604', // Venomous Gladiator's Sigil
    '270557', // Venomous Aspirant's Sigil
  ]; // Spell: 195756

  const isHealer = healerSpecs.includes(props.unit.spec);
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
  } else if (
    props.unit.info?.equipment.some((e) => gladiatorTrinkets.includes(e.id)) ||
    props.trinketSpellCasts.some((c) => c.spellId === '336126')
  ) {
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

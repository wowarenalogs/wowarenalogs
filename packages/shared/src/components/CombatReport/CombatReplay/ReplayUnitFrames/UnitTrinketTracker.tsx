import { useQueries } from 'react-query';

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

const TRINKET_SLOTS = [12, 13];

type PvpTrinket = 'medallion' | 'adaptation' | 'relentless';

// Names are stable across seasons, so classify by the Wowhead item name instead of listing IDs
async function fetchPvpTrinket(itemId: string): Promise<PvpTrinket | null> {
  const response = await fetch(`https://nether.wowhead.com/tooltip/item/${itemId}?dataEnv=1&locale=0`);
  const { name } = (await response.json()) as { name?: string };
  if (name?.includes('Medallion')) return 'medallion';
  if (name?.includes('Sigil of Adaptation')) return 'adaptation';
  if (name?.includes('Relentless')) return 'relentless';
  return null;
}

export const UnitTrinketTracker = (props: IUnitFrameRenderData) => {
  const trinketIds = TRINKET_SLOTS.map((slot) => props.unit.info?.equipment[slot]?.id).filter(
    (id): id is string => !!id && id !== '0',
  );
  const trinketQueries = useQueries(
    trinketIds.map((id) => ({
      queryKey: ['wowhead-pvp-trinket', id],
      queryFn: () => fetchPvpTrinket(id),
      staleTime: Infinity,
      cacheTime: Infinity,
    })),
  );
  const trinkets = trinketQueries.map((q) => q.data);

  const isHealer = healerSpecs.includes(props.unit.spec);
  const trinketCooldown = isHealer ? 90 : 120;

  if (trinkets.includes('relentless')) {
    return (
      <div className={styles['unit-frame-trinkettracker']}>
        <SpellIcon circular className={styles['unit-frame-trinket-ready']} size={28} spellId={'336128'} />
      </div>
    );
  } else if (trinkets.includes('adaptation')) {
    return (
      <div className={styles['unit-frame-trinkettracker']}>
        <SpellIcon circular className={styles['unit-frame-trinket-ready']} size={28} spellId={'336135'} />
      </div>
    );
  } else if (trinkets.includes('medallion') || props.trinketSpellCasts.some((c) => c.spellId === '336126')) {
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
  if (process.env.NODE_ENV === 'development' && trinketQueries.every((q) => q.isSuccess)) {
    console.error(`Player ${props.unit.id} ${props.unit.name} has no trinket?`);
  }
  return null;
};

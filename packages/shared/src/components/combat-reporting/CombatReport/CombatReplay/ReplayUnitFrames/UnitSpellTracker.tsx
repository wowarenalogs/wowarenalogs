import _ from 'lodash';
import { ICombatUnit } from 'wow-combat-log-parser';

import styles from './UnitSpellTracker.module.css';

import { awcSpells } from '../../../../../data/awcSpells';
import { IMinedSpell } from '../../../../../data/spellEffectData';
import { SpellIcon } from '../../SpellIcon';
import { IUnitFrameRenderData } from './UnitFrame';
import { ISpellCast } from './UnitFrame';

type CooldownInfo = {
  charges?: number;
  cooldownPercent?: number;
};

export function computeTrackableSpellsForUnit(unit: ICombatUnit) {
  return awcSpells[unit.spec].concat(awcSpells['0']);
}

function computeChargeInfo(
  casts: ISpellCast[],
  spellId: string,
  currentTimeOffset: number,
  spellData: Record<string, IMinedSpell>,
): CooldownInfo {
  const cooldown = spellData[spellId]?.charges?.chargeCooldownSeconds || 30;
  const charges = spellData[spellId]?.charges?.charges || 1;

  const castsOfThis = casts.filter((c) => c.spellId === spellId);
  let timecredit = charges * cooldown;

  if (castsOfThis.length < 1) {
    return {};
  }
  let last = -1;
  for (let i = 0; i <= castsOfThis.length - 1 && castsOfThis[i].startTimeOffset <= currentTimeOffset; i++) {
    timecredit -= cooldown;
    last = i;
    if (i > 0) {
      timecredit += (castsOfThis[last].startTimeOffset - castsOfThis[i - 1].startTimeOffset) / 1000;
    }
  }
  if (last > -1) {
    timecredit += (currentTimeOffset - castsOfThis[last].startTimeOffset) / 1000;
  }
  const chargesRemaining = Math.floor(timecredit / cooldown);

  if (chargesRemaining) {
    return {
      charges: chargesRemaining,
    };
  } else {
    return {
      cooldownPercent: timecredit / cooldown,
    };
  }
}

function computePercentCDRemaining(
  casts: ISpellCast[],
  spellId: string,
  currentTimeOffset: number,
  spellData: Record<string, IMinedSpell>,
): CooldownInfo {
  const cooldown = spellData[spellId]?.cooldownSeconds || 30;
  const charges = spellData[spellId]?.charges?.charges;
  if (charges) {
    return computeChargeInfo(casts, spellId, currentTimeOffset, spellData);
  }
  const castsOfThis = casts.filter((c) => c.spellId === spellId);
  const pastCasts = castsOfThis.filter((c) => c.startTimeOffset < currentTimeOffset);

  const lastCast = (pastCasts.length > 0 && pastCasts[pastCasts.length - 1]) || undefined;

  if (!lastCast) {
    return { charges };
  }

  if (lastCast.startTimeOffset > currentTimeOffset) {
    return { charges };
  }
  const timeCooling = currentTimeOffset - lastCast.startTimeOffset;
  if (timeCooling > 1000 * cooldown) {
    return { charges };
  }
  return {
    cooldownPercent: timeCooling / (cooldown * 1000),
  };
}

export const UnitSpellTracker = (props: IUnitFrameRenderData) => {
  return (
    <div className={styles['unit-frame-aurastates']}>
      {props.trackedSpellIds.map((spellId, idx) => {
        const activeAura = props.trackedAuras.find((a) => a.spellId === spellId);
        const cooldownInfo = computePercentCDRemaining(
          props.trackedSpellCasts,
          spellId,
          props.currentTimeOffset,
          props.spellData,
        );
        if (activeAura) {
          if (props.currentTimeOffset - activeAura.startTimeOffset < 500) {
            return (
              <SpellIcon
                key={spellId}
                charges={cooldownInfo.charges}
                className={styles['unit-frame-auraicon-casting']}
                size={24}
                spellId={spellId}
              />
            );
          }
          return (
            <SpellIcon
              charges={cooldownInfo.charges}
              key={spellId}
              className={styles['unit-frame-auraicon']}
              size={24}
              spellId={spellId}
            />
          );
        }
        return (
          <SpellIcon
            key={spellId}
            charges={cooldownInfo.charges}
            cooldownPercent={cooldownInfo.cooldownPercent}
            className={
              cooldownInfo.cooldownPercent
                ? styles['unit-frame-auraicon-cooldown']
                : styles['unit-frame-auraicon-ready']
            }
            size={24}
            spellId={spellId}
          />
        );
      })}
    </div>
  );
};

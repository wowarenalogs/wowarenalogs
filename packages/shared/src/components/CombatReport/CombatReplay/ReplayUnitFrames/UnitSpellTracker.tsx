import { ICombatUnit } from '@wowarenalogs/parser';
import _ from 'lodash';

import { awcSpells } from '../../../../data/awcSpells';
import { IMinedSpell } from '../../../../data/spellEffectData';
import { SpellIcon } from '../../SpellIcon';
import { IUnitFrameRenderData } from './UnitFrame';
import { ISpellCast } from './UnitFrame';
import styles from './UnitSpellTracker.module.css';

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
): { cooldown: CooldownInfo; lastCastTimestampOffset?: number } {
  const cooldown = spellData[spellId]?.cooldownSeconds || spellData[spellId]?.charges?.chargeCooldownSeconds || 30;
  const charges = spellData[spellId]?.charges?.charges;
  if (charges && charges > 1) {
    return {
      cooldown: computeChargeInfo(casts, spellId, currentTimeOffset, spellData),
    };
  }
  const castsOfThis = casts.filter((c) => c.spellId === spellId);
  const pastCasts = castsOfThis.filter((c) => c.startTimeOffset < currentTimeOffset);

  const lastCast = (pastCasts.length > 0 && pastCasts[pastCasts.length - 1]) || undefined;

  if (!lastCast) {
    return { cooldown: { charges } };
  }

  if (lastCast.startTimeOffset > currentTimeOffset) {
    return { cooldown: { charges }, lastCastTimestampOffset: lastCast.startTimeOffset };
  }
  const timeCooling = currentTimeOffset - lastCast.startTimeOffset;
  if (timeCooling > 1000 * cooldown) {
    return { cooldown: { charges }, lastCastTimestampOffset: lastCast.startTimeOffset };
  }
  return {
    cooldown: { cooldownPercent: timeCooling / (cooldown * 1000) },
    lastCastTimestampOffset: lastCast.startTimeOffset,
  };
}

export const UnitSpellTracker = (props: IUnitFrameRenderData) => {
  return (
    <div className={styles['unit-frame-aurastates']}>
      {props.trackedSpellIds.map((spellId) => {
        const activeAura = props.trackedAuras.find((a) => a.spellId === spellId);
        const cdrInfo = computePercentCDRemaining(
          props.trackedSpellCasts,
          spellId,
          props.currentTimeOffset,
          props.spellData,
        );
        const cooldownInfo = cdrInfo.cooldown;
        const spellMaxCharges = props.spellData[spellId]?.charges?.charges || 0;
        const shouldShowCharges = spellMaxCharges > 1;

        if (props.currentTimeOffset - (cdrInfo.lastCastTimestampOffset || -5000) < 500) {
          return (
            <SpellIcon
              key={spellId}
              charges={shouldShowCharges ? cooldownInfo.charges : undefined}
              className={styles['unit-frame-auraicon-casting']}
              size={24}
              spellId={spellId}
            />
          );
        }
        if (activeAura) {
          if (props.currentTimeOffset - activeAura.startTimeOffset < 500) {
            return (
              <SpellIcon
                key={spellId}
                charges={shouldShowCharges ? cooldownInfo.charges : undefined}
                className={styles['unit-frame-auraicon-casting']}
                size={24}
                spellId={spellId}
              />
            );
          }
          return (
            <SpellIcon
              key={spellId}
              charges={shouldShowCharges ? cooldownInfo.charges : undefined}
              className={styles['unit-frame-auraicon-casting']}
              size={24}
              spellId={spellId}
            />
          );
        }
        return (
          <SpellIcon
            key={spellId}
            charges={shouldShowCharges ? cooldownInfo.charges : undefined}
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

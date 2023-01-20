import { ICombatUnit } from '@wowarenalogs/parser';
import Image from 'next/image';
import { useMemo } from 'react';

import { spellIdToPriority, spells } from '../../../data/spellTags';
import { computeAuraDurations, IAuraDuration } from '../../../utils/auras';
import { Utils } from '../../../utils/utils';
import { useCombatReportContext } from '../CombatReportContext';
import { REPORT_TIMELINE_HEIGHT_PER_SECOND } from './common';

export const CombatUnitAuraTimeline = (props: { unit: ICombatUnit; startTime: number; endTime: number }) => {
  const { unit, startTime, endTime } = props;
  const { combat } = useCombatReportContext();

  const startTimeOffset = startTime - (combat?.startTime ?? 0);
  const endTimeOffset = endTime - (combat?.startTime ?? 0);

  const auras = useMemo(() => {
    if (combat) {
      const allAuras = computeAuraDurations(combat, unit);
      // only look at auras that were active during the specified time range
      const relevantAuras = allAuras.filter(
        (a) =>
          spellIdToPriority.has(a.spellId) && a.endTimeOffset > startTimeOffset && a.startTimeOffset < endTimeOffset,
      );
      // cap start time and end time for relevant auras
      relevantAuras.forEach((a) => {
        if (a.startTimeOffset < startTimeOffset) {
          a.startTimeOffset = startTimeOffset;
        }
        if (a.endTimeOffset > endTimeOffset) {
          a.endTimeOffset = endTimeOffset;
        }
      });
      return relevantAuras;
    }
    return [];
  }, [combat, unit, startTimeOffset, endTimeOffset]);

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: 24,
        height: ((endTime - startTime) / 1000) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
      }}
    >
      {auras.map((a) => (
        <div
          className={`flex flex-col-reverse border border-black absolute items-center overflow-hidden ${getAuraColor(
            a,
          )}`}
          title={`${a.spellName} from ${combat?.units[a.auraOwnerId].name} - ${(
            (a.endTimeOffset - a.startTimeOffset) /
            1000
          ).toFixed(1)}s`}
          key={`${a.spellId}_${a.startTimeOffset}_${a.endTimeOffset}_${a.auraOwnerId}`}
          style={{
            bottom: ((a.startTimeOffset - startTimeOffset) / 1000) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
            top: ((endTimeOffset - a.endTimeOffset) / 1000) * REPORT_TIMELINE_HEIGHT_PER_SECOND,
            left: 0,
            right: 0,
            zIndex: 1000 - (spellIdToPriority.get(a.spellId) ?? 1000),
          }}
        >
          <div className="mb-1 w-4 h-4" style={{ minWidth: 16, minHeight: 16 }}>
            <Image
              className="rounded"
              src={Utils.getSpellIcon(a.spellId) ?? 'https://images.wowarenalogs.com/spells/0.jpg'}
              width={16}
              height={16}
              alt={a.spellName ?? ''}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

function getAuraColor(aura: IAuraDuration): string {
  const auraType = spells[aura.spellId].type;
  switch (auraType) {
    case 'immunities':
    case 'buffs_other':
    case 'buffs_offensive':
    case 'buffs_defensive':
      return 'bg-success';
    case 'cc':
    case 'interrupts':
      return 'bg-error';
    case 'roots':
    case 'debuffs_other':
    case 'debuffs_offensive':
    case 'debuffs_defensive':
      return 'bg-warning';
    default:
      return 'bg-success';
  }
}
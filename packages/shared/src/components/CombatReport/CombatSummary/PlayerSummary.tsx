import { CombatUnitSpec, ICombatUnit } from '@wowarenalogs/parser';
import Image from 'next/image';

import { Utils } from '../../../utils/utils';
import { CombatUnitName } from '../CombatUnitName';
import { EquipmentInfo } from '../EquipmentInfo';

interface IProps {
  player: ICombatUnit;
}

export const PlayerSummary = ({ player }: IProps) => {
  const trinkets = player.info?.equipment.filter((_, i) => [12, 13].includes(i)) || [];
  const rating = player.info?.personalRating;

  return (
    <div className="flex flex-row items-start flex-1">
      <div className={`avatar ${rating ? 'indicator' : ''}`}>
        {rating ? (
          <span className="indicator-item indicator-middle indicator-center badge badge-sm opacity-90">{rating}</span>
        ) : null}
        <div className="rounded">
          <Image
            src={
              (player.spec === CombatUnitSpec.None
                ? Utils.getClassIcon(player.class)
                : Utils.getSpecIcon(player.spec)) ?? ''
            }
            alt={
              (player.spec === CombatUnitSpec.None
                ? Utils.getClassName(player.class)
                : Utils.getSpecName(player.spec)) ?? ''
            }
            width={48}
            height={48}
          />
        </div>
      </div>
      <div className="flex flex-col ml-2">
        <CombatUnitName unit={player} navigateToPlayerView showSpec={false} />
        <div className="flex flex-row items-center">
          {trinkets.map((e, i) => (
            <EquipmentInfo key={`${i}`} item={e} size={'small'} notext />
          ))}
          <span className="text-sm ml-1 opacity-60">{Utils.getAverageItemLevel(player)}</span>
        </div>
      </div>
    </div>
  );
};

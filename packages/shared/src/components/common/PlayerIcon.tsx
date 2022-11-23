import { CombatUnitAffiliation, CombatUnitClass, CombatUnitSpec } from '@wowarenalogs/parser';
import Image from 'next/image';

import { Utils } from '../../utils/utils';

export function PlayerIcon({
  player,
}: {
  player: {
    spec: string;
    class: CombatUnitClass;
  };
}) {
  const spec = player.spec as CombatUnitSpec;
  return (
    <div className="rounded-sm overflow-hidden bg-red-800 m-0 p-0 inline-block h-[24px]">
      <Image
        src={(player.spec === CombatUnitSpec.None ? Utils.getClassIcon(player.class) : Utils.getSpecIcon(spec)) ?? ''}
        alt={(player.spec === CombatUnitSpec.None ? Utils.getClassName(player.class) : Utils.getSpecName(spec)) ?? ''}
        width={24}
        height={24}
      />
    </div>
  );
}

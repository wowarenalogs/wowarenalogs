import { CombatUnitClass } from '@wowarenalogs/parser';
import Image from 'next/image';

import { Utils } from '../../utils/utils';

interface Props {
  unitClass: CombatUnitClass;
  size: number;
}

export const ClassImage = ({ unitClass, size }: Props) => {
  const iconUrl = Utils.getClassIcon(unitClass);
  if (!iconUrl) {
    return null;
  }

  return (
    <div style={{ height: size, width: size, display: 'flex' }}>
      <Image src={iconUrl} alt="classimage" height={size} width={size} />
    </div>
  );
};
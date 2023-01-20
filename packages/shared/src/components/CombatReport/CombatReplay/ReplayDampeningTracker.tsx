import { ICombatUnit } from '@wowarenalogs/parser';
import React from 'react';

import { getDampeningPercentage } from '../../../utils/dampening';

interface IProps {
  players: ICombatUnit[];
  currentTimestamp: number;
  bracket: string;
}

export const ReplayDampeningTracker = React.memo(function ReplayDampeningTracker({
  bracket,
  players,
  currentTimestamp,
}: IProps) {
  const dampening = getDampeningPercentage(bracket, players, currentTimestamp);
  return (
    <div
      className={`font-bold cursor-default ${dampening > 0 ? 'text-error' : 'opacity-60'}`}
      title={`Healing received reduced by ${dampening}%`}
    >
      Dampening: -{dampening}%
    </div>
  );
});

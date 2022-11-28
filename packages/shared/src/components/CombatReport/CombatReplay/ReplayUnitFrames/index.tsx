import { AtomicArenaCombat, CombatUnitReaction, ICombatUnit } from '@wowarenalogs/parser';

import styles from './index.module.css';
import { UnitFrame } from './UnitFrame';

interface IProps {
  combat: AtomicArenaCombat;
  players: ICombatUnit[];
  currentTimeOffset: number;
  onClickUnit: (unitId: string) => void;
}

export const ReplayUnitFrames = (props: IProps) => {
  const enemies = props.players.filter((p) => p.reaction === CombatUnitReaction.Hostile);
  const friends = props.players.filter((p) => p.reaction === CombatUnitReaction.Friendly);

  return (
    <div className={`${styles['combat-report-replay-unit-frame']} flex flex-col`}>
      <div className="flex flex-col">
        {enemies.map((p) => (
          <UnitFrame
            key={p.id}
            combat={props.combat}
            unit={p}
            currentTimeOffset={props.currentTimeOffset}
            onClick={() => props.onClickUnit(p.id)}
          />
        ))}
      </div>
      <div className="flex-1" />
      <div className="flex flex-col">
        {friends.map((p) => (
          <UnitFrame
            key={p.id}
            combat={props.combat}
            unit={p}
            currentTimeOffset={props.currentTimeOffset}
            onClick={() => props.onClickUnit(p.id)}
          />
        ))}
      </div>
    </div>
  );
};

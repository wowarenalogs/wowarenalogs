import { CombatUnitReaction, ICombatData, ICombatUnit } from 'wow-combat-log-parser';

import styles from './index.module.css';

import { Box } from '../../../../common/Box';
import { UnitFrame } from './UnitFrame';

interface IProps {
  combat: ICombatData;
  players: ICombatUnit[];
  currentTimeOffset: number;
  onClickUnit: (unitId: string) => void;
}

export const ReplayUnitFrames = (props: IProps) => {
  const enemies = props.players.filter((p) => p.reaction === CombatUnitReaction.Hostile);
  const friends = props.players.filter((p) => p.reaction === CombatUnitReaction.Friendly);

  return (
    <Box className={styles['combat-report-replay-unit-frame']} display="flex" flexDirection="column">
      <Box display="flex" flexDirection="column">
        {enemies.map((p) => (
          <UnitFrame
            key={p.id}
            combat={props.combat}
            unit={p}
            currentTimeOffset={props.currentTimeOffset}
            onClick={() => props.onClickUnit(p.id)}
          />
        ))}
      </Box>
      <Box flex="1" />
      <Box display="flex" flexDirection="column">
        {friends.map((p) => (
          <UnitFrame
            key={p.id}
            combat={props.combat}
            unit={p}
            currentTimeOffset={props.currentTimeOffset}
            onClick={() => props.onClickUnit(p.id)}
          />
        ))}
      </Box>
    </Box>
  );
};

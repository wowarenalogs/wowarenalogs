import { Tabs } from 'antd';
import _ from 'lodash';
import { useState } from 'react';
import { CombatUnitType, ICombatData } from 'wow-combat-log-parser';

import { CombatUnitName } from '../CombatUnitName';
import { CombatPlayer } from './CombatPlayer';

interface IProps {
  combat: ICombatData;
  activePlayerId: string | null;
}

export function CombatPlayers(props: IProps) {
  const [lastActivePlayerIdFromProps, setLastActivePlayerIdFromProps] = useState<string | null>(null);

  const players = _.sortBy(
    _.values(props.combat.units).filter((u) => u.type === CombatUnitType.Player),
    ['reaction'],
  );

  const [activePlayerId, setActivePlayerId] = useState<string>(players[0].id);

  if (props.activePlayerId !== lastActivePlayerIdFromProps) {
    setLastActivePlayerIdFromProps(props.activePlayerId);
    if (props.activePlayerId) {
      setActivePlayerId(props.activePlayerId);
    }
  }

  return (
    <Tabs
      defaultActiveKey={activePlayerId}
      activeKey={activePlayerId}
      tabPosition="left"
      onChange={(key) => {
        setActivePlayerId(key);
      }}
    >
      {players.map((p) => {
        return (
          <Tabs.TabPane key={p.id} tab={<CombatUnitName unit={p} />}>
            <CombatPlayer player={p} />
          </Tabs.TabPane>
        );
      })}
    </Tabs>
  );
}

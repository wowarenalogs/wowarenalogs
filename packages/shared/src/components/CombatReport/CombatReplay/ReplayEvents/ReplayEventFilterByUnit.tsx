import { ICombatUnit } from '@wowarenalogs/parser';
import React from 'react';
import { TbCaretDown, TbMenu } from 'react-icons/tb';

import { Dropdown } from '../../../common/Dropdown';
import { useCombatReportContext } from '../../CombatReportContext';
import { CombatUnitName } from '../../CombatUnitName';

interface IProps {
  unit: ICombatUnit | null;
  setFilter: (unitId: string | null) => void;
}

export const ReplayEventFilterByUnit = React.memo(function ReplayEventFilterByUnit(props: IProps) {
  const context = useCombatReportContext();

  return (
    <Dropdown
      align="right"
      placement="top"
      className="mr-2"
      menuItems={[
        {
          key: 'all',
          label: (
            <>
              <TbMenu />
              &nbsp;All Units
            </>
          ),
          onClick: () => props.setFilter(null),
        },
        ...context.players.map((p) => {
          return {
            key: p.id,
            label: <CombatUnitName unit={p} />,
            onClick: () => props.setFilter(p.id),
          };
        }),
      ]}
    >
      <div className="flex flex-row items-center">
        <div className="mr-1">{props.unit ? <CombatUnitName unit={props.unit} /> : 'All Units'}</div>
        <TbCaretDown />
      </div>
    </Dropdown>
  );
});

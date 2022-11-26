import { ICombatUnit } from '@wowarenalogs/parser';
import React from 'react';
import { TbCaretDown, TbMenu } from 'react-icons/tb';

import { useCombatReportContext } from '../../CombatReportContext';
import { CombatUnitName } from '../../CombatUnitName';

interface IProps {
  unit: ICombatUnit | null;
  setFilter: (unitId: string | null) => void;
}

export const ReplayEventFilterByUnit = React.memo(function ReplayEventFilterByUnit(props: IProps) {
  const context = useCombatReportContext();

  return (
    <div className="dropdown">
      <label className="btn btn-sm m-1" tabIndex={0}>
        <div className="flex flex-row items-center">
          <div className="mr-1">{props.unit ? <CombatUnitName unit={props.unit} /> : 'All Units'}</div>
          <TbCaretDown />
        </div>
      </label>
      <ul className="dropdown-content menu menu-compact p-2 shadow bg-base-300 rounded-box w-52" tabIndex={0}>
        <li
          onClick={() => {
            props.setFilter(null);
          }}
        >
          <a>
            <TbMenu />
            &nbsp;All Units
          </a>
        </li>
        {context.players.map((p) => {
          return (
            <li
              key={p.id}
              onClick={() => {
                props.setFilter(p.id);
              }}
            >
              <a>
                <CombatUnitName unit={p} />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

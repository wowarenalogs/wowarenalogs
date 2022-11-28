import React from 'react';
import { TbCaretDown } from 'react-icons/tb';

export interface ReplayEventFilters {
  significantDamageHealOnly: boolean;
  significantAurasOnly: boolean;
}

interface IProps {
  setFilters: (filters: ReplayEventFilters) => void;
  filters: ReplayEventFilters;
}

export const ReplayEventFilterDropdown = React.memo(function ReplayEventFilterDropdown(props: IProps) {
  return (
    <div className="dropdown">
      <label className="btn btn-sm m-1" tabIndex={1}>
        Filters&nbsp;
        <TbCaretDown />
      </label>
      <ul className="dropdown-content menu menu-compact p-2 shadow bg-base-300 rounded-box w-52" tabIndex={1}>
        <li>
          <div className="form-control">
            <label className="label cursor-pointer">
              <span className="label-text">Hide insignificant damage/heal</span>
              <input
                className="checkbox"
                type="checkbox"
                checked={props.filters.significantDamageHealOnly}
                onChange={(e) => {
                  props.setFilters({
                    ...props.filters,
                    significantDamageHealOnly: e.target.checked,
                  });
                }}
              />
            </label>
          </div>
        </li>
        <li>
          <div className="form-control">
            <label className="label cursor-pointer">
              <span className="label-text">Hide insignificant buff/debuffs</span>
              <input
                className="checkbox"
                type="checkbox"
                checked={props.filters.significantAurasOnly}
                onChange={(e) => {
                  props.setFilters({
                    ...props.filters,
                    significantAurasOnly: e.target.checked,
                  });
                }}
              />
            </label>
          </div>
        </li>
      </ul>
    </div>
  );
});

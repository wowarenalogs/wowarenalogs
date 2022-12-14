import React from 'react';
import { TbCaretDown } from 'react-icons/tb';

import { Dropdown } from '../../../common/Dropdown';

export interface ReplayEventFilters {
  significantDamageHealOnly: boolean;
  significantAurasOnly: boolean;
}

interface IProps {
  setFilters: (filters: ReplayEventFilters) => void;
  filters: ReplayEventFilters;
  placement?: 'top' | 'bottom';
}

export const ReplayEventFilterDropdown = React.memo(function ReplayEventFilterDropdown(props: IProps) {
  return (
    <Dropdown
      align="right"
      placement={props.placement ?? 'top'}
      keepOpenOnMenuClick={true}
      menuItems={[
        {
          key: 'significantDamageHealOnly',
          label: (
            <div className="form-control">
              <label className="label cursor-pointer">
                <span className="label-text">Hide insignificant damage/heal</span>
                <input
                  className="checkbox checkbox-sm"
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
          ),
          onClick: () => {
            return;
          },
        },
        {
          key: 'significantAurasOnly',
          label: (
            <div className="form-control">
              <label className="label cursor-pointer">
                <span className="label-text">Hide insignificant buff/debuffs</span>
                <input
                  className="checkbox checkbox-sm"
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
          ),
          onClick: () => {
            return;
          },
        },
      ]}
    >
      <>
        Filters&nbsp;
        <TbCaretDown />
      </>
    </Dropdown>
  );
});

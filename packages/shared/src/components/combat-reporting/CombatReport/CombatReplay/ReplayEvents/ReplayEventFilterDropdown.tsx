import { DownOutlined } from '@ant-design/icons';
import { Button, Checkbox, Dropdown, Menu } from 'antd';
import { useTranslation } from 'next-i18next';
import React from 'react';

export interface ReplayEventFilters {
  significantDamageHealOnly: boolean;
  significantAurasOnly: boolean;
}

interface IProps {
  setFilters: (filters: ReplayEventFilters) => void;
  filters: ReplayEventFilters;
}

export const ReplayEventFilterDropdown = React.memo(function ReplayEventFilterDropdown(props: IProps) {
  const { t } = useTranslation();

  return (
    <Dropdown
      overlay={
        <Menu selectable={false}>
          <Menu.Item>
            <Checkbox
              checked={props.filters.significantDamageHealOnly}
              onChange={(e) => {
                props.setFilters({
                  ...props.filters,
                  significantDamageHealOnly: e.target.checked,
                });
              }}
            >
              {t('combat-report-event-filters-hide-insignificant-damage-heals')}
            </Checkbox>
          </Menu.Item>
          <Menu.Item>
            <Checkbox
              checked={props.filters.significantAurasOnly}
              onChange={(e) => {
                props.setFilters({
                  ...props.filters,
                  significantAurasOnly: e.target.checked,
                });
              }}
            >
              {t('combat-report-event-filters-hide-insignificant-buffs-debuffs')}
            </Checkbox>
          </Menu.Item>
        </Menu>
      }
    >
      <Button>
        {t('combat-report-event-filters')} <DownOutlined />
      </Button>
    </Dropdown>
  );
});

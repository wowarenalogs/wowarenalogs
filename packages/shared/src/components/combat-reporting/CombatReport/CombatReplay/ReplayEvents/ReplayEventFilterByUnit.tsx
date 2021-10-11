import { DownOutlined, MenuOutlined } from '@ant-design/icons';
import { Button, Dropdown, Menu } from 'antd';
import { useTranslation } from 'next-i18next';
import React, { useContext } from 'react';
import { ICombatUnit } from 'wow-combat-log-parser';

import { Box } from '../../../../common/Box';
import { CombatReportContext } from '../../CombatReportContext';
import { CombatUnitName } from '../../CombatUnitName';

interface IProps {
  unit: ICombatUnit | null;
  setFilter: (unitId: string | null) => void;
}

export const ReplayEventFilterByUnit = React.memo(function ReplayEventFilterByUnit(props: IProps) {
  const { t } = useTranslation();
  const context = useContext(CombatReportContext);

  return (
    <Dropdown
      overlay={
        <Menu>
          <Menu.Item
            onClick={() => {
              props.setFilter(null);
            }}
          >
            <MenuOutlined />
            &nbsp;{t('combat-report-all-units')}
          </Menu.Item>
          {context.players.map((p) => {
            return (
              <Menu.Item
                key={p.id}
                onClick={() => {
                  props.setFilter(p.id);
                }}
              >
                <CombatUnitName unit={p} />
              </Menu.Item>
            );
          })}
        </Menu>
      }
    >
      <Button>
        <Box display="flex" flexDirection="row" alignItems="center">
          <Box mr={1}>{props.unit ? <CombatUnitName unit={props.unit} /> : t('combat-report-all-units')}</Box>
          <DownOutlined />
        </Box>
      </Button>
    </Dropdown>
  );
});

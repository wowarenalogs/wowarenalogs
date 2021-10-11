import { Input, Alert, AutoComplete } from 'antd';
import _ from 'lodash';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import { ICombatData, LogEvent } from 'wow-combat-log-parser';

import styles from './index.module.css';

import { Box } from '../../../common/Box';

interface IProps {
  combat: ICombatData;
}

const LogEvts = Object.keys(LogEvent).map((e) => ({ value: e }));

const lowerIncludes = (e: string, x: string) => {
  return e.toLowerCase().includes(x.toLowerCase());
};

export const CombatLogView = (props: IProps) => {
  const { t } = useTranslation();
  const [textFilter, setTextFilter] = useState('');
  const lines = props.combat.rawLines.filter((e) => lowerIncludes(e, textFilter));
  const debouncedUpdate = _.debounce(setTextFilter, 300);
  const [options, setOptions] = useState<{ value: string }[]>([]);
  const onSearch = (searchText: string) => {
    setOptions(!searchText ? [] : LogEvts.filter((e) => lowerIncludes(e.value, searchText)));
  };

  return (
    <>
      <Box width={400} mb={4}>
        <Alert type={'warning'} message={t('combat-report-log-view-data-warning')} />
      </Box>
      <Box width={400} mb={4}>
        <AutoComplete onSelect={setTextFilter} onSearch={onSearch} options={options}>
          <Input.Search
            onChange={(evt) => {
              debouncedUpdate(evt.target.value);
            }}
          ></Input.Search>
        </AutoComplete>
      </Box>
      <Box mb={4}>
        {lines.map((e, i) => (
          <div className={styles['combat-report-raw-log-line']} key={i}>
            {e}
          </div>
        ))}
      </Box>
    </>
  );
};

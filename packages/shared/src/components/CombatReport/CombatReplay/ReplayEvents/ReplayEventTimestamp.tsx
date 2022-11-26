import moment from 'moment';
import { useContext } from 'react';

import { CombatReportContext } from '../../CombatReportContext';

interface IProps {
  timestamp: number;
}
export function ReplayEventTimestamp(props: IProps) {
  const context = useContext(CombatReportContext);
  if (!context.combat) {
    return null;
  }

  return <div className="opacity-60">{moment.utc(props.timestamp - context.combat.startTime).format('mm:ss.SSS')}</div>;
}

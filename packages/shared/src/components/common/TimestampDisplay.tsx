import moment from 'moment-timezone';
import { useEffect, useState } from 'react';

export interface IProps {
  timestamp: number;
  timezone?: string | null;
}

export function TimestampDisplay(props: IProps) {
  const [now, setNow] = useState(moment.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(moment.now());
    }, 5 * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [props.timestamp]);

  const timezone = props.timezone || moment.tz.guess();
  const timestamp = moment.tz(props.timestamp, timezone).valueOf();

  const text = now - timestamp < 60 * 60 * 1000 ? moment(timestamp).from(now) : moment(timestamp).calendar(now);

  return <span>{text}</span>;
}

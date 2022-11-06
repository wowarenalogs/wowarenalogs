import moment from 'moment-timezone';
import { useEffect, useState } from 'react';

export interface IProps {
  timestamp: number;
  applyUtcFix?: boolean;
}

export function TimestampDisplay(props: IProps) {
  const [now, setNow] = useState(moment.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(moment.now());
    }, 30 * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [props.timestamp]);

  let timestampInLocalTimezone = moment(props.timestamp).valueOf();
  if (props.applyUtcFix) {
    const timestampObj = moment.tz(props.timestamp, 'Etc/UTC');
    const timestampObjLocal = timestampObj.tz(moment.tz.guess(), true);
    timestampInLocalTimezone = timestampObjLocal.valueOf();
  }

  const text =
    now - timestampInLocalTimezone < 60 * 60 * 1000
      ? moment(timestampInLocalTimezone).from(now)
      : moment(timestampInLocalTimezone).calendar(now);

  return <span>{text}</span>;
}

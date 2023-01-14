import moment from 'moment';
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Utils } from '../../../utils/utils';

interface IProps {
  data: ({
    timeMark: number;
  } & Record<string, number>)[];
  series: {
    key: string;
    displayName: string;
    color: string;
  }[];
}

export const CurveChart = (props: IProps) => {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      >
        <ResponsiveContainer debounce={25}>
          <LineChart data={props.data}>
            <XAxis dataKey="timeMark" tickFormatter={(v) => moment.utc(v * 1000).format('mm:ss')} />
            <YAxis />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1a1a1a',
              }}
              // animationDuration={5}
              labelFormatter={(v) => moment.utc(v * 1000).format('mm:ss')}
              formatter={(v) => Utils.printCombatNumber(v as number)}
            />
            <Legend />
            {props.series.map((s) => (
              <Line
                // animationDuration={5}
                key={s.key}
                type="monotone"
                legendType="rect"
                dataKey={s.key}
                name={s.displayName}
                stroke={s.color}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

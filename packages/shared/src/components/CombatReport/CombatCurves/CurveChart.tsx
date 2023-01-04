import moment from 'moment';
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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

const shortNum = (n: number, fixed?: number) => {
  if (Math.abs(n) > 1000000) {
    return (n / 1000000).toFixed(2) + 'M';
  }
  if (Math.abs(n) > 1000) {
    return (n / 1000).toFixed(fixed ?? 2) + 'K';
  }

  return n.toFixed(fixed ?? 1);
};

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
              formatter={(v) => shortNum(v as number)}
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

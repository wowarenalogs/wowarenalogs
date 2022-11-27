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

export const CurveChart = (props: IProps) => {
  return (
    <ResponsiveContainer>
      <LineChart data={props.data}>
        <XAxis dataKey="timeMark" tickFormatter={(v) => moment.utc(v * 1000).format('mm:ss')} />
        <YAxis />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1a1a1a',
          }}
          labelFormatter={(v) => moment.utc(v * 1000).format('mm:ss')}
        />
        <Legend />
        {props.series.map((s) => (
          <Line key={s.key} type="monotone" legendType="rect" dataKey={s.key} name={s.displayName} stroke={s.color} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};

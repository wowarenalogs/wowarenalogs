import moment from 'moment';
import { Area, AreaChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Utils } from '../../../utils/utils';

interface ISeries {
  key: string;
  name: string;
  color: string;
}

interface IProps {
  data: ({
    timeMark: number;
  } & Record<string, number>)[];
  series: ISeries[];
}

export const StackedDamageChart = ({ data, series }: IProps) => {
  return (
    <div className="w-full h-full relative">
      <div className="w-full h-full absolute top-0 left-0">
        <ResponsiveContainer debounce={25}>
          <AreaChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
            <XAxis dataKey="timeMark" tickFormatter={(v: number) => moment.utc(v * 1000).format('mm:ss')} />
            <YAxis width={64} tickFormatter={(value) => Utils.printCombatNumber(value as number)} tickMargin={6} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid #1f2937' }}
              labelFormatter={(v) => moment.utc((v as number) * 1000).format('mm:ss')}
              formatter={(value, name) => {
                const numericValue = Number(value);
                if (!numericValue) {
                  return null;
                }
                return [Utils.printCombatNumber(numericValue), name];
              }}
            />
            <Legend />
            {series.map((entry) => (
              <Area
                key={entry.key}
                type="monotone"
                dataKey={entry.key}
                name={entry.name}
                stroke={entry.color}
                fill={entry.color}
                fillOpacity={0.5}
                stackId="damage"
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

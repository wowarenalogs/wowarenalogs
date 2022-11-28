import { Pie, PieChart, Tooltip } from 'recharts';

interface IProps {
  data: { id: string; name: string; value: number }[];
}

const RADIAN = Math.PI / 180;
const OUTER_RADIUS = 0.7;

export const PlayerPieChart = (props: IProps) => {
  return (
    <PieChart width={400} height={350}>
      <Pie
        data={props.data}
        nameKey="name"
        dataKey="value"
        outerRadius={`${OUTER_RADIUS * 100}%`}
        labelLine={false}
        label={({
          cx,
          cy,
          midAngle,
          outerRadius,
          percent,
          name,
        }: {
          cx: number;
          cy: number;
          midAngle: number;
          innerRadius: number;
          outerRadius: number;
          percent: number;
          index: number;
          name: string;
          value: number;
        }) => {
          if (percent < 0.1) return null;

          const radius = outerRadius + 16;
          const x = cx + radius * Math.cos(-midAngle * RADIAN);
          const y = cy + radius * Math.sin(-midAngle * RADIAN);

          return (
            <text x={x} y={y} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
              {name}
            </text>
          );
        }}
      />
      <Tooltip />
    </PieChart>
  );
};

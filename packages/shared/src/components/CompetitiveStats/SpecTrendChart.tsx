import { CombatUnitSpec, getClassColor } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useMemo } from 'react';
import { TbCaretDown } from 'react-icons/tb';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Utils } from '../../utils/utils';
import { Dropdown } from '../common/Dropdown';
import { ChartableStat, SpecStatsData } from './common';

const STAT_INFO: Record<
  ChartableStat,
  {
    name: string;
    formatter: (v: number) => string;
  }
> = {
  representation: {
    name: 'Representation',
    formatter: (v: number) => `${(v * 100).toFixed(1)}%`,
  },
  winRate: {
    name: 'Win Rate',
    formatter: (v: number) => `${(v * 100).toFixed(1)}%`,
  },
  dps: {
    name: 'DPS',
    formatter: (v: number) => Utils.printCombatNumber(v),
  },
  hps: {
    name: 'HPS',
    formatter: (v: number) => Utils.printCombatNumber(v),
  },
  burst: {
    name: 'Burst',
    formatter: (v: number) => Utils.printCombatNumber(v),
  },
  target: {
    name: 'Target',
    formatter: (v: number) => `${(v * 100).toFixed(2)}%`,
  },
};

const SpecTrendChart = (props: {
  data: SpecStatsData;
  specs: CombatUnitSpec[];
  stat: ChartableStat;
  setTrendChartStat: (stat: ChartableStat) => void;
}) => {
  const specs = useMemo(() => {
    return new Set(props.specs);
  }, [props.specs]);

  const dataFiltered = useMemo(() => {
    return props.data.filter((row) => row.spec !== '0' && row.spec !== '(not set)');
  }, [props.data]);

  const matchesCountByDate = useMemo(() => {
    return _.mapValues(
      _.groupBy(dataFiltered, (v) => v.date),
      (v) => _.sum(v.map((row) => row.matches)),
    );
  }, [dataFiltered]);

  const specStats = useMemo(() => {
    return _.map(
      _.groupBy(
        dataFiltered.filter((row) => specs.has(row.spec as CombatUnitSpec)),
        (v) => v.spec,
      ),
      (rows, spec) => {
        return {
          spec: spec as CombatUnitSpec,
          data: _.sortBy(
            _.map(
              _.groupBy(rows, (v) => v.date),
              (dateRows, date) => {
                const matchesCountOfDate = matchesCountByDate[date];
                const winRows = dateRows.filter((row) => row.result === 'win');
                const loseRows = dateRows.filter((row) => row.result === 'lose');
                const win =
                  winRows.length === 0
                    ? {
                        matches: 0,
                        burstDps: 0,
                        effectiveDps: 0,
                        effectiveHps: 0,
                        isKillTarget: 0,
                      }
                    : {
                        matches: _.sum(winRows.map((row) => row.matches)),
                        burstDps:
                          _.sum(winRows.map((row) => row.burstDps * row.matches)) /
                          _.sum(winRows.map((row) => row.matches)),
                        effectiveDps:
                          _.sum(winRows.map((row) => row.effectiveDps * row.matches)) /
                          _.sum(winRows.map((row) => row.matches)),
                        effectiveHps:
                          _.sum(winRows.map((row) => row.effectiveHps * row.matches)) /
                          _.sum(winRows.map((row) => row.matches)),
                        isKillTarget:
                          _.sum(winRows.map((row) => row.isKillTarget * row.matches)) /
                          _.sum(winRows.map((row) => row.matches)),
                      };
                const lose =
                  loseRows.length === 0
                    ? {
                        matches: 0,
                        burstDps: 0,
                        effectiveDps: 0,
                        effectiveHps: 0,
                        isKillTarget: 0,
                      }
                    : {
                        matches: _.sum(loseRows.map((row) => row.matches)),
                        burstDps:
                          _.sum(loseRows.map((row) => row.burstDps * row.matches)) /
                          _.sum(loseRows.map((row) => row.matches)),
                        effectiveDps:
                          _.sum(loseRows.map((row) => row.effectiveDps * row.matches)) /
                          _.sum(loseRows.map((row) => row.matches)),
                        effectiveHps:
                          _.sum(loseRows.map((row) => row.effectiveHps * row.matches)) /
                          _.sum(loseRows.map((row) => row.matches)),
                        isKillTarget:
                          _.sum(loseRows.map((row) => row.isKillTarget * row.matches)) /
                          _.sum(loseRows.map((row) => row.matches)),
                      };

                return {
                  date,
                  win,
                  lose,
                  burst: win.burstDps,
                  dps:
                    (win.effectiveDps * win.matches + lose.effectiveDps * lose.matches) / (win.matches + lose.matches),
                  hps:
                    (win.effectiveHps * win.matches + lose.effectiveHps * lose.matches) / (win.matches + lose.matches),
                  target: lose.isKillTarget,
                  totalMatches: win.matches + lose.matches,
                  representation: (win.matches + lose.matches) / matchesCountOfDate,
                  winRate: win.matches / (win.matches + lose.matches),
                };
              },
            ),
            (v) => v.date,
          ),
        };
      },
    );
  }, [dataFiltered, specs, matchesCountByDate]);

  if (specStats.length === 0) {
    return null;
  }

  return (
    <table className="table table-compact rounded-box w-full">
      <thead>
        <tr>
          <th className="bg-base-300">
            <Dropdown
              menuItems={Object.keys(STAT_INFO).map((s) => ({
                key: s,
                label: STAT_INFO[s as ChartableStat].name,
                onClick: () => {
                  props.setTrendChartStat(s as ChartableStat);
                },
              }))}
            >
              <>
                {STAT_INFO[props.stat].name}&nbsp;
                <TbCaretDown />
              </>
            </Dropdown>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="bg-base-200">
            <div className="w-full h-64 relative">
              <ResponsiveContainer debounce={25}>
                <LineChart>
                  <CartesianGrid stroke="#6a6a6a" strokeDasharray="4 8" />
                  <XAxis dataKey="date" allowDuplicatedCategory={false} />
                  <YAxis tickFormatter={STAT_INFO[props.stat].formatter} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                    }}
                    formatter={(v) => {
                      return STAT_INFO[props.stat].formatter(v as number);
                    }}
                  />
                  <Legend />
                  {specStats.map((s) => (
                    <Line
                      key={s.spec}
                      data={s.data}
                      type="monotone"
                      legendType="line"
                      dataKey={props.stat}
                      name={Utils.getSpecName(s.spec)}
                      dot={false}
                      stroke={getClassColor(Utils.getSpecClass(s.spec))}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
};

export default SpecTrendChart;

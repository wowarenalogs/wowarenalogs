import { CombatUnitSpec } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useRouter } from 'next/router';
import { useCallback, useRef } from 'react';
import { TbArrowDown, TbChartLine } from 'react-icons/tb';
import { useQuery } from 'react-query';

import { Utils } from '../../utils/utils';
import { ErrorPage } from '../common/ErrorPage';
import { SpecImage } from '../common/SpecImage';
import { LoadingScreen } from '../LoadingScreen';
import { ChartableStat, getWinRateCorrectionFactor, SpecStatsData, STATS_SCHEMA_VERSION } from './common';
import SpecTrendChart from './SpecTrendChart';

const SUPPORTED_SORT_KEYS = new Set(['total', 'winRate', 'burst', 'dps', 'hps', 'target']);

export default function SpecStats(props: {
  activeBracket: string;
  minRating: number;
  maxRating: number;
  sortKey: string;
  trendChartSpecs: CombatUnitSpec[];
  trendChartStat: ChartableStat;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);

  const specStatsQuery = useQuery(
    ['competitive-stats', 'spec-stats', props.activeBracket, props.minRating, props.maxRating],
    async () => {
      const result = await fetch(
        `https://data.wowarenalogs.com/data/spec-stats/${props.activeBracket}/${props.minRating}-${props.maxRating}/v${STATS_SCHEMA_VERSION}.latest.json`,
      );
      return (await result.json()) as SpecStatsData;
    },
    {
      // locally cache for one hour to avoid people spamming refresh.
      // don't cache for too long to allow people to see latest data not too long after a refresh.
      // the file is behind a CDN which has a 4-hour cache anyways.
      cacheTime: 1000 * 60 * 60,
      // rely on cache. only refetch when cache expired.
      staleTime: Infinity,
      enabled: true,
    },
  );

  const sortKey = SUPPORTED_SORT_KEYS.has(props.sortKey) ? props.sortKey : 'total';
  const setSortKey = useCallback(
    (key: string) => {
      router.push(
        `/stats?tab=spec-stats&bracket=${props.activeBracket}&sortKey=${key}&minRating=${props.minRating}&maxRating=${
          props.maxRating
        }&trendChartSpecs=${props.trendChartSpecs.join(`,`)}&trendChartStat=${props.trendChartStat}`,
        undefined,
        {
          shallow: true,
        },
      );
    },
    [props.activeBracket, props.minRating, props.maxRating, router, props.trendChartSpecs, props.trendChartStat],
  );
  const setTrendChartSpecs = useCallback(
    (specs: CombatUnitSpec[]) => {
      if (rootRef.current) {
        rootRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
      router.push(
        `/stats?tab=spec-stats&bracket=${props.activeBracket}&sortKey=${sortKey}&minRating=${
          props.minRating
        }&maxRating=${props.maxRating}&trendChartSpecs=${specs.join(`,`)}&trendChartStat=${props.trendChartStat}`,
        undefined,
        {
          shallow: true,
        },
      );
    },
    [props.activeBracket, props.minRating, props.maxRating, router, props.trendChartStat, sortKey],
  );
  const setTrendChartStat = useCallback(
    (stat: ChartableStat) => {
      router.push(
        `/stats?tab=spec-stats&bracket=${props.activeBracket}&sortKey=${sortKey}&minRating=${
          props.minRating
        }&maxRating=${props.maxRating}&trendChartSpecs=${props.trendChartSpecs.join(`,`)}&trendChartStat=${stat}`,
        undefined,
        {
          shallow: true,
        },
      );
    },
    [props.activeBracket, props.minRating, props.maxRating, router, props.trendChartSpecs, sortKey],
  );

  if (specStatsQuery.isLoading) {
    return <LoadingScreen />;
  }

  if (specStatsQuery.isError) {
    return <ErrorPage message={JSON.stringify(specStatsQuery.error)} />;
  }

  const specStats = specStatsQuery.data;
  if (!specStats) {
    return <ErrorPage message="Failed to retrieve stats data." />;
  }

  let statsSorted = _.orderBy(
    _.map(
      _.groupBy(
        specStats.filter((row) => row.spec !== '0' && row.spec !== '(not set)'),
        (v) => v.spec,
      ),
      (rows, spec) => {
        const winRows = rows.filter((row) => row.result === 'win');
        const loseRows = rows.filter((row) => row.result === 'lose');
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
                  _.sum(winRows.map((row) => row.burstDps * row.matches)) / _.sum(winRows.map((row) => row.matches)),
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
                  _.sum(loseRows.map((row) => row.burstDps * row.matches)) / _.sum(loseRows.map((row) => row.matches)),
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
          spec: spec as CombatUnitSpec,
          win,
          lose,
          burst: win.burstDps,
          dps: (win.effectiveDps * win.matches + lose.effectiveDps * lose.matches) / (win.matches + lose.matches),
          hps: (win.effectiveHps * win.matches + lose.effectiveHps * lose.matches) / (win.matches + lose.matches),
          target: lose.isKillTarget,
          total: win.matches + lose.matches,
          winRate: win.matches / (win.matches + lose.matches),
        };
      },
    ),
    sortKey ?? 'total',
    'desc',
  );

  const winRateCorrectionFactor = getWinRateCorrectionFactor(
    _.sum(statsSorted.map((v) => v.win.matches)),
    _.sum(statsSorted.map((v) => v.lose.matches)),
  );

  if (props.activeBracket === 'Rated Solo Shuffle') {
    // in solo shuffles, protection paladins always fight against protection paladins
    // so their overall win rate should be strictly at 50%. we do this correction to avoid
    // reporting a number biased by uploader's win rate.
    statsSorted
      .filter((s) => s.spec === CombatUnitSpec.Paladin_Protection)
      .forEach((s) => {
        s.winRate = 0.5 / winRateCorrectionFactor;
      });
    statsSorted = _.orderBy(statsSorted, sortKey ?? 'total', 'desc');
  }

  return (
    <div className="mt-2 flex-1 flex flex-row items-start relative overflow-x-auto overflow-y-scroll" ref={rootRef}>
      <div className="flex flex-col gap-2">
        {props.trendChartSpecs.length > 0 && (
          <div className="w-full">
            <SpecTrendChart
              data={specStats}
              specs={props.trendChartSpecs}
              stat={props.trendChartStat}
              setTrendChartStat={setTrendChartStat}
            />
          </div>
        )}
        <table className="table table-compact relative rounded-box">
          <thead>
            <tr>
              <th className="bg-base-300">Spec</th>
              <th className="bg-base-300">
                <div className="flex flex-row items-center gap-1">
                  <TbChartLine className="text-lg" />
                </div>
              </th>
              <th className="bg-base-300">
                <div className="flex flex-row items-center gap-1">
                  Matches
                  <button
                    className={`btn btn-xs btn-ghost ${sortKey === 'total' ? 'text-primary' : ''}`}
                    onClick={() => {
                      setSortKey('total');
                    }}
                  >
                    <TbArrowDown />
                  </button>
                </div>
              </th>
              <th className="bg-base-300">
                <div className="flex flex-row items-center gap-1">
                  Win Rate
                  <button
                    className={`btn btn-xs btn-ghost ${sortKey === 'winRate' ? 'text-primary' : ''}`}
                    onClick={() => {
                      setSortKey('winRate');
                    }}
                  >
                    <TbArrowDown />
                  </button>
                </div>
              </th>
              <th className="bg-base-300">
                <div
                  className="flex flex-row items-center gap-1"
                  title="Average damage per second, including damage done by pets but excluding damage done to pets."
                >
                  Avg DPS
                  <button
                    className={`btn btn-xs btn-ghost ${sortKey === 'dps' ? 'text-primary' : ''}`}
                    onClick={() => {
                      setSortKey('dps');
                    }}
                  >
                    <TbArrowDown />
                  </button>
                </div>
              </th>
              <th className="bg-base-300">
                <div
                  className="flex flex-row items-center gap-1"
                  title="Average damage per second during burst windows, including damage done by pets but excluding damage done to pets."
                >
                  Burst DPS
                  <button
                    className={`btn btn-xs btn-ghost ${sortKey === 'burst' ? 'text-primary' : ''}`}
                    onClick={() => {
                      setSortKey('burst');
                    }}
                  >
                    <TbArrowDown />
                  </button>
                </div>
              </th>
              <th className="bg-base-300">
                <div
                  className="flex flex-row items-center gap-1"
                  title="Average healing per second, including absorbs and excluding overheals."
                >
                  Avg HPS
                  <button
                    className={`btn btn-xs btn-ghost ${sortKey === 'hps' ? 'text-primary' : ''}`}
                    onClick={() => {
                      setSortKey('hps');
                    }}
                  >
                    <TbArrowDown />
                  </button>
                </div>
              </th>
              <th className="bg-base-300">
                <div
                  className="flex flex-row items-center gap-1"
                  title="Among all the matches when this spec lost, how many times was this spec the first blood?"
                >
                  First Blood
                  <button
                    className={`btn btn-xs btn-ghost ${sortKey === 'target' ? 'text-primary' : ''}`}
                    onClick={() => {
                      setSortKey('target');
                    }}
                  >
                    <TbArrowDown />
                  </button>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {statsSorted
              .filter((stats) => stats.total >= 10)
              .map((stats) => (
                <tr key={stats.spec}>
                  <th className="bg-base-200">
                    <div className="flex flex-row gap-2">
                      <SpecImage specId={stats.spec} />
                    </div>
                  </th>
                  <td className="bg-base-200 text-right">
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-xs"
                        checked={props.trendChartSpecs.includes(stats.spec)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setTrendChartSpecs([...props.trendChartSpecs, stats.spec]);
                          } else {
                            setTrendChartSpecs(props.trendChartSpecs.filter((s) => s !== stats.spec));
                          }
                        }}
                      />
                    </div>
                  </td>
                  <td className="bg-base-200 text-right">{stats.total}</td>
                  <td className="bg-base-200 text-right">
                    {(stats.winRate * winRateCorrectionFactor * 100).toFixed(1)}%
                  </td>
                  <td className="bg-base-200 text-right">{Utils.printCombatNumber(stats.dps)}</td>
                  <td className="bg-base-200 text-right">
                    {stats.burst ? Utils.printCombatNumber(stats.burst) : 'Pending'}
                  </td>
                  <td className="bg-base-200 text-right">{Utils.printCombatNumber(stats.hps)}</td>
                  <td className="bg-base-200 text-right">{(stats.target * 100).toFixed(1)}%</td>
                </tr>
              ))}
          </tbody>
        </table>
        <div className="opacity-50">Specs and comps with less than 10 recorded matches are hidden.</div>
      </div>
    </div>
  );
}

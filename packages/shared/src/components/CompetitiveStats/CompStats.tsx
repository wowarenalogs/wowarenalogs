import _ from 'lodash';
import { useRouter } from 'next/router';
import { useCallback } from 'react';
import { TbArrowDown } from 'react-icons/tb';
import { useQuery } from 'react-query';

import { Utils } from '../../utils/utils';
import { ErrorPage } from '../common/ErrorPage';
import { SpecImage } from '../common/SpecImage';
import { LoadingScreen } from '../LoadingScreen';
import { getWinRateCorrectionFactor, STATS_SCHEMA_VERSION } from './common';

type StatsData = {
  [bracket: string]: {
    [specs: string]: {
      win?: {
        matches: number;
        burstDps: number;
        effectiveDps: number;
        effectiveHps: number;
      };
      lose?: {
        matches: number;
        burstDps: number;
        effectiveDps: number;
        effectiveHps: number;
        killTargetSpec: {
          [spec: string]: number;
        };
      };
    };
  };
};

const SUPPORTED_SORT_KEYS = new Set(['total', 'winRate', 'burst', 'dps', 'hps']);

export default function CompStats(props: { activeBracket: string; sortKey: string }) {
  const router = useRouter();
  const specStatsQuery = useQuery(
    ['competitive-stats', 'comp-stats'],
    async () => {
      const result = await fetch(`https://data.wowarenalogs.com/data/comp-stats.v${STATS_SCHEMA_VERSION}.json`);
      return (await result.json()) as StatsData;
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
      router.push(`/stats?tab=comp-stats&bracket=${props.activeBracket}&sortKey=${key}`, undefined, {
        shallow: true,
      });
    },
    [props.activeBracket, router],
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

  const bracketStats = specStats[props.activeBracket];
  const bracketStatsSorted = _.orderBy(
    Object.keys(bracketStats)
      .filter((rawSpec) => rawSpec !== '0' && rawSpec !== '(not set)')
      .map((rawSpec) => {
        const spec = rawSpec;
        const stats = bracketStats[spec];
        const win = {
          matches: 0,
          burstDps: 0,
          effectiveDps: 0,
          effectiveHps: 0,
          ...stats.win,
        };
        const lose = {
          matches: 0,
          burstDps: 0,
          effectiveDps: 0,
          effectiveHps: 0,
          killTargetSpec: {},
          ...stats.lose,
        };
        return {
          spec,
          win,
          lose,
          burst: win.burstDps,
          dps: (win.effectiveDps * win.matches + lose.effectiveDps * lose.matches) / (win.matches + lose.matches),
          hps: (win.effectiveHps * win.matches + lose.effectiveHps * lose.matches) / (win.matches + lose.matches),
          total: win.matches + lose.matches,
          winRate: win.matches / (win.matches + lose.matches),
          killTargetSpec: lose.killTargetSpec,
        };
      }),
    sortKey,
    'desc',
  );

  const winRateCorrectionFactor = getWinRateCorrectionFactor(
    _.sum(bracketStatsSorted.map((v) => v.win.matches)),
    _.sum(bracketStatsSorted.map((v) => v.lose.matches)),
  );

  return (
    <div className="mt-2 flex-1 flex flex-row items-start relative overflow-x-auto overflow-y-scroll">
      <div className="flex flex-col">
        <table className="table table-compact relative rounded-box">
          <thead>
            <tr>
              <th className="bg-base-300">Comp</th>
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
                  title="Among all the matches when this comp lost, how many times each spec ended up being the first blood."
                >
                  First Blood
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {bracketStatsSorted
              .filter((stats) => stats.total >= 10)
              .map((stats) => {
                const killTargetTotal = Object.values(stats.killTargetSpec).reduce((a, b) => a + b, 0);
                return (
                  <tr key={stats.spec}>
                    <th className="bg-base-200">
                      <div className="flex flex-row gap-2">
                        {stats.spec.split('_').map((spec, i) => (
                          <SpecImage key={`${spec}_${i}`} specId={spec} />
                        ))}
                      </div>
                    </th>
                    <td className="bg-base-200 text-right">{stats.total}</td>
                    <td className="bg-base-200 text-right">
                      {(stats.winRate * winRateCorrectionFactor * 100).toFixed(1)}%
                    </td>
                    <td className="bg-base-200 text-right">{Utils.printCombatNumber(stats.dps)}</td>
                    <td className="bg-base-200 text-right">
                      {stats.burst ? Utils.printCombatNumber(stats.burst) : 'Pending'}
                    </td>
                    <td className="bg-base-200 text-right">{Utils.printCombatNumber(stats.hps)}</td>
                    <td className="bg-base-200 text-right">
                      <div className="flex flex-row items-center gap-4">
                        {Object.keys(stats.killTargetSpec).map((spec) => (
                          <div key={spec} className="flex flex-row items-center gap-1">
                            <SpecImage key={spec} specId={spec} />
                            <div>{((stats.killTargetSpec[spec] * 100) / killTargetTotal).toFixed(1)}%</div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        <div className="opacity-50 mt-2">Specs and comps with less than 10 recorded matches are hidden.</div>
      </div>
    </div>
  );
}

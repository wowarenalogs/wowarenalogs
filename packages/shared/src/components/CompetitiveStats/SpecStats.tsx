import { CombatUnitSpec } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useRouter } from 'next/router';
import { useCallback } from 'react';
import { TbArrowDown } from 'react-icons/tb';
import { useQuery } from 'react-query';

import { Utils } from '../../utils/utils';
import { ErrorPage } from '../common/ErrorPage';
import { SpecImage } from '../common/SpecImage';
import { LoadingScreen } from '../LoadingScreen';
import { STATS_SCHEMA_VERSION } from './common';

type StatsData = {
  [bracket: string]: {
    [specs: string]: {
      win?: {
        matches: number;
        effectiveDps: number;
        effectiveHps: number;
        isKillTarget: number;
      };
      lose?: {
        matches: number;
        effectiveDps: number;
        effectiveHps: number;
        isKillTarget: number;
      };
    };
  };
};

const SUPPORTED_SORT_KEYS = new Set(['total', 'winRate', 'dps', 'hps', 'target']);

export default function SpecStats(props: { activeBracket: string; sortKey: string }) {
  const router = useRouter();
  const specStatsQuery = useQuery(
    ['competitive-stats', 'spec-stats'],
    async () => {
      const result = await fetch(`https://images.wowarenalogs.com/data/spec-stats.v${STATS_SCHEMA_VERSION}.json`);
      return (await result.json()) as StatsData;
    },
    {
      // locally cache for one hour to avoid people spamming refresh.
      // don't cache for too long to allow people to see latest data not too long after a refresh.
      // the file is behind a CDN which has a 4-hour cache anyways.
      cacheTime: 1000 * 60 * 1 * 24,
      // rely on cache. only refetch when cache expired.
      staleTime: Infinity,
      enabled: true,
    },
  );

  const sortKey = SUPPORTED_SORT_KEYS.has(props.sortKey) ? props.sortKey : 'total';
  const setSortKey = useCallback(
    (key: string) => {
      router.push(`/stats?tab=spec-stats&bracket=${props.activeBracket}&sortKey=${key}`, undefined, {
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
        const spec = rawSpec as CombatUnitSpec;
        const stats = bracketStats[spec];
        const win = stats.win ?? {
          matches: 0,
          effectiveDps: 0,
          effectiveHps: 0,
          isKillTarget: 0,
        };
        const lose = stats.lose ?? {
          matches: 0,
          effectiveDps: 0,
          effectiveHps: 0,
          isKillTarget: 0,
        };
        return {
          spec,
          win,
          lose,
          dps: (win.effectiveDps * win.matches + lose.effectiveDps * lose.matches) / (win.matches + lose.matches),
          hps: (win.effectiveHps * win.matches + lose.effectiveHps * lose.matches) / (win.matches + lose.matches),
          total: win.matches + lose.matches,
          winRate: win.matches / (win.matches + lose.matches),
          target: lose.isKillTarget ?? 0,
        };
      }),
    sortKey ?? 'total',
    'desc',
  );

  return (
    <div className="mt-2 flex-1 flex flex-row items-start relative overflow-x-auto overflow-y-scroll">
      <div className="flex flex-col">
        <table className="table table-compact relative rounded-box">
          <thead>
            <tr>
              <th className="bg-base-300">Spec</th>
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
                  DPS
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
                  title="Average healing per second, including absorbs and excluding overheals."
                >
                  HPS
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
            {bracketStatsSorted
              .filter((stats) => stats.total >= 10)
              .map((stats) => (
                <tr key={stats.spec}>
                  <th className="bg-base-200">
                    <div className="flex flex-row gap-2">
                      <SpecImage specId={stats.spec} />
                    </div>
                  </th>
                  <td className="bg-base-200 text-right">{stats.total}</td>
                  <td className="bg-base-200 text-right">{(stats.winRate * 100).toFixed(1)}%</td>
                  <td className="bg-base-200 text-right">{Utils.printCombatNumber(stats.dps)}</td>
                  <td className="bg-base-200 text-right">{Utils.printCombatNumber(stats.hps)}</td>
                  <td className="bg-base-200 text-right">{(stats.target * 100).toFixed(1)}%</td>
                </tr>
              ))}
          </tbody>
        </table>
        <div className="opacity-50 mt-2">Specs and comps with less than 10 recorded matches are hidden.</div>
      </div>
    </div>
  );
}

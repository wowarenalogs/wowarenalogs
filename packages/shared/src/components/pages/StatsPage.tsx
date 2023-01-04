import { CombatUnitSpec } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useEffect, useState } from 'react';
import { TbInfoCircle, TbX } from 'react-icons/tb';
import { useQuery } from 'react-query';

import { ErrorPage } from '../common/ErrorPage';
import { SpecImage } from '../common/SpecImage';
import { LoadingScreen } from '../LoadingScreen';

const SUPPORTED_BRACKETS = ['2v2', '3v3', 'Rated Solo Shuffle'];

type CompetitiveStats = {
  [bracket: string]: {
    [specs: string]: {
      win?: number;
      lose?: number;
    };
  };
};

export const StatsPage = () => {
  const [activeBracket, setActiveBracket] = useState('2v2');
  const [dismissedExperimentalInfo, setDismissedExperimentalInfo] = useState(false);

  useEffect(() => {
    setDismissedExperimentalInfo(localStorage.getItem('dismissedExperimentalInfo') === 'true');
  }, []);

  const specStatsQuery = useQuery(
    ['spec-stats'],
    async () => {
      const result = await fetch('https://images.wowarenalogs.com/data/spec-stats.json');
      return (await result.json()) as CompetitiveStats;
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

  const bracketStats = specStats[activeBracket];
  const bracketStatsSorted = _.orderBy(
    Object.keys(bracketStats)
      .filter((rawSpec) => rawSpec !== '0' && rawSpec !== '(not set)')
      .map((rawSpec) => {
        const spec = rawSpec as CombatUnitSpec;
        const stats = bracketStats[spec];
        return {
          spec,
          win: stats.win ?? 0,
          loses: stats.lose ?? 0,
          total: (stats.win ?? 0) + (stats.lose ?? 0),
        };
      }),
    (stats) => stats.total,
    'desc',
  );
  const totalMatches = bracketStatsSorted.reduce((acc, stats) => acc + stats.total, 0);
  const maxSpecTotal = _.maxBy(bracketStatsSorted, (stats) => stats.total)?.total ?? 0;

  return (
    <div className="flex flex-col p-2 w-full h-full">
      {!dismissedExperimentalInfo && (
        <div className="mb-2 relative">
          <div className="alert alert-info shadow-lg">
            <div>
              <TbInfoCircle className="text-xl" />
              These stats are experimental and currently based on a limited sample. Please take it with a grain of salt.
            </div>
            <div className="flex-none">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setDismissedExperimentalInfo(true);
                  localStorage.setItem('dismissedExperimentalInfo', 'true');
                }}
              >
                <TbX />
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-row mt-2 justify-center items-center">
        <div className="tabs tabs-boxed">
          {SUPPORTED_BRACKETS.map((bracket) => (
            <a
              key={bracket}
              className={`tab ${activeBracket === bracket ? 'tab-active' : ''}`}
              onClick={() => {
                setActiveBracket(bracket);
              }}
            >
              {bracket}
            </a>
          ))}
        </div>
        <div
          className="tooltip tooltip-bottom tooltip-info z-50"
          data-tip="Based on ranked matches at all ratings uploaded during the past 7 days, excluding the uploader's own teams to minimize bias."
        >
          <TbInfoCircle className="text-xl ml-2 cursor-pointer opacity-50 hover:opacity-100" />
        </div>
      </div>
      <div className="mt-4 flex-1 flex flex-row justify-center relative overflow-x-hidden overflow-y-scroll">
        <table
          className="table table-compact relative rounded-box min-h-full"
          style={{ minWidth: 600, maxWidth: 1000 }}
        >
          <thead>
            <tr>
              <th className="bg-base-300">Spec</th>
              <th className="bg-base-300 w-full" colSpan={2}>
                Representation
              </th>
              <th className="bg-base-300">Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {bracketStatsSorted.map((stats) => (
              <tr key={stats.spec}>
                <td className="bg-base-200">
                  <SpecImage specId={stats.spec} />
                </td>
                <td className="bg-base-200">{((stats.total * 100) / totalMatches).toFixed(1)}%</td>
                <td className="bg-base-200 w-full">
                  <progress
                    className="progress progress-info w-full"
                    value={Math.floor((stats.total * 100) / maxSpecTotal)}
                    max={100}
                  />
                </td>
                <td className="bg-base-200">{((stats.win * 100) / stats.total).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

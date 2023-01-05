import { CombatUnitSpec } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useQuery } from 'react-query';

import { ErrorPage } from '../common/ErrorPage';
import { SpecImage } from '../common/SpecImage';
import { LoadingScreen } from '../LoadingScreen';

type TCompetitiveStats = {
  [bracket: string]: {
    [specs: string]: {
      win?: number;
      lose?: number;
    };
  };
};

export default function CompetitiveStats(props: { activeBracket: string; statsFileName: string }) {
  const specStatsQuery = useQuery(
    ['competitive-stats', props.statsFileName],
    async () => {
      const result = await fetch(`https://images.wowarenalogs.com/data/${props.statsFileName}.json`);
      return (await result.json()) as TCompetitiveStats;
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

  const bracketStats = specStats[props.activeBracket];
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
    <div className="mt-4 flex-1 flex flex-row justify-center items-start relative overflow-x-hidden overflow-y-scroll">
      <div className="flex flex-col items-center">
        <table className="table table-compact relative rounded-box">
          <thead>
            <tr>
              <th className="bg-base-300">Spec</th>
              <th className="bg-base-300" colSpan={2}>
                Match Representation
              </th>
              <th className="bg-base-300">Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {bracketStatsSorted
              .filter((stats) => stats.total >= 10)
              .map((stats) => (
                <tr key={stats.spec}>
                  <td className="bg-base-200">
                    <div className="flex flex-row gap-2">
                      {stats.spec.split('_').map((spec) => (
                        <SpecImage key={spec} specId={spec} />
                      ))}
                    </div>
                  </td>
                  <td className="bg-base-200">{((stats.total * 100) / totalMatches).toFixed(1)}%</td>
                  <td className="bg-base-200">
                    <progress
                      className="progress progress-info sm:w-32 md:w-64 lg:w-96"
                      value={Math.floor((stats.total * 100) / maxSpecTotal)}
                      max={100}
                    />
                  </td>
                  <td className="bg-base-200 text-right">{((stats.win * 100) / stats.total).toFixed(1)}%</td>
                </tr>
              ))}
          </tbody>
        </table>
        <div className="opacity-50 mt-2">Specs and comps with less than 10 recorded matches are hidden.</div>
      </div>
    </div>
  );
}

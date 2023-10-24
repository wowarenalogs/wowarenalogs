import { CombatUnitSpec } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useMemo } from 'react';
import { useQuery } from 'react-query';

import { ErrorPage } from '../common/ErrorPage';
import { SpecImage } from '../common/SpecImage';
import { LoadingScreen } from '../LoadingScreen';
import { getWinRateCorrectionFactor, SpecStatsData, STATS_SCHEMA_VERSION } from './common';

export default function TierList(props: { activeBracket: string; minRating: number; maxRating: number }) {
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
  const specStats = specStatsQuery.data;

  const data = useMemo(() => {
    if (!specStats) {
      return [];
    }

    const stats = _.map(
      _.groupBy(
        specStats.filter((row) => row.spec !== '0' && row.spec !== '(not set)'),
        (v) => v.spec,
      ),
      (rows, spec) => {
        const wins = _.sumBy(
          rows.filter((row) => row.result === 'win'),
          'matches',
        );
        const losses = _.sumBy(
          rows.filter((row) => row.result === 'lose'),
          'matches',
        );
        return {
          spec: spec as CombatUnitSpec,
          wins,
          losses,
          total: wins + losses,
          winRate: wins / (wins + losses),
        };
      },
    );

    const totalUnits = _.sumBy(stats, 'total');
    const winRateCorrectionFactor = getWinRateCorrectionFactor(
      _.sum(stats.map((v) => v.wins)),
      _.sum(stats.map((v) => v.losses)),
    );

    if (props.activeBracket === 'Rated Solo Shuffle') {
      // in solo shuffles, protection paladins always fight against protection paladins
      // so their overall win rate should be strictly at 50%. we do this correction to avoid
      // reporting a number biased by uploader's win rate.
      stats
        .filter((s) => s.spec === CombatUnitSpec.Paladin_Protection)
        .forEach((s) => {
          s.winRate = 0.5 / winRateCorrectionFactor;
        });
    }

    const adjustedStats = stats
      .map((s) => ({
        spec: s.spec,
        winRate: s.winRate * winRateCorrectionFactor,
        representation: s.total / totalUnits,
      }))
      .sort((a, b) => {
        return b.winRate - a.winRate;
      });

    return adjustedStats.map((s) => ({
      ...s,
      tier:
        s.representation >= 0.03 && s.winRate >= 0.5
          ? 'S'
          : s.representation <= 0.01 && s.winRate <= 0.45
          ? 'C'
          : s.representation <= 0.01 || s.winRate <= 0.45
          ? 'B'
          : 'A',
    }));
  }, [props.activeBracket, specStats]);

  if (specStatsQuery.isLoading) {
    return <LoadingScreen />;
  }

  if (specStatsQuery.isError) {
    return <ErrorPage message={JSON.stringify(specStatsQuery.error)} />;
  }

  if (!specStats) {
    return <ErrorPage message="Failed to retrieve stats data." />;
  }

  return (
    <div className="flex flex-col gap-2 mt-2 overflow-x-auto overflow-y-scroll">
      <table className="table">
        <tbody>
          {['S', 'A', 'B', 'C'].map((tier) => (
            <tr key={tier}>
              <td
                style={{
                  backgroundColor:
                    tier === 'S'
                      ? 'rgb(255, 127, 127)'
                      : tier === 'A'
                      ? 'rgb(255, 191, 127)'
                      : tier === 'B'
                      ? 'rgb(255, 223, 127)'
                      : 'rgb(191, 255, 127)',
                }}
              >
                <div className="w-16 h-16 text-black flex items-center justify-center">{tier}</div>
              </td>
              <td className="flex flex-wrap bg-base-300">
                {data
                  .filter((s) => s.tier === tier)
                  .map((s) => (
                    <div
                      key={s.spec}
                      title={`${
                        Object.keys(CombatUnitSpec)[Object.values(CombatUnitSpec).indexOf(s.spec)]
                      } | Representation = ${(s.representation * 100).toFixed(1)}% | Win Rate = ${(
                        s.winRate * 100
                      ).toFixed(1)}%`}
                    >
                      <SpecImage specId={s.spec} size={64} />
                    </div>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="opacity-50">Tiering based on representation and win rate observed during the past 28 days.</div>
    </div>
  );
}

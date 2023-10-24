import { CombatUnitSpec, getClassColor } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useMemo } from 'react';

import { UserCharacterInfo } from '../../graphql/__generated__/graphql';
import { Utils } from '../../utils/utils';
import { SpecImage } from '../common/SpecImage';
import { Bracket } from '../MatchSearch/BracketSelector';

export const CharacterStats = (props: { specs: UserCharacterInfo[] }) => {
  const brackets = useMemo(() => {
    const data = _.groupBy(
      _.sortBy(
        props.specs.flatMap((s) => {
          return s.bracketStats.map((b) => {
            return {
              specId: s.specId,
              bracket: b.bracket as Bracket,
              data: b,
            };
          });
        }),
        ['specId'],
      ),
      'bracket',
    );

    return _.sortBy(data, ['bracket']);
  }, [props.specs]);

  return (
    <div className="flex flex-col flex-1 gap-4">
      <div className="text-center opacity-50">Data based on matches recorded through WoW Arena Logs.</div>
      {brackets.map((b) => (
        <table className="table" key={b[0].bracket}>
          <thead>
            <tr>
              <th className="bg-base-300" colSpan={3}>
                {b[0].bracket}
              </th>
              <th className="bg-base-300">Matches</th>
              <th className="bg-base-300">Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {b.map((r) => {
              return (
                <tr key={r.specId + r.bracket}>
                  <th className="bg-base-200 flex gap-2 items-center">
                    <SpecImage specId={r.specId} />
                  </th>
                  <td className="bg-base-200">{r.data.latestRating}</td>
                  <td className="bg-base-200 w-full">
                    <div className="w-full bg-base-300 rounded-full h-2.5">
                      <div
                        className="h-2.5 rounded-full"
                        style={{
                          backgroundColor: `${getClassColor(Utils.getSpecClass(r.specId as CombatUnitSpec))}`,
                          width: `${Math.min(100, (r.data.latestRating * 100) / 3000).toFixed(2)}%`,
                        }}
                      ></div>
                    </div>
                  </td>
                  <td className="bg-base-200">{r.data.wins + r.data.losses}</td>
                  <td className="bg-base-200">{((r.data.wins * 100) / (r.data.wins + r.data.losses)).toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </div>
  );
};

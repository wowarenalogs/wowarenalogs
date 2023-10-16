import _ from 'lodash';
import { useMemo } from 'react';

import { UserCharacterInfo } from '../../graphql/__generated__/graphql';
import { SpecImage } from '../common/SpecImage';
import { Bracket } from '../MatchSearch/BracketSelector';

export const CharacterStats = (props: { specs: UserCharacterInfo[] }) => {
  const rows = useMemo(() => {
    const data = props.specs.flatMap((s) => {
      return s.bracketStats.map((b) => {
        return {
          specId: s.specId,
          bracket: b.bracket as Bracket,
          data: b,
        };
      });
    });

    return _.sortBy(data, ['bracket', 'specId']);
  }, [props.specs]);

  return (
    <div className="flex flex-col flex-1">
      <table className="table">
        <thead>
          <tr>
            <th className="bg-base-300"></th>
            <th className="bg-base-300">Rating</th>
            <th className="bg-base-300">Matches</th>
            <th className="bg-base-300">Win Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            return (
              <tr key={r.specId + r.bracket}>
                <th className="bg-base-200 flex gap-2 items-center">
                  <SpecImage specId={r.specId} />
                  {r.bracket}
                </th>
                <td className="bg-base-200">{r.data.latestRating}</td>
                <td className="bg-base-200">{r.data.wins + r.data.losses}</td>
                <td className="bg-base-200">{((r.data.wins * 100) / (r.data.wins + r.data.losses)).toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

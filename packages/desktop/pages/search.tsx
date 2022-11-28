import { CombatUnitSpec } from '@wowarenalogs/parser';
import { BracketSelector, CombatStubList, RatingSelector, SpecSelector } from '@wowarenalogs/shared';
import { QuerryError } from '@wowarenalogs/shared/src/components/common/QueryError';
import { useGetPublicMatchesQuery } from '@wowarenalogs/shared/src/graphql/__generated__/graphql';
import _ from 'lodash';
import { useState } from 'react';
import { TbLoader } from 'react-icons/tb';

interface IPublicMatchesFilters {
  minRating: number;
  winsOnly: boolean;
  bracket: '2v2' | '3v3' | 'Rated Solo Shuffle';
  team1SpecIds: CombatUnitSpec[];
  team2SpecIds: CombatUnitSpec[];
}

function computeCompQueryString(team1specs: CombatUnitSpec[], team2specs: CombatUnitSpec[]) {
  if (team2specs.length > 0) {
    return team1specs.sort().join('_') + 'x' + team2specs.sort().join('_');
  } else {
    return team1specs.sort().join('_');
  }
}

const Page = () => {
  const [bracket, setBracket] = useState('Rated Solo Shuffle');
  const [minRating, setMinRating] = useState<number>(0);

  const [filters, setFiltersImpl] = useState<IPublicMatchesFilters>({
    minRating: 0,
    winsOnly: false,
    bracket: '3v3',
    team1SpecIds: [],
    team2SpecIds: [],
  });
  const compQueryString = computeCompQueryString(filters.team1SpecIds, filters.team2SpecIds);
  // const compQueryString = computeCompQueryString(filters.team1SpecIds, filters.team2SpecIds);

  const setFilters = (newFilters: IPublicMatchesFilters) => {
    setFiltersImpl(newFilters);
    // const encoded = btoa(JSON.stringify(filters));
    // router.push(`/community-matches/shadowlands/${encoded}`, undefined, { shallow: true });

    // setLoading(false);
    // setAllCombats([]);
    // setHasNextPage(true);
    // setQueryLimitReached(false);
    // setQueryId(++nextQueryId);
  };

  function addToOne(s: CombatUnitSpec): void {
    setFilters({
      ...filters,
      team1SpecIds: [...filters.team1SpecIds, s],
    });
  }
  function addToTwo(s: CombatUnitSpec): void {
    setFilters({
      ...filters,
      team2SpecIds: [...filters.team2SpecIds, s],
    });
  }
  function remFromOne(s: CombatUnitSpec): void {
    setFilters({
      ...filters,
      team1SpecIds: filters.team1SpecIds.filter((t) => t !== s),
    });
  }
  function remFromTwo(s: CombatUnitSpec): void {
    setFilters({
      ...filters,
      team2SpecIds: filters.team2SpecIds.filter((t) => t !== s),
    });
  }
  function clearAllFilters() {
    setFilters({
      minRating: 0,
      bracket: '3v3',
      winsOnly: false,
      team1SpecIds: [],
      team2SpecIds: [],
    });
  }

  const matchesQuery = useGetPublicMatchesQuery({
    variables: {
      wowVersion: 'retail',
      bracket,
      minRating,
      compQueryString,
      lhsShouldBeWinner: filters.winsOnly,
    },
  });

  return (
    <div className="transition-all px-4 overflow-y-auto overflow-visible">
      <div className="hero">
        <div className="hero-content flex flex-col items-center">
          <h1 className="text-5xl font-bold">Community Matches</h1>
        </div>
      </div>
      <div className="p-4 rounded bg-base-300">
        <BracketSelector bracket={bracket} setBracket={setBracket} />
        <RatingSelector minRating={minRating} setMinRating={setMinRating} />
        <div>
          <div className="font-semibold text-info-content opacity-50 mt-[5px]">COMPOSITION</div>
          <div className="flex flex-row items-center">
            <div className="flex flex-row items-center space-x-2">
              {(filters.bracket === '2v2' ? _.range(0, 2) : _.range(0, 3)).map((s) => (
                <SpecSelector
                  key={s}
                  spec={filters.team1SpecIds[s]}
                  addCallback={addToOne}
                  removeCallback={remFromOne}
                />
              ))}
            </div>
            <div className="divider divider-horizontal">VS</div>
            <div className="flex flex-row items-center space-x-2">
              {(filters.bracket === '2v2' ? _.range(0, 2) : _.range(0, 3)).map((s) => (
                <SpecSelector
                  key={s}
                  spec={filters.team2SpecIds[s]}
                  addCallback={addToTwo}
                  removeCallback={remFromTwo}
                />
              ))}
            </div>
            <div className="form-control w-[120px] ml-2">
              <label className="label cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.winsOnly}
                  onChange={(v) =>
                    setFilters({
                      ...filters,
                      winsOnly: v.target.checked,
                    })
                  }
                  className="checkbox"
                />
                <span className="label-text">Team 1 Wins</span>
              </label>
            </div>
            <div className="flex flex-1" />
            <button className="btn btn-secondary" onClick={() => clearAllFilters()}>
              clear filters
            </button>
          </div>
        </div>
      </div>
      {matchesQuery.loading && (
        <div className="flex flex-row items-center justify-center animate-loader h-[300px]">
          <TbLoader color="gray" size={60} className="animate-spin-slow" />
        </div>
      )}
      <QuerryError query={matchesQuery} />
      {!matchesQuery.loading && (
        <div className="animate-fadein">
          <CombatStubList
            viewerIsOwner
            combats={matchesQuery.data?.latestMatches.combats || []}
            combatUrlFactory={(combatId: string, combatBracket: string) => {
              if (combatBracket === 'Rated Solo Shuffle') {
                return `/match?id=${combatId}`;
              } else {
                return `/match?id=${combatId}&anon=true`;
              }
            }}
          />
          {matchesQuery.data?.latestMatches.combats.length === 0 && <div>No matches to display!</div>}
        </div>
      )}
    </div>
  );
};

export default Page;

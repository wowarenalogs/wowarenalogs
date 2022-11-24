import { useApolloClient } from '@apollo/client';
import { CombatUnitSpec } from '@wowarenalogs/parser';
import { CombatStubList, SpecSelector } from '@wowarenalogs/shared';
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

const bracketOptions = ['2v2', '3v3', 'Rated Solo Shuffle'];
const ratingOptions = [1400, 1800, 2100, 2400];

const Page = () => {
  const [bracket, setBracket] = useState('Rated Solo Shuffle');
  const [minRating, setMinRating] = useState<number | undefined>(undefined);

  const [filters, setFiltersImpl] = useState<IPublicMatchesFilters>({
    minRating: 0,
    winsOnly: false,
    bracket: '3v3',
    team1SpecIds: [],
    team2SpecIds: [],
  });
  const compQueryString = computeCompQueryString(filters.team1SpecIds, filters.team2SpecIds);
  // const compQueryString = computeCompQueryString(filters.team1SpecIds, filters.team2SpecIds);

  const setFilters = (filters: IPublicMatchesFilters) => {
    setFiltersImpl(filters);
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
    },
  });
  const client = useApolloClient();
  console.log({ compQueryString });
  console.log(matchesQuery.error);

  return (
    <div className="transition-all mx-4">
      <div className="hero">
        <div className="hero-content flex flex-col items-center">
          <h1 className="text-5xl font-bold">Match History</h1>
        </div>
      </div>
      <button className="btn" onClick={() => matchesQuery.refetch()}>
        refresh
      </button>
      <button className="btn" onClick={() => clearAllFilters()}>
        clear filters
      </button>
      <div className="flex flex-row">
        {bracketOptions.map((o) => {
          return (
            <div className="form-control" key={o}>
              <label className="label cursor-pointer">
                <input
                  type="radio"
                  name="radio-10"
                  className="radio checked:bg-blue-500"
                  onClick={() => setBracket(o)}
                  defaultChecked={bracket === o}
                />
                <span className="label-text">{o}</span>
              </label>
            </div>
          );
        })}
      </div>
      <div className="flex flex-row">
        <div className="form-control">
          <label className="label cursor-pointer">
            <input
              type="radio"
              name="radio-11"
              className="radio checked:bg-blue-500"
              onClick={() => setMinRating(undefined)}
              defaultChecked={minRating === undefined}
            />
            <span className="label-text">Any</span>
          </label>
        </div>
        {ratingOptions.map((o) => {
          return (
            <div className="form-control" key={o}>
              <label className="label cursor-pointer">
                <input
                  type="radio"
                  name="radio-11"
                  className="radio checked:bg-blue-500"
                  onClick={() => setMinRating(o)}
                  defaultChecked={minRating === o}
                />
                <span className="label-text">{o}</span>
              </label>
            </div>
          );
        })}
      </div>
      <div className="flex flex-row items-center">
        <div className="flex flex-row items-center">
          {(filters.bracket === '2v2' ? _.range(0, 2) : _.range(0, 3)).map((s) => (
            <SpecSelector key={s} spec={filters.team1SpecIds[s]} addCallback={addToOne} removeCallback={remFromOne} />
          ))}
        </div>
        <div className="mx-2">
          <div>VS</div>
        </div>
        <div className="flex flex-row items-center">
          {(filters.bracket === '2v2' ? _.range(0, 2) : _.range(0, 3)).map((s) => (
            <SpecSelector key={s} spec={filters.team2SpecIds[s]} addCallback={addToTwo} removeCallback={remFromTwo} />
          ))}
        </div>
      </div>
      {matchesQuery.loading && (
        <div className="flex flex-row items-center justify-center animate-loader h-[300px]">
          <TbLoader color="gray" size={60} className="animate-spin-slow" />
        </div>
      )}
      {matchesQuery.error && (
        <div className="flex flex-col justify-center items-center h-full transition-all animate-fadein">
          <div>An error has occurred</div>
        </div>
      )}
      {!matchesQuery.loading && (
        <div className="animate-fadein mt-4">
          <CombatStubList
            viewerIsOwner
            combats={matchesQuery.data?.latestMatches.combats || []}
            combatUrlFactory={(combatId: string, logId: string) => {
              return `/match?id=${combatId}&logId=${logId}`;
            }}
          />
          {matchesQuery.data?.latestMatches.combats.length === 0 && <div>No matches to display!</div>}
        </div>
      )}
    </div>
  );
};

export default Page;

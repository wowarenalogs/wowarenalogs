import { CombatUnitSpec } from '@wowarenalogs/parser';
import { BracketSelector, CombatStubList, RatingSelector, SpecSelector } from '@wowarenalogs/shared';
import { QuerryError } from '@wowarenalogs/shared/src/components/common/QueryError';
import { useGetPublicMatchesQuery } from '@wowarenalogs/shared/src/graphql/__generated__/graphql';
import _ from 'lodash';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { TbArrowBigUpLines, TbLoader, TbRocketOff } from 'react-icons/tb';

const PAGE_SIZE = 50;

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
  const router = useRouter();
  const { page } = router.query;
  const pageNum = parseInt(page?.toString() || '0');
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
      offset: PAGE_SIZE * pageNum,
    },
  });

  return (
    <div className="transition-all px-4 mt-4 overflow-y-auto overflow-visible">
      <div className="p-4 rounded bg-base-300">
        <BracketSelector bracket={bracket} setBracket={setBracket} />
        <RatingSelector minRating={minRating} setMinRating={setMinRating} />
        <div>
          <div className="font-semibold text-info-content opacity-50 mt-[5px]">COMPOSITION</div>
          <div className="flex flex-row items-center">
            <div className="flex flex-row items-center space-x-2">
              {(filters.bracket === '2v2' ? _.range(0, 2) : _.range(0, 3)).map((s, idx) => (
                <SpecSelector
                  key={`1-${idx}`}
                  modalKey={`1-${idx}`}
                  spec={filters.team1SpecIds[s]}
                  addCallback={addToOne}
                  removeCallback={remFromOne}
                />
              ))}
            </div>
            <div className="divider divider-horizontal">VS</div>
            <div className="flex flex-row items-center space-x-2">
              {(filters.bracket === '2v2' ? _.range(0, 2) : _.range(0, 3)).map((s, idx) => (
                <SpecSelector
                  key={`2-${idx}`}
                  modalKey={`2-${idx}`}
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
        <div className="animate-fadein mt-2">
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
          {matchesQuery.data?.latestMatches.queryLimitReached && (
            <div className="alert alert-info shadow-lg">
              <div>
                <TbArrowBigUpLines size={24} />
                <span>Upgrade your user tier to see more matches!</span>
              </div>
            </div>
          )}
          {matchesQuery.data?.latestMatches.combats.length === 0 && (
            <div className="alert shadow-lg">
              <div>
                <TbRocketOff size={24} />
                <span>No matches to display!</span>
              </div>
            </div>
          )}
          <div className={`btn-group grid pt-4 pb-10 ${pageNum > 0 ? 'grid-cols-3' : 'grid-cols-1'}`}>
            {pageNum > 0 && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  router.push({
                    pathname: router.pathname,
                    query: {
                      page: 0,
                    },
                  });
                }}
              >
                First
              </button>
            )}
            {pageNum > 0 && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  router.push({
                    pathname: router.pathname,
                    query: {
                      page: pageNum - 1,
                    },
                  });
                }}
              >
                Previous
              </button>
            )}
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                router.push({
                  pathname: router.pathname,
                  query: {
                    page: pageNum + 1,
                  },
                });
              }}
            >
              Next Page
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Page;

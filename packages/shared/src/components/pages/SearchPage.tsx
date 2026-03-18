import { CombatUnitSpec } from '@wowarenalogs/parser';
import base64url from 'base64url';
import _ from 'lodash';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { TbArrowBigUpLines, TbLoader, TbRocketOff } from 'react-icons/tb';

import { useGetPublicMatchesQuery } from '../../graphql/__generated__/graphql';
import { logAnalyticsEvent } from '../../utils/analytics';
import { CombatStubList } from '../CombatStubList';
import { LocalRemoteHybridCombat } from '../CombatStubList/rows';
import { QuerryError } from '../common/QueryError';
import { Bracket, BracketSelector } from '../MatchSearch/BracketSelector';
import { RatingSelector } from '../MatchSearch/RatingSelector';
import { SpecSelector } from '../MatchSearch/SpecSelector';

const PAGE_SIZE = 50;

interface IPublicMatchesFilters {
  minRating: number;
  winsOnly: boolean;
  bracket: Bracket;
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

const DEFAULT_FILTERS: IPublicMatchesFilters = {
  minRating: 0,
  winsOnly: false,
  bracket: 'Rated Solo Shuffle',
  team1SpecIds: [],
  team2SpecIds: [],
};

export const SearchPage = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = searchParams.get('page');
  const search = searchParams.get('search');
  const pageNum = parseInt(page?.toString() || '0');

  const filters = useMemo(() => {
    return search ? (JSON.parse(base64url.decode(search as string)) as IPublicMatchesFilters) : DEFAULT_FILTERS;
  }, [search]);
  const teamSize = filters.bracket === '2v2' ? 2 : 3;

  useEffect(() => {
    logAnalyticsEvent('search', {
      search_term: filters.bracket,
    });
  }, [filters]);

  const compQueryString = computeCompQueryString(filters.team1SpecIds, filters.team2SpecIds);
  const matchesQuery = useGetPublicMatchesQuery({
    variables: {
      wowVersion: 'retail',
      bracket: filters.bracket,
      minRating: filters.minRating,
      compQueryString,
      lhsShouldBeWinner: filters.winsOnly,
      offset: PAGE_SIZE * pageNum,
    },
  });
  const setFilters = (newFilters: IPublicMatchesFilters) => {
    const newSearchParams = base64url.encode(JSON.stringify(newFilters));
    router.push(`${pathname}?page=0&search=${newSearchParams}`);
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
    setFilters(DEFAULT_FILTERS);
  }

  return (
    <div className="mt-2 overflow-visible overflow-y-auto px-2 transition-all sm:mt-4 sm:px-4">
      <title>Find Matches</title>
      <div className="rounded bg-base-300 p-2.5 sm:p-4">
        <div className="space-y-2.5 sm:space-y-4">
          <BracketSelector
            bracket={filters.bracket}
            setBracket={(b) => {
              setFilters({ ...filters, bracket: b });
            }}
          />
          <RatingSelector
            minRating={filters.minRating}
            setMinRating={(r) => {
              setFilters({ ...filters, minRating: r });
            }}
          />
          <div className="space-y-2 sm:space-y-3">
            <div className="font-semibold text-[10px] uppercase tracking-wide text-info-content opacity-50 sm:mt-[5px] sm:text-base">
              COMPOSITION
            </div>
            <div className="flex flex-col gap-2 lg:hidden">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-60">T1</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {_.range(0, teamSize).map((s, idx) => (
                      <SpecSelector
                        key={`1-${idx}`}
                        modalKey={`1-${idx}`}
                        spec={filters.team1SpecIds[s]}
                        addCallback={addToOne}
                        removeCallback={remFromOne}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-7 shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-60">T2</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {_.range(0, teamSize).map((s, idx) => (
                      <SpecSelector
                        key={`2-${idx}`}
                        modalKey={`2-${idx}`}
                        spec={filters.team2SpecIds[s]}
                        addCallback={addToTwo}
                        removeCallback={remFromTwo}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="form-control">
                  <label className="label cursor-pointer justify-start gap-2 px-0 py-0.5">
                    <input
                      type="checkbox"
                      checked={filters.winsOnly}
                      onChange={(v) =>
                        setFilters({
                          ...filters,
                          winsOnly: v.target.checked,
                        })
                      }
                      className="checkbox checkbox-sm"
                    />
                    <span className="label-text whitespace-nowrap text-xs">Team 1 Wins</span>
                  </label>
                </div>
                <button className="btn btn-secondary btn-sm min-h-0 h-8 px-3" onClick={() => clearAllFilters()}>
                  clear filters
                </button>
              </div>
            </div>
            <div className="hidden lg:flex lg:flex-row lg:items-center">
              <div className="flex flex-row items-center space-x-2">
                {_.range(0, teamSize).map((s, idx) => (
                  <SpecSelector
                    key={`desktop-1-${idx}`}
                    modalKey={`desktop-1-${idx}`}
                    spec={filters.team1SpecIds[s]}
                    addCallback={addToOne}
                    removeCallback={remFromOne}
                  />
                ))}
              </div>
              <div className="mx-3 text-xs font-semibold uppercase tracking-[0.2em] opacity-50">VS</div>
              <div className="ml-4 flex flex-row items-center space-x-2">
                {_.range(0, teamSize).map((s, idx) => (
                  <SpecSelector
                    key={`desktop-2-${idx}`}
                    modalKey={`desktop-2-${idx}`}
                    spec={filters.team2SpecIds[s]}
                    addCallback={addToTwo}
                    removeCallback={remFromTwo}
                  />
                ))}
              </div>
              <div className="form-control ml-2 w-[120px]">
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
            viewerIsOwner={false}
            combats={
              (matchesQuery.data?.latestMatches.combats.map((c) => ({
                isLocal: false,
                isShuffle: c.__typename === 'ShuffleRoundStub',
                match: c,
              })) as LocalRemoteHybridCombat[]) || []
            }
            source="search"
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
          <div className={`grid gap-2 pb-10 pt-4 ${pageNum > 0 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'}`}>
            {pageNum > 0 && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  router.push(`${pathname}?page=0&search=${search}`);
                }}
              >
                First
              </button>
            )}
            {pageNum > 0 && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  router.push(`${pathname}?page=${pageNum - 1}&search=${search}`);
                }}
              >
                Previous
              </button>
            )}
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                router.push(`${pathname}?page=${pageNum + 1}&search=${search}`);
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

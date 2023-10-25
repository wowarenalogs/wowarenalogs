import { CombatUnitSpec } from '@wowarenalogs/parser';
import base64url from 'base64url';
import _ from 'lodash';
import { useRouter } from 'next/router';
import { NextSeo } from 'next-seo';
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
  const { page, search } = router.query;
  const pageNum = parseInt(page?.toString() || '0');

  const filters = useMemo(() => {
    return search ? (JSON.parse(base64url.decode(search as string)) as IPublicMatchesFilters) : DEFAULT_FILTERS;
  }, [search]);

  // log analytics events whenever the filters change
  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    // following predefined schema by google analytics convention.
    // see https://developers.google.com/analytics/devguides/collection/ga4/reference/events?client_type=gtag#search
    logAnalyticsEvent('search', {
      search_term: filters.bracket,
    });
  }, [filters, router.isReady]);

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
    router.push(
      {
        pathname: router.pathname,
        query: {
          page: '0',
          search: newSearchParams,
        },
      },
      undefined,
      { shallow: true },
    );
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

  if (!router.isReady) {
    return null;
  }

  return (
    <div className="transition-all px-4 mt-4 overflow-y-auto overflow-visible">
      <NextSeo
        title="Find Matches"
        description="View recent matches played by the community. Filter by bracket, rating, and specs."
      />
      <div className="p-4 rounded bg-base-300">
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
          <div className={`btn-group grid pt-4 pb-10 ${pageNum > 0 ? 'grid-cols-3' : 'grid-cols-1'}`}>
            {pageNum > 0 && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  router.push({
                    pathname: router.pathname,
                    query: {
                      page: 0,
                      search,
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
                      search,
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
                    search,
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

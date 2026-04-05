'use client';

import { CombatStubList, LoadingScreen, useAuth } from '@wowarenalogs/shared';
import { LocalRemoteHybridCombat } from '@wowarenalogs/shared/src/components/CombatStubList/rows';
import { QuerryError } from '@wowarenalogs/shared/src/components/common/QueryError';
import { useGetMyMatchesQuery } from '@wowarenalogs/shared/src/graphql/__generated__/graphql';
import _ from 'lodash';
import { useMemo } from 'react';
import { TbLoader } from 'react-icons/tb';

import { useLocalCombats } from '../../../hooks/LocalCombatsContext';

export default function HistoryPage() {
  const { isLoadingAuthData, isAuthenticated } = useAuth();
  const { localCombats } = useLocalCombats();
  const matchesQuery = useGetMyMatchesQuery({ skip: !isAuthenticated });

  const hybridCombats = useMemo(() => {
    const localEntries = localCombats.flatMap((c) => {
      if (c.dataType === 'ArenaMatch') {
        return [{ isLocal: true as const, isShuffle: false, match: c }];
      }
      // c is IShuffleRound — it is the atomic entry, return it directly
      return [{ isLocal: true as const, isShuffle: true as const, match: c }];
    }) as LocalRemoteHybridCombat[];

    const remoteCombats = matchesQuery.data?.myMatches?.combats || [];
    const remoteEntries = remoteCombats.map((c) => ({
      isLocal: false as const,
      isShuffle: c.__typename === 'ShuffleRoundStub',
      match: c,
    })) as LocalRemoteHybridCombat[];

    return _.orderBy([...localEntries, ...remoteEntries], (c) => c.match.startTime, ['desc']);
  }, [localCombats, matchesQuery.data]);

  if (isLoadingAuthData) {
    return <LoadingScreen />;
  }

  return (
    <div className="transition-all px-2 overflow-y-auto">
      <div className="animate-fadein mt-2">
        <div className="text-xs opacity-40 mb-1">
          local: {localCombats.length} | displayed: {hybridCombats.length}
        </div>
        <CombatStubList viewerIsOwner={true} combats={hybridCombats} source="history" />
      </div>
      {matchesQuery.loading && (
        <div className="flex flex-row items-center justify-center animate-loader h-[300px]">
          <TbLoader color="gray" size={60} className="animate-spin-slow" />
        </div>
      )}
      {isAuthenticated && <QuerryError query={matchesQuery} />}
    </div>
  );
}

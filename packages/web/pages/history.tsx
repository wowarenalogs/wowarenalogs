import { CombatStubList, LoadingScreen, useAuth } from '@wowarenalogs/shared';
import { LocalRemoteHybridCombat } from '@wowarenalogs/shared/src/components/CombatStubList/rows';
import { QuerryError } from '@wowarenalogs/shared/src/components/common/QueryError';
import { SignInPromotion } from '@wowarenalogs/shared/src/components/common/SignInPromotion';
import { useGetMyMatchesQuery } from '@wowarenalogs/shared/src/graphql/__generated__/graphql';
import _ from 'lodash';
import { useMemo } from 'react';
import { TbLoader } from 'react-icons/tb';

const Page = () => {
  const { isLoadingAuthData, isAuthenticated } = useAuth();
  const matchesQuery = useGetMyMatchesQuery();

  const hybridCombats = useMemo(() => {
    if (isLoadingAuthData) {
      return [];
    }

    const remoteCombats = matchesQuery.data?.myMatches?.combats || [];
    return _.orderBy(
      remoteCombats.map((c) => ({
        isLocal: false,
        isShuffle: c.__typename === 'ShuffleRoundStub',
        match: c,
      })) as LocalRemoteHybridCombat[],
      (c) => c.match.startTime,
      ['desc'],
    );
  }, [matchesQuery.data, isLoadingAuthData]);

  if (isLoadingAuthData) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <SignInPromotion />;
  }

  return (
    <div className="transition-all px-2 overflow-y-auto">
      <div className="animate-fadein mt-2">
        <CombatStubList viewerIsOwner={true} combats={hybridCombats} source="history" />
      </div>
      {matchesQuery.loading && (
        <div className="flex flex-row items-center justify-center animate-loader h-[300px]">
          <TbLoader color="gray" size={60} className="animate-spin-slow" />
        </div>
      )}
      <QuerryError query={matchesQuery} />
    </div>
  );
};

export default Page;

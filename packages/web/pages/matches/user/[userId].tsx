import { CombatStubList } from '@wowarenalogs/shared';
import { LocalRemoteHybridCombat } from '@wowarenalogs/shared/src/components/CombatStubList/rows';
import { LoadingPage } from '@wowarenalogs/shared/src/components/common/LoadingPage';
import { QuerryError } from '@wowarenalogs/shared/src/components/common/QueryError';
import { useGetUserMatchesLazyQuery } from '@wowarenalogs/shared/src/graphql/__generated__/graphql';
import _ from 'lodash';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { TbLoader, TbRocketOff } from 'react-icons/tb';

const Page = () => {
  const router = useRouter();
  const { userId } = router.query;

  const [exec, matchesQuery] = useGetUserMatchesLazyQuery({
    variables: {
      userId: '123',
    },
  });

  useEffect(() => {
    if (userId && typeof userId === 'string') {
      exec({
        variables: {
          userId,
        },
      });
    }
  }, [userId, exec]);

  const isLoading = matchesQuery.loading || !router.isReady;

  if (isLoading) {
    return <LoadingPage />;
  }

  const remoteCombats = (matchesQuery.data?.userMatches.combats || []).map((c) => ({
    isLocal: false,
    isShuffle: c.__typename === 'ShuffleRoundStub',
    match: c,
  })) as LocalRemoteHybridCombat[];

  return (
    <div className="transition-all p-2 overflow-y-auto">
      <h2 className="text-2xl font-bold">
        <span>Match history for {userId}</span>
      </h2>
      <div className="animate-fadein mt-2">
        <CombatStubList viewerIsOwner={true} combats={remoteCombats} source="history" />
      </div>
      {matchesQuery.loading && (
        <div className="flex flex-row items-center justify-center animate-loader h-[300px]">
          <TbLoader color="gray" size={60} className="animate-spin-slow" />
        </div>
      )}
      {matchesQuery.data?.userMatches.combats.length === 0 && (
        <div className="alert shadow-lg">
          <div>
            <TbRocketOff size={24} />
            <span>No matches to display!</span>
          </div>
        </div>
      )}
      <QuerryError query={matchesQuery} />
    </div>
  );
};

export default Page;

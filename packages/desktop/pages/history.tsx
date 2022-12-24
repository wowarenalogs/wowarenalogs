import { CombatStubList } from '@wowarenalogs/shared';
import { LocalRemoteHybridCombat } from '@wowarenalogs/shared/src/components/CombatStubList/rows';
import { QuerryError } from '@wowarenalogs/shared/src/components/common/QueryError';
import { useGetMyMatchesQuery } from '@wowarenalogs/shared/src/graphql/__generated__/graphql';
import _ from 'lodash';
import { useMemo } from 'react';
import { TbLoader } from 'react-icons/tb';

import { useLocalCombats } from '../hooks/LocalCombatsContext';

const Page = () => {
  const { localCombats } = useLocalCombats();
  const matchesQuery = useGetMyMatchesQuery();

  const hybridCombats = useMemo(() => {
    const remoteCombats = matchesQuery.data?.myMatches?.combats || [];
    const remoteCombatIds = new Set(remoteCombats.map((c) => c.id));

    return _.orderBy(
      (
        remoteCombats.map((c) => ({
          isLocal: false,
          isShuffle: c.__typename === 'ShuffleRoundStub',
          match: c,
        })) as LocalRemoteHybridCombat[]
      ).concat(
        localCombats
          // prefer remote match stub data because solo shuffle match result is not available locally
          .filter((c) => !remoteCombatIds.has(c.id))
          .map((c) => ({
            isLocal: true,
            isShuffle: c.dataType === 'ShuffleRound',
            match: c,
          })) as LocalRemoteHybridCombat[],
      ),
      (c) => c.match.startTime,
      ['desc'],
    );
  }, [localCombats, matchesQuery.data]);

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

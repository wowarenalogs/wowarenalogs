import { CombatStubList } from '@wowarenalogs/shared';
import { QuerryError } from '@wowarenalogs/shared/src/components/common/QueryError';
import { useGetMyMatchesQuery } from '@wowarenalogs/shared/src/graphql/__generated__/graphql';
import _ from 'lodash';
import { TbLoader } from 'react-icons/tb';

const Page = () => {
  const matchesQuery = useGetMyMatchesQuery();
  return (
    <div className="transition-all px-2 overflow-y-auto">
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
            combats={matchesQuery.data?.myMatches.combats || []}
            combatUrlFactory={(combatId: string, logId: string) => {
              return `/match?id=${combatId}&logId=${logId}`;
            }}
          />
        </div>
      )}
    </div>
  );
};

export default Page;

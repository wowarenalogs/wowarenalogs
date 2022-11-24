import { useApolloClient } from '@apollo/client';
import { CombatStubList } from '@wowarenalogs/shared';
import { useGetMyMatchesQuery } from '@wowarenalogs/shared/src/graphql/__generated__/graphql';
import _ from 'lodash';
import { TbLoader } from 'react-icons/tb';

const Page = () => {
  const matchesQuery = useGetMyMatchesQuery();
  const client = useApolloClient();
  console.log({ client });
  return (
    <div className="transition-all mx-4 overflow-y-auto">
      <div className="hero">
        <div className="hero-content flex flex-col items-center">
          <h1 className="text-5xl font-bold">Match History</h1>
        </div>
      </div>
      {matchesQuery.loading && (
        <div className="flex flex-row items-center justify-center animate-loader h-[300px]">
          <TbLoader color="gray" size={60} className="animate-spin-slow" />
        </div>
      )}
      {matchesQuery.error && (
        <div className="flex flex-row justify-center items-center h-full transition-all animate-fadein">
          <div>An error has occurred</div>
        </div>
      )}
      {!matchesQuery.loading && (
        <div className="animate-fadein mt-4">
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

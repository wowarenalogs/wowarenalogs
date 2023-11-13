import { LoadingScreen, useAuth } from '@wowarenalogs/shared';
import _ from 'lodash';
import Link from 'next/link';

import { useLocalCombats } from '../../hooks/LocalCombatsContext';

const Page = () => {
  const { isLoadingAuthData } = useAuth();
  const { localBattlegroundCombats } = useLocalCombats();

  if (isLoadingAuthData) {
    return <LoadingScreen />;
  }

  return (
    <div className="transition-all px-2 overflow-y-auto">
      {localBattlegroundCombats.length === 0 && (
        <div className="flex flex-row items-center justify-center h-[300px]">
          No battlegrounds recorded this session!
        </div>
      )}
      <div>Recent Battlegrounds</div>
      <div className="flex flex-col gap-1">
        {localBattlegroundCombats.map((p) => (
          <Link key={p.id} href={`/battlegrounds/${p.id}`}>
            <div>
              {new Date(p.startTime).toLocaleString()} {p.zoneInEvent.zoneName}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Page;

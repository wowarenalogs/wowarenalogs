import { MatchList } from '@wowarenalogs/shared';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

import { useLocalCombatsContext } from '../../hooks/LocalCombatLogsContext';

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
    },
  };
}
export default function RecentMatches() {
  const localCombatsContext = useLocalCombatsContext();

  const recentMatches = [];
  if (process.env.NODE_ENV === 'development') {
    for (
      let i = localCombatsContext.localCombats.length - 1;
      i >= Math.max(localCombatsContext.localCombats.length - 50, 0);
      --i
    ) {
      recentMatches.push(localCombatsContext.localCombats[i]);
    }
  } else if (localCombatsContext.localCombats.length > 0) {
    let lastMatchEndTime = localCombatsContext.localCombats[localCombatsContext.localCombats.length - 1].endTime;
    for (let i = localCombatsContext.localCombats.length - 1; i >= 0; --i) {
      if (lastMatchEndTime - localCombatsContext.localCombats[i].endTime <= 6 * 60 * 60 * 1000) {
        recentMatches.push(localCombatsContext.localCombats[i]);
        lastMatchEndTime = localCombatsContext.localCombats[i].endTime;
      } else {
        break;
      }
    }
  }

  return (
    <MatchList
      header="Recent Matches"
      combats={recentMatches}
      combatUrlFactory={(id) => {
        return `/matches/local/${id}`;
      }}
    />
  );
}

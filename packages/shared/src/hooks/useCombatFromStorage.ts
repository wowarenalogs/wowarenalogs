import { WowVersion } from '@wowarenalogs/parser';
import { useQuery } from 'react-query';

import { useGetMatchByIdQuery } from '../graphql/__generated__/graphql';
import { Utils } from '../utils/utils';

export function useCombatFromStorage(matchId: string) {
  const queryCombat = useGetMatchByIdQuery({
    variables: {
      matchId,
    },
  });

  const queryParsedLog = useQuery(
    ['log-file', matchId],
    async () => {
      const logObjectUrl = queryCombat.data?.matchById.logObjectUrl;
      const wowVersion = queryCombat.data?.matchById.wowVersion as WowVersion;
      if (!logObjectUrl) {
        throw new Error('No log object url for query ' + matchId, {});
      }
      if (!wowVersion) {
        throw new Error('No wow version for query ' + matchId);
      }
      const result = await fetch(logObjectUrl);
      const text = await result.text();
      const results = Utils.parseFromStringArray(
        text.split('\n'),
        wowVersion,
        queryCombat.data?.matchById.timezone ?? undefined,
      );
      return results.arenaMatches.at(0) || results.shuffleMatches[0]?.rounds?.find((i) => i.id === matchId);
    },
    {
      cacheTime: 60 * 60 * 24 * 1000,
      staleTime: Infinity,
      enabled: matchId != '' && !queryCombat.loading && Boolean(queryCombat.data?.matchById.logObjectUrl),
    },
  );

  const loading = queryCombat.loading || queryParsedLog.isLoading;

  return {
    combat: queryParsedLog.data,
    loading,
    error: queryParsedLog.error || queryCombat.error,
  };
}

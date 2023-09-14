import { WowVersion } from '@wowarenalogs/parser';
import { useQuery } from 'react-query';

import { Utils } from '../utils/utils';

const LOG_WOW_VERSION_HEADER = 'X-Goog-Meta-Wow-Version';
const LOG_CLIENT_TIMEZONE_HEADER = 'X-Goog-Meta-Client-Timezone';

const combatRootURL =
  process.env.NODE_ENV === 'development'
    ? 'https://storage.googleapis.com/wowarenalogs-public-dev-log-files-prod/'
    : 'https://storage.googleapis.com/wowarenalogs-log-files-prod/';

export function useCombatFromStorage(matchId: string) {
  const queryParsedLog = useQuery(
    ['log-file', matchId],
    async () => {
      const logObjectUrl = `${combatRootURL}${matchId}`;
      const result = await fetch(logObjectUrl);

      const wowVersion = (result.headers.get(LOG_WOW_VERSION_HEADER) as WowVersion) ?? 'retail';
      const timezone = result.headers.get(LOG_CLIENT_TIMEZONE_HEADER);

      const text = await result.text();
      const results = Utils.parseFromStringArray(text.split('\n'), wowVersion, timezone ?? undefined);
      return results.arenaMatches.at(0) || results.shuffleMatches[0]?.rounds?.find((i) => i.id === matchId);
    },
    {
      cacheTime: 60 * 60 * 24 * 1000,
      staleTime: Infinity,
      enabled: matchId != '',
    },
  );

  return {
    combat: queryParsedLog.data,
    loading: queryParsedLog.isLoading,
    error: queryParsedLog.error,
  };
}

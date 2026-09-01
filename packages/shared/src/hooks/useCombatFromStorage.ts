import { WowVersion } from '@wowarenalogs/parser';
import { useMemo } from 'react';
import { useQuery } from 'react-query';

import { Utils } from '../utils/utils';

const LOG_WOW_VERSION_HEADER = 'X-Goog-Meta-Wow-Version';
const LOG_CLIENT_TIMEZONE_HEADER = 'X-Goog-Meta-Client-Timezone';

const combatRootURL =
  process.env.NODE_ENV === 'development'
    ? 'https://storage.googleapis.com/wowarenalogs-public-dev-log-files-prod/'
    : 'https://storage.googleapis.com/wowarenalogs-log-files-prod/';

export function useCombatFromStorage(matchId: string, roundId?: string) {
  const queryParsedLog = useQuery(
    ['log-file', matchId],
    async () => {
      const logObjectUrl = `${combatRootURL}${matchId}`;
      const result = await fetch(logObjectUrl);

      const wowVersion = (result.headers.get(LOG_WOW_VERSION_HEADER) as WowVersion) ?? 'retail';
      const timezone = result.headers.get(LOG_CLIENT_TIMEZONE_HEADER);

      const text = await result.text();
      const results = Utils.parseFromStringArray(text.split('\n'), wowVersion, timezone ?? undefined);

      return {
        matchId,
        arenaMatch: results.arenaMatches.at(0),
        shuffleRounds: results.shuffleMatches.at(0)?.rounds ?? [],
      };
    },
    {
      cacheTime: 60 * 60 * 24 * 1000,
      staleTime: Infinity,
      enabled: matchId != '',
    },
  );

  const arenaMatch = queryParsedLog.data?.arenaMatch;
  const shuffleRounds = useMemo(() => queryParsedLog.data?.shuffleRounds ?? [], [queryParsedLog.data]);

  const combat = useMemo(() => {
    if (arenaMatch) {
      return arenaMatch;
    }
    return (roundId ? shuffleRounds[parseInt(roundId) - 1] : undefined) ?? shuffleRounds.at(-1);
  }, [arenaMatch, shuffleRounds, roundId]);

  return {
    matchId,
    roundId: combat?.dataType === 'ShuffleRound' ? (combat.sequenceNumber + 1).toString() : undefined,
    combat,
    shuffleRounds,
    loading: queryParsedLog.isLoading,
    error: queryParsedLog.error,
  };
}

import { useApolloClient } from '@apollo/client';
import { WowVersion } from '@wowarenalogs/parser';
import { useMemo } from 'react';
import { useQuery } from 'react-query';

import {
  GetLogDownloadUrlDocument,
  GetLogDownloadUrlQuery,
  GetLogDownloadUrlQueryVariables,
} from '../graphql/__generated__/graphql';
import { Utils } from '../utils/utils';
import { useAuth } from './AuthContext';

const LOG_WOW_VERSION_HEADER = 'X-Goog-Meta-Wow-Version';
const LOG_CLIENT_TIMEZONE_HEADER = 'X-Goog-Meta-Client-Timezone';

export function useCombatFromStorage(matchId: string, roundId?: string) {
  const apollo = useApolloClient();
  const auth = useAuth();

  const queryParsedLog = useQuery(
    ['log-file', matchId],
    async () => {
      // The log bucket is private. The API hands out a short-lived signed URL
      // to signed-in users only, charged against a daily quota of distinct
      // logs — that call, not the fetch, is what limits mass scraping.
      const grant = await apollo.query<GetLogDownloadUrlQuery, GetLogDownloadUrlQueryVariables>({
        query: GetLogDownloadUrlDocument,
        variables: { matchId },
        fetchPolicy: 'no-cache',
      });
      const result = await fetch(grant.data.logDownloadUrl.url);
      if (!result.ok) {
        throw new Error(`Could not load the combat log (HTTP ${result.status}).`);
      }

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
      enabled: matchId != '' && auth.isAuthenticated,
      // A refused grant (quota, sign-in, blocked) will not succeed on retry.
      retry: false,
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

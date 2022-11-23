import { AtomicArenaCombat, WowVersion } from '@wowarenalogs/parser';
import { useEffect, useState } from 'react';

import { Utils } from '../utils/utils';

export function useCombatFromStorage(
  url: string,
  matchId: string,
): {
  data: AtomicArenaCombat | undefined;
  loading: boolean;
  error: Error | undefined;
} {
  const [data, setData] = useState<AtomicArenaCombat>();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  useEffect(() => {
    const abortController = new AbortController();
    const fetchData = async () => {
      setError(undefined);
      setLoading(true);
      try {
        const result = await fetch(url, abortController);
        const text = await result.text();
        const results = await Utils.parseFromStringArrayAsync(
          text.split('\n'),
          (result.headers.get('x-goog-meta-wow-version') || 'shadowlands') as WowVersion,
        );
        const foundCombat =
          results.arenaMatches.find((i) => i.id === matchId) ||
          results.shuffleMatches[0].rounds.find((i) => i.id === matchId);
        setData(foundCombat);
      } catch (exception) {
        setError(exception as Error);
      }
      setLoading(false);
    };
    if (url) {
      fetchData();
    }
    return () => abortController.abort();
  }, [url, matchId]);

  return { data: data, loading, error };
}

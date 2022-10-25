import { useEffect, useState } from 'react';
import { ICombatData, WowVersion } from 'wow-combat-log-parser';

import { Utils } from '../utils';

export function useCombatFromStorage(url: string): {
  data: ICombatData | undefined;
  loading: boolean;
  error: Error | undefined;
} {
  const [data, setData] = useState<ICombatData>();
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
        const com = await Utils.parseFromStringArrayAsync(
          text.split('\n'),
          (result.headers.get('x-goog-meta-wow-version') || 'retail') as WowVersion,
        );
        setData(com[0]);
      } catch (error) {
        setError(error as Error);
      }
      setLoading(false);
    };
    if (url) {
      fetchData();
    }
    return () => abortController.abort();
  }, [url]);

  return { data: data, loading, error };
}

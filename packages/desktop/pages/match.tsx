import { AtomicArenaCombat } from '@wowarenalogs/parser';
import { CombatReport, CombatReportFromStorage } from '@wowarenalogs/shared';
import { useRouter } from 'next/router';
import { useMemo } from 'react';

import { useLocalCombats } from '../hooks/LocalCombatsContext';

const Page = () => {
  const router = useRouter();
  const { localCombats } = useLocalCombats();

  const localCombatsLookup = useMemo(() => {
    const lookup = new Map<string, AtomicArenaCombat>();
    localCombats.forEach((c) => {
      lookup.set(c.id, c);
    });
    return lookup;
  }, [localCombats]);

  const { id, anon } = router.query;
  if (!id || typeof id !== 'string') {
    return null;
  }

  const localCombat = localCombatsLookup.get(id);
  if (localCombat) {
    return <CombatReport anon={false} combat={localCombat} />;
  }

  return <CombatReportFromStorage id={id} anon={anon === 'true'} />;
};

export default Page;

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
      lookup.set(`${c.id}+${c.dataType == 'ShuffleRound' ? c.sequenceNumber : ''}`, c);
    });
    return lookup;
  }, [localCombats]);

  const { id, viewerIsOwner, roundId } = router.query;
  if (!id || typeof id !== 'string') {
    return null;
  }

  const localCombat = localCombatsLookup.get(`${id}+${roundId ? roundId : ''}`);
  if (localCombat) {
    return <CombatReport viewerIsOwner={true} combat={localCombat} matchId={localCombat.id} />;
  }

  return (
    <CombatReportFromStorage
      id={id}
      viewerIsOwner={viewerIsOwner === 'true'}
      roundId={roundId ? roundId.toString() : undefined}
    />
  );
};

export default Page;

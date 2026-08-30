'use client';

import { CombatReport, CombatReportFromStorage } from '@wowarenalogs/shared';
import { useSearchParams } from 'next/navigation';

import { useLocalCombats } from '../../../hooks/LocalCombatsContext';

export default function MatchPage() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const viewerIsOwner = searchParams.get('viewerIsOwner');
  const roundId = searchParams.get('roundId');
  const { localCombats } = useLocalCombats();

  if (!id || typeof id !== 'string') {
    return null;
  }

  const localMatch = localCombats.find((c) => c.id === id);
  if (localMatch) {
    return (
      <>
        <title>Combat Report | WoW Arena Logs</title>
        <CombatReport combat={localMatch} matchId={id} viewerIsOwner={viewerIsOwner === 'true'} />
      </>
    );
  }

  return (
    <>
      <title>Combat Report | WoW Arena Logs</title>
      <CombatReportFromStorage
        id={id}
        roundId={roundId ? roundId.toString() : undefined}
        viewerIsOwner={viewerIsOwner === 'true'}
      />
    </>
  );
}

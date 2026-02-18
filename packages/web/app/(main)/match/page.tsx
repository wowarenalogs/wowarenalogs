'use client';

import { CombatReportFromStorage } from '@wowarenalogs/shared';
import { useSearchParams } from 'next/navigation';

export default function MatchPage() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const viewerIsOwner = searchParams.get('viewerIsOwner');
  const roundId = searchParams.get('roundId');

  if (!id || typeof id !== 'string') {
    return null;
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

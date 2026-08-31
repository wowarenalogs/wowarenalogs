import { IShuffleRound } from '@wowarenalogs/parser';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

import { useCombatFromStorage } from '../../hooks/useCombatFromStorage';
import { CombatReport } from '../CombatReport';
import { ErrorPage } from './ErrorPage';
import { LoadingPage } from './LoadingPage';

interface IProps {
  viewerIsOwner?: boolean;
  id: string;
  roundId?: string;
}

export function CombatReportFromStorage(props: IProps) {
  const { id, roundId } = props;
  const defaultErrorMessage = 'There was a problem loading the page, please refresh!';
  const combatQuery = useCombatFromStorage(id?.toString() || '', roundId);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Round selection lives in the url so the report stays shareable and the browser's back
  // button still returns to wherever the viewer came from (hence replace, not push).
  const onRoundSelected = useCallback(
    (round: IShuffleRound) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('roundId', (round.sequenceNumber + 1).toString());
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  if (combatQuery.loading) {
    return <LoadingPage />;
  }
  if (combatQuery.combat) {
    return (
      <CombatReport
        viewerIsOwner={props.viewerIsOwner}
        combat={combatQuery.combat}
        matchId={combatQuery.matchId}
        roundId={combatQuery.roundId}
        shuffleRounds={combatQuery.shuffleRounds}
        onRoundSelected={onRoundSelected}
      />
    );
  } else {
    return <ErrorPage message={JSON.stringify(combatQuery.error) || defaultErrorMessage} />;
  }
}

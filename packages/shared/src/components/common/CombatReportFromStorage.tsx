import { IShuffleRound } from '@wowarenalogs/parser';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

import { useAuth } from '../../hooks/AuthContext';
import { useCombatFromStorage } from '../../hooks/useCombatFromStorage';
import { CombatReport } from '../CombatReport';
import { ErrorPage } from './ErrorPage';
import { LoadingPage } from './LoadingPage';
import { SignInRequired } from './SignInRequired';

interface IProps {
  viewerIsOwner?: boolean;
  id: string;
  roundId?: string;
}

export function CombatReportFromStorage(props: IProps) {
  const { id, roundId } = props;
  const defaultErrorMessage = 'There was a problem loading the page, please refresh!';
  const auth = useAuth();
  const combatQuery = useCombatFromStorage(id?.toString() || '', roundId);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const onRoundSelected = useCallback(
    (round: IShuffleRound) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('roundId', (round.sequenceNumber + 1).toString());
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  if (auth.isLoadingAuthData || combatQuery.loading) {
    return <LoadingPage />;
  }
  // Raw logs are only served to signed-in users; see accessGuard.ts.
  if (!auth.isAuthenticated) {
    return (
      <div className="p-4">
        <SignInRequired message="Sign in with Battle.net to view this match." />
      </div>
    );
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
    // A refused grant (daily log limit, blocked account) carries a message worth showing verbatim.
    const message = combatQuery.error instanceof Error ? combatQuery.error.message : defaultErrorMessage;
    return <ErrorPage message={message || defaultErrorMessage} />;
  }
}

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
      />
    );
  } else {
    return <ErrorPage message={JSON.stringify(combatQuery.error) || defaultErrorMessage} />;
  }
}

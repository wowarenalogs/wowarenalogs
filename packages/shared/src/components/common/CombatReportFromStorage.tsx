import { useCombatFromStorage } from '../../hooks/useCombatFromStorage';
import { CombatReport } from '../CombatReport';
import { ErrorPage } from './ErrorPage';
import { LoadingPage } from './LoadingPage';

interface IProps {
  viewerIsOwner?: boolean;
  id: string;
}

export function CombatReportFromStorage(props: IProps) {
  const id = props.id;
  const defaultErrorMessage = 'There was a problem loading the page, please refresh!';
  const combatQuery = useCombatFromStorage(id?.toString() || '');

  if (combatQuery.loading) {
    return <LoadingPage />;
  }
  if (combatQuery.combat) {
    return <CombatReport viewerIsOwner={props.viewerIsOwner} combat={combatQuery.combat} />;
  } else {
    return <ErrorPage message={JSON.stringify(combatQuery.error) || defaultErrorMessage} />;
  }
}

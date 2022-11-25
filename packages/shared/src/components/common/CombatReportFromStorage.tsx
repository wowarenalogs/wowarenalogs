import { useCombatFromStorage } from '../../hooks/useCombatFromStorage';
import { CombatReport } from '../CombatReport';
import { ErrorPage } from './ErrorPage';
import { LoadingPage } from './LoadingPage';

interface IProps {
  stage: string;
  anon?: boolean;
  id: string;
}

export function CombatReportFromStorage(props: IProps) {
  const id = props.id;
  const anon = props.anon;
  const defaultErrorMessage = 'There was a problem loading the page, please refresh!';
  const combatQuery = useCombatFromStorage(id?.toString() || '', anon);

  if (combatQuery.loading) {
    return <LoadingPage />;
  }
  if (combatQuery.combat) {
    return (
      <CombatReport
        anon={props.anon}
        combat={combatQuery.combat}
        // TODO: repair args
        // id={id as string}
        // search={(search && search.length && search[0]) as string}
      />
    );
  } else {
    return <ErrorPage message={JSON.stringify(combatQuery.error) || defaultErrorMessage} />;
  }
}

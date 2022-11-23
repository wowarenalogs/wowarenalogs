import { useRouter } from 'next/router';
import { TbLoader } from 'react-icons/tb';

import { useCombatFromStorage } from '../../hooks/useCombatFromStorage';
import { CombatReport } from '../CombatReport';

interface IProps {
  stage: string;
  anon?: boolean;
}

export function CombatReportFromStorage(props: IProps) {
  const { id, logId, search } = useRouter().query;
  const defaultErrorMessage = 'There was a problem loading the page, please refresh!';
  const { error, data, loading } = useCombatFromStorage(
    props.anon
      ? `https://storage.googleapis.com/wowarenalogs-public-dev-anon-log-files-${props.stage}/${logId}`
      : `https://storage.googleapis.com/wowarenalogs-public-dev-log-files-${props.stage}/${logId}`,
    id?.toString() || 'none',
  );

  if (loading) {
    return (
      <div>
        <div className="flex flex-row items-center justify-center animate-loader h-[300px]">
          <TbLoader color="gray" size={60} className="animate-spin-slow" />
        </div>
      </div>
    );
  }
  if (data) {
    return (
      <CombatReport
        anon={props.anon}
        combat={data}
        // TODO: repair args
        // id={id as string}
        // search={(search && search.length && search[0]) as string}
      />
    );
  } else {
    return (
      <div>
        <div>Error: {error?.message || defaultErrorMessage}</div>
      </div>
    );
  }
}

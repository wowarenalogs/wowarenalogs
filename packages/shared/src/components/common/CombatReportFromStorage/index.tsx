import Text from 'antd/lib/typography/Text';
import { useRouter } from 'next/router';

import { useCombatFromStorage } from '../../../hooks/useCombatFromStorage';
import { CombatReport } from '../../combat-reporting/CombatReport';
import { Box } from '../Box';
import { LoadingScreen } from '../LoadingScreen';

interface IProps {
  stage: string;
  anon?: boolean;
}

export function CombatReportFromStorage(props: IProps) {
  const { id, search } = useRouter().query;
  const defaultErrorMessage = 'There was a problem loading the page, please refresh!';
  const { error, data, loading } = useCombatFromStorage(
    props.anon
      ? `https://storage.googleapis.com/wowarenalogs-anon-log-files-${props.stage}/${id}`
      : `https://storage.googleapis.com/wowarenalogs-log-files-${props.stage}/${id}`,
  );

  if (loading) {
    return <LoadingScreen />;
  }
  if (data) {
    return (
      <CombatReport
        anon={props.anon}
        combat={data}
        id={id as string}
        search={(search && search.length && search[0]) as string}
      />
    );
  } else {
    return (
      <Box flex={1} display="flex" flexDirection="column" alignItems="center" justifyContent={'center'}>
        <Text type={'danger'}>Error: {error?.message || defaultErrorMessage}</Text>
      </Box>
    );
  }
}

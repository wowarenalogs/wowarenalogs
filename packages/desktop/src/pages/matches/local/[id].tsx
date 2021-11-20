import { CombatReport } from '@wowarenalogs/shared';
import { GetServerSideProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useRouter } from 'next/router';

import { useLocalCombatsContext } from '../../../hooks/LocalCombatLogsContext';

export const getServerSideProps: GetServerSideProps = async (context) => {
  return {
    props: {
      ...(await serverSideTranslations(context.locale || 'en', ['common'])),
    },
  };
};
export default function LocalMatch() {
  const localCombatsContext = useLocalCombatsContext();
  const router = useRouter();

  const combat = localCombatsContext.localCombats.filter((combat) => combat.id === router.query.id)[0];
  if (!combat) {
    return null;
  }

  return <CombatReport id={combat.id} combat={combat} />;
}

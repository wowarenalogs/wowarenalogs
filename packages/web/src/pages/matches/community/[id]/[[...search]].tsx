import { CombatReportFromStorage, env } from '@wowarenalogs/shared';
import { GetServerSideProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export const getServerSideProps: GetServerSideProps = async (context) => {
  return {
    props: {
      ...(await serverSideTranslations(context.locale || 'en', ['common'])),
    },
  };
};
export default function Match() {
  return <CombatReportFromStorage stage={env.stage === 'production' ? 'prod' : 'dev'} anon />;
}

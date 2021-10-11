import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

import { LatestMatchMonitor } from '../components/LatestMatchMonitor';

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
    },
  };
}
export default LatestMatchMonitor;

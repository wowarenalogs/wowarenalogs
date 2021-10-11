import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

import { SettingsPage } from '../../components/SettingsPage';

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
    },
  };
}
export default SettingsPage;

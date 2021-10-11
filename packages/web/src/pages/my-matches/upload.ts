import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

import { UploadPage } from '../../components/UploadPage';

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
    },
  };
}
export default UploadPage;

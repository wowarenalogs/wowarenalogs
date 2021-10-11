import { UploadOutlined } from '@ant-design/icons';
import { Box } from '@wowarenalogs/shared';
import { Button, Card, Divider, Image, Typography } from 'antd';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common'])),
    },
  };
}

export default function HomePage() {
  const { t } = useTranslation();

  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf('MAC') === 0);
  }, []);

  return (
    <Box
      flex={1}
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      p={4}
      position="relative"
    >
      <Typography.Title level={1}>{t('landing-page-headline')}</Typography.Title>
      <Typography.Paragraph type="secondary">{t('landing-page-subtitle')}</Typography.Paragraph>
      <Divider />
      <Box display="flex" flexDirection="row" alignItems="stretch" mt={4} pb={16}>
        <Box mr={2}>
          <Card
            title={t('landing-page-install-title')}
            style={{ width: 300, height: '100%', display: 'flex', flexDirection: 'column' }}
            bodyStyle={{ flex: 1 }}
            actions={[
              <Button
                key="windows"
                type={isMac ? 'text' : 'link'}
                href="https://storage.googleapis.com/download.wowarenalogs.com/desktop-client/latest-windows.zip"
                target="_blank"
              >
                {t('windows')}
              </Button>,
              <Button
                key="mac"
                type={isMac ? 'link' : 'text'}
                href="https://storage.googleapis.com/download.wowarenalogs.com/desktop-client/latest-mac.zip"
                target="_blank"
              >
                {t('mac')}
              </Button>,
            ]}
          >
            <Box display="flex" flexDirection="row" justifyContent="center" mb={2}>
              <Image src="/logo192.png" preview={false} width={64} height={64} />
            </Box>
            <Typography.Paragraph>{t('landing-page-install-description')}</Typography.Paragraph>
            <ul>
              <li>{t('landing-page-install-benefit-1')}</li>
              <li>{t('landing-page-install-benefit-2')}</li>
              <li>{t('landing-page-install-benefit-3')}</li>
            </ul>
          </Card>
        </Box>
        <Box ml={2}>
          <Card
            title={t('landing-page-upload-title')}
            style={{ width: 300, height: '100%', display: 'flex', flexDirection: 'column' }}
            bodyStyle={{ flex: 1 }}
            actions={[
              <Button key={'upload'} type="text">
                <Link href="/my-matches/upload">{t('upload')}</Link>
              </Button>,
            ]}
          >
            <Box display="flex" flexDirection="row" justifyContent="center" mb={2}>
              <UploadOutlined style={{ width: 64, height: 64, fontSize: 64 }} />
            </Box>
            <Typography.Paragraph>{t('landing-page-upload-description')}</Typography.Paragraph>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}

import { Box, logAnalyticsEvent, useClientContext } from '@wowarenalogs/shared';
import { Button, Checkbox, Divider, Radio } from 'antd';
import Title from 'antd/lib/typography/Title';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { setCookie } from 'nookies';
import { useEffect } from 'react';

export function SettingsPage() {
  const clientContext = useClientContext();
  const router = useRouter();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    logAnalyticsEvent('view_SettingsPage');
  }, []);

  return (
    <Box display="flex" flexDirection="column">
      <Title level={2}>{t('settings')}</Title>
      <Box display="flex" flexDirection="column">
        <Title level={5}>{t('language')}</Title>
        <Box mb={4}>
          <Radio.Group
            defaultValue={i18n.language}
            buttonStyle="solid"
            onChange={(e) => {
              const locale = e.target.value as string;
              router.push('/settings', '/settings', {
                locale: locale,
              });
              setCookie(null, 'NEXT_LOCALE', locale, {
                maxAge: 3650 * 24 * 60 * 60,
                path: '/',
              });
            }}
          >
            <Radio.Button value="en">English</Radio.Button>
            <Radio.Button value="zh-CN">简体中文</Radio.Button>
          </Radio.Group>
        </Box>
        <Title level={5}>{t('settings-page-system-startup')}</Title>
        <Checkbox
          checked={clientContext.launchAtStartup}
          onChange={(e) => {
            const launch = e.target.checked || false;
            clientContext.updateAppConfig((prev) => {
              return {
                ...prev,
                launchAtStartup: launch,
              };
            });

            logAnalyticsEvent('event_SetLaunchAtStartup', { launch });
          }}
        >
          {t('settings-page-launch-app')}
        </Checkbox>
      </Box>
      <Divider />
      <Box display="flex" flexDirection="column" alignItems="flex-start">
        <Title level={5}>{t('settings-page-support-and-feedback')}</Title>
        <Button
          onClick={() => {
            clientContext.openExternalURL('https://discord.gg/NFTPK9tmJK');
          }}
        >
          {t('settings-page-join-discord')}
        </Button>
      </Box>
    </Box>
  );
}

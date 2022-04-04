import { logAnalyticsEvent, Box, IAppConfig, useClientContext } from '@wowarenalogs/shared';
import { Steps, Button, Checkbox, Radio } from 'antd';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';
// import { remote } from 'electron';
import { useTranslation, Trans } from 'next-i18next';
import { useRouter } from 'next/router';
import { setCookie } from 'nookies';
// import { dirname } from 'path';
import { useEffect, useState } from 'react';

import styles from './index.module.css';

import { DesktopUtils } from '../../renderer-utils';

const { Step } = Steps;

interface IProps {
  wowDirectory: string | undefined;
  tosAccepted: boolean;
  updateAppConfig: (updater: (prevAppConfig: IAppConfig) => IAppConfig) => void;
}

function FirstTimeSetup(props: IProps) {
  const clientContext = useClientContext();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [launchAtStartup, setLaunchAtStartup] = useState(true);

  const platform = clientContext.platform;

  useEffect(() => {
    logAnalyticsEvent('view_FirstTimeSetup');
  }, []);

  const selectDirectory = () => {
    // window.showdialog
    // handle
    //props.updateAppConfig((prev) => {
    //   return {
    //     ...prev,
    //     wowDirectory,
    //   };
    // });
  };

  const hasValidWoWDirectory = props.wowDirectory && DesktopUtils.getAllWoWInstallations(props.wowDirectory, platform);

  const activeStep = hasValidWoWDirectory ? 1 : 0;

  return (
    <Box className={styles['first-time-setup']} display="flex" flexDirection="column">
      <Title level={2}>{t('setup-page-title')}</Title>
      <Box mb={4}>
        <Radio.Group
          defaultValue={i18n.language}
          buttonStyle="solid"
          onChange={(e) => {
            const locale = e.target.value as string;
            router.push('/', '/', {
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
      <Steps current={activeStep} direction="vertical">
        <Step
          title={t('setup-page-locate-wow-installation')}
          description={
            activeStep === 0 ? (
              <Button onClick={selectDirectory} type="primary">
                {t('setup-page-locate-wow-installation-select')}
              </Button>
            ) : null
          }
        />
        <Step
          title={t('ready')}
          description={
            activeStep === 1 ? (
              <Box display="flex" flexDirection="column">
                <Checkbox
                  checked={launchAtStartup}
                  onChange={(e) => {
                    const launch = e.target.checked || false;
                    setLaunchAtStartup(launch);
                  }}
                >
                  {t('setup-page-launch-app-when-computer-starts')}
                </Checkbox>
                <Text>
                  <Trans i18nKey="setup-page-confirm-privacy-policy">
                    Please confirm that you agree with our{' '}
                    <Button
                      type="link"
                      onClick={() => {
                        // remote.shell.openExternal('https://wowarenalogs.com/privacy.html');
                      }}
                      style={{
                        padding: 0,
                      }}
                    >
                      privacy policy
                    </Button>{' '}
                    before proceeding.
                  </Trans>
                </Text>
                <Box mt={1}>
                  <Button
                    onClick={() => {
                      props.updateAppConfig((prev) => {
                        return {
                          ...prev,
                          launchAtStartup,
                          tosAccepted: true,
                        };
                      });
                    }}
                    type="primary"
                  >
                    {t('setup-page-agree-and-get-started')}
                  </Button>
                </Box>
              </Box>
            ) : null
          }
        ></Step>
      </Steps>
    </Box>
  );
}

export default FirstTimeSetup;

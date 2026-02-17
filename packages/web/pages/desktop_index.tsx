import { logAnalyticsEvent } from '@wowarenalogs/shared/src';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { useAppConfig } from '../hooks/AppConfigContext';

const Page = () => {
  const router = useRouter();
  const { isLoading, appConfig } = useAppConfig();

  useEffect(() => {
    if (!window.wowarenalogs.app?.getVersion) {
      logAnalyticsEvent('event_AppLaunch', {
        appVersion: 'unknown',
      });
    } else {
      window.wowarenalogs.app?.getVersion().then((version) => {
        logAnalyticsEvent('event_AppLaunch', {
          appVersion: version,
        });
      });
    }
  }, []);

  useEffect(() => {
    if (!isLoading) {
      if (!window.wowarenalogs.app?.getVersion) {
        router.push('/upgrade');
      } else if (appConfig.wowDirectory && appConfig.tosAccepted) {
        router.push('/latest');
      } else {
        router.push('/first_time_setup');
      }
    }
  }, [isLoading, appConfig, router]);

  return <div />;
};

export default Page;

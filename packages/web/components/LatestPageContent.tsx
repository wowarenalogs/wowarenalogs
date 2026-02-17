import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { useAppConfig } from '../hooks/AppConfigContext';
import { LatestMatchMonitor } from './LatestMatchMonitor';

const LatestPageContent = () => {
  const { appConfig, isLoading } = useAppConfig();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !appConfig?.wowDirectory) {
      router.push('/');
    }
  }, [router, appConfig, isLoading]);

  return <LatestMatchMonitor />;
};

export default LatestPageContent;

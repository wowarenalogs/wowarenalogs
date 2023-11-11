import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { LatestMatchMonitor } from '../components/LatestMatchMonitor';
import { useAppConfig } from '../hooks/AppConfigContext';

const Page = () => {
  const { appConfig, isLoading } = useAppConfig();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !appConfig?.wowDirectory) {
      router.push('/');
    }
  }, [router, appConfig, isLoading]);

  return <LatestMatchMonitor />;
};

export default Page;

'use client';

import { logAnalyticsEvent } from '@wowarenalogs/shared/src';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAppConfig } from '../../hooks/AppConfigContext';

export default function Home() {
  const [os, setOs] = useState('windows');
  const router = useRouter();
  const { isLoading, appConfig } = useAppConfig();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (navigator.platform.toUpperCase().indexOf('MAC') === 0) {
      setOs('mac');
    } else if (navigator.platform.toUpperCase().indexOf('LINUX') === 0) {
      setOs('linux');
    }
    setIsDesktop(!!window.wowarenalogs?.app);
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    if (!window.wowarenalogs.app?.getVersion) {
      logAnalyticsEvent('event_AppLaunch', { appVersion: 'unknown' });
    } else {
      window.wowarenalogs.app.getVersion().then((version) => {
        logAnalyticsEvent('event_AppLaunch', { appVersion: version });
      });
    }
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop || isLoading) return;
    if (!window.wowarenalogs.app?.getVersion) {
      router.push('/upgrade');
    } else if (appConfig.wowDirectory && appConfig.tosAccepted) {
      router.push('/latest');
    } else {
      router.push('/first_time_setup');
    }
  }, [isDesktop, isLoading, appConfig, router]);

  if (isDesktop) return <div />;

  return (
    <div className="flex-1 flex flex-col items-center justify-center">
      <div className="hero">
        <div className="hero-content flex-col md:flex-row gap-4">
          <Image alt="WoW Arena Logs" src="/logo512.png" width={256} height={256} />
          <div className="flex flex-col items-start">
            <h1 className="text-5xl font-bold">Learn from every match.</h1>
            <p className="py-6">
              WoW Arena Logs is the best tool available to help you analyze your own arena matches and learn from the
              community.
            </p>
            <div className="flex flex-row gap-x-4">
              <a
                className={`btn ${os === 'windows' ? 'btn-primary' : ''}`}
                href="https://storage.googleapis.com/download.wowarenalogs.com/desktop-client/latest-windows.exe"
                target="_blank"
                rel="noreferrer"
              >
                Download for Windows
              </a>
              <a
                className={`btn ${os === 'mac' ? 'btn-primary' : ''}`}
                href="https://storage.googleapis.com/download.wowarenalogs.com/desktop-client/latest-mac.zip"
                target="_blank"
                rel="noreferrer"
              >
                Download for Mac
              </a>
              <a
                className={`btn ${os === 'linux' ? 'btn-primary' : ''}`}
                href="https://storage.googleapis.com/download.wowarenalogs.com/desktop-client/latest-linux.zip"
                target="_blank"
                rel="noreferrer"
              >
                Download for Linux
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

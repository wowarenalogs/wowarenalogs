'use client';

import { logAnalyticsEvent } from '@wowarenalogs/shared/src';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TbChartBar, TbHistory, TbSearch } from 'react-icons/tb';

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
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 md:px-6">
      <div className="hero">
        <div className="hero-content flex-col gap-6 md:flex-row md:gap-4">
          <Image
            alt="WoW Arena Logs"
            src="/logo512.png"
            width={256}
            height={256}
            className="h-32 w-32 md:h-64 md:w-64"
          />
          <div className="flex max-w-2xl flex-col items-start">
            <h1 className="text-3xl font-bold leading-tight md:text-5xl">Learn from every match.</h1>
            <p className="py-4 text-sm md:py-6 md:text-base">
              WoW Arena Logs is the best tool available to help you analyze your own arena matches and learn from the
              community.
            </p>
            <div className="grid w-full gap-3 md:hidden">
              <Link href="/search" className="btn btn-primary justify-start">
                <TbSearch size={18} />
                Search public matches
              </Link>
              <Link href="/stats" className="btn btn-outline justify-start">
                <TbChartBar size={18} />
                Browse stats
              </Link>
              <Link href="/history" className="btn btn-outline justify-start">
                <TbHistory size={18} />
                View my history
              </Link>
              <div className="rounded-lg border border-base-content/10 bg-base-200/50 p-3 text-sm opacity-80">
                Use the desktop app when you want to upload and analyze your own matches automatically.
              </div>
            </div>
            <div className="hidden flex-row gap-x-4 md:flex">
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

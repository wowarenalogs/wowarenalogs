'use client';

import {
  ClientContextProvider,
  getAnalyticsDeviceId,
  initAnalyticsAsync,
  LoadingScreen,
  logAnalyticsEvent,
  MainLayout,
} from '@wowarenalogs/shared';
import { AuthProvider } from '@wowarenalogs/shared';
import Script from 'next/script';
import { ReactNode, useEffect } from 'react';

import { useAppConfig } from '../../hooks/AppConfigContext';
import { LocalCombatsContextProvider } from '../../hooks/LocalCombatsContext';
import { VideoRecordingContextProvider } from '../../hooks/VideoRecordingContext';
import TitleBar from '../TitleBar';

function getAbsoluteAuthUrl(authUrl: string): string {
  if (!authUrl.startsWith('/')) {
    return authUrl;
  }

  if (window.location.hostname === 'localhost') {
    return `http://localhost:3000${authUrl}`;
  }
  return `${window.location.protocol}//${window.location.hostname}:${window.location.port}${authUrl}`;
}

export const DesktopLayout = !window.wowarenalogs
  ? () => {
      return null;
    }
  : ({ children }: { children: ReactNode }) => {
      const { isLoading, appConfig } = useAppConfig();

      useEffect(() => {
        initAnalyticsAsync('G-Z6E8QS4ENW', '650475e4b06ebfb536489356d27b60f8').then(() => {
          import('@sentry/react').then((Sentry) => {
            Sentry.init({
              dsn: 'https://a076d3d635b64882b87cd3df9b018071@o516205.ingest.sentry.io/5622355',
              tracesSampleRate: 1.0,
              ignoreErrors: ['Non-Error promise rejection captured'],
              release: process.env.NEXT_PUBLIC_COMMIT_SHA,
            });
            const userId = getAnalyticsDeviceId();
            if (userId) {
              Sentry.setUser({
                id: userId,
              });
            }
          });
        });
      }, []);

      useEffect(() => {
        window.wowarenalogs.obs?.videoRecorded?.((_evt, vid) => {
          logAnalyticsEvent('event_VideoRecorded', {
            duration: vid.duration,
            compensationTime: vid.compensationTimeSeconds,
            bracket: vid.metadata?.startInfo?.bracket,
            startTimestamp: vid.metadata?.startInfo?.timestamp,
            team0MMR: vid.metadata?.endInfo?.team0MMR,
            team1MMR: vid.metadata?.endInfo?.team1MMR,
            result: vid.metadata?.result,
          });
        });
        return () => window.wowarenalogs.obs?.removeAll_videoRecorded_listeners?.();
      });

      return (
        <>
          <Script src="https://www.googletagmanager.com/gtag/js?id=G-Z6E8QS4ENW" strategy="afterInteractive" />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', 'G-Z6E8QS4ENW');
        `}
          </Script>
          <ClientContextProvider
            isDesktop={true}
            openExternalURL={(url) => {
              window.wowarenalogs.links?.openExternalURL(url);
            }}
            showLoginModal={(authUrl, callback) => {
              window.wowarenalogs?.bnet
                ?.login(getAbsoluteAuthUrl(authUrl), 'Login')
                .then(() => {
                  callback();
                })
                .catch(() => {
                  // catching this promise rejection is necessary to not crash the app.
                });
            }}
            localFlags={appConfig.flags || []}
          >
            <AuthProvider>
              <VideoRecordingContextProvider>
                <LocalCombatsContextProvider>
                  <div className="w-screen h-screen flex flex-col bg-base-300 overflow-hidden">
                    <TitleBar />
                    <MainLayout>{isLoading ? <LoadingScreen /> : children}</MainLayout>
                  </div>
                </LocalCombatsContextProvider>
              </VideoRecordingContextProvider>
            </AuthProvider>
          </ClientContextProvider>
        </>
      );
    };

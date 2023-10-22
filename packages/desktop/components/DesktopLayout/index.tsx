import {
  ClientContextProvider,
  getAnalyticsDeviceId,
  initAnalyticsAsync,
  LoadingScreen,
  MainLayout,
} from '@wowarenalogs/shared';
import { AuthProvider } from '@wowarenalogs/shared';
import { AppProps } from 'next/app';
import Head from 'next/head';
import Script from 'next/script';
import { useEffect } from 'react';

import { useAppConfig } from '../../hooks/AppConfigContext';
import { LocalCombatsContextProvider } from '../../hooks/LocalCombatsContext';
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
  : ({ Component, pageProps }: AppProps) => {
      const { isLoading } = useAppConfig();

      useEffect(() => {
        initAnalyticsAsync('G-Z6E8QS4ENW').then(() => {
          import('@sentry/react').then((Sentry) => {
            Sentry.init({
              dsn: 'https://a076d3d635b64882b87cd3df9b018071@o516205.ingest.sentry.io/5622355',
              tracesSampleRate: 1.0,
              ignoreErrors: ['Non-Error promise rejection captured'],
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

      return (
        <>
          <Head>
            <meta key="charset" charSet="utf-8" />
            <link key="icon" rel="icon" href="/favicon.ico" />
            <meta key="viewport" name="viewport" content="width=device-width, initial-scale=1" />
            <meta key="theme-color" name="theme-color" content="#000000" />
            <link type="text/css" href="https://wow.zamimg.com/css/basic.css?16" rel="stylesheet" />
            <script key="wowhead0">{'window.whTooltips = { colorLinks: true, iconSize: true };'}</script>
            <script key="wowhead1" async src="https://wow.zamimg.com/widgets/power.js" />
          </Head>
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
              window.wowarenalogs.links.openExternalURL(url);
            }}
            showLoginModal={(authUrl, callback) => {
              window.wowarenalogs.bnet
                .login(getAbsoluteAuthUrl(authUrl), 'Login')
                .then(() => {
                  callback();
                })
                .catch(() => {
                  // catching this promise rejection is necessary to not crash the app.
                  // but there's nothing we need to do here.
                });
            }}
          >
            <AuthProvider>
              <LocalCombatsContextProvider>
                <div className="w-screen h-screen flex flex-col bg-base-300 overflow-hidden">
                  <TitleBar />
                  <MainLayout>{isLoading ? <LoadingScreen /> : <Component {...pageProps} />}</MainLayout>
                </div>
              </LocalCombatsContextProvider>
            </AuthProvider>
          </ClientContextProvider>
        </>
      );
    };

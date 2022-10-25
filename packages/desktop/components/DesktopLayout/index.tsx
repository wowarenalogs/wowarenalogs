import { ClientContextProvider, getAnalyticsDeviceId, initAnalyticsAsync, MainLayout } from '@wowarenalogs/shared';
import { AuthProvider } from '@wowarenalogs/shared';
import { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Script from 'next/script';
import { useEffect } from 'react';

import { useAppConfig } from '../../hooks/AppConfigContext';
import { LocalCombatsContextProvider } from '../../hooks/localCombats';
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
      const router = useRouter();
      const { isLoading, updateAppConfig } = useAppConfig();

      useEffect(() => {
        if (router.isReady)
          initAnalyticsAsync('G-Z6E8QS4ENW').then(() => {
            import('@sentry/react').then((Sentry) => {
              import('@sentry/tracing').then(({ Integrations }) => {
                Sentry.init({
                  dsn: 'https://a076d3d635b64882b87cd3df9b018071@o516205.ingest.sentry.io/5622355',
                  integrations: [new Integrations.BrowserTracing()],
                  tracesSampleRate: 1.0,
                });
                const userId = getAnalyticsDeviceId();
                if (userId) {
                  Sentry.setUser({
                    id: userId,
                  });
                }
              });
            });
          });
      }, [router.isReady]);

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
              window.wowarenalogs.links?.openExternalURL(url);
            }}
            showLoginModal={(authUrl, callback) => {
              window.wowarenalogs.bnet?.login(getAbsoluteAuthUrl(authUrl), 'Login').then(() => {
                callback();
              });
            }}
            saveWindowPosition={async () => {
              const pos = await window.wowarenalogs.win?.getWindowPosition();
              const size = await window.wowarenalogs.win?.getWindowSize();
              if (pos && size) {
                updateAppConfig((prev) => ({
                  ...prev,
                  lastWindowX: pos[0],
                  lastWindowY: pos[1],
                  lastWindowWidth: size[0],
                  lastWindowHeight: size[1],
                }));
              }
            }}
          >
            <AuthProvider>
              <LocalCombatsContextProvider>
                <div className="w-screen h-screen flex flex-col bg-base-300">
                  <TitleBar />
                  <MainLayout>
                    {isLoading && <div>Apploading: {isLoading.toString()}</div>}
                    {!isLoading && <Component {...pageProps} />}
                  </MainLayout>
                </div>
              </LocalCombatsContextProvider>
            </AuthProvider>
          </ClientContextProvider>
        </>
      );
    };
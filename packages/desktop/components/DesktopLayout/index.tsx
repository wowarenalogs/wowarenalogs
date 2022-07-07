import { WowVersion } from '@wowarenalogs/parser';
import { ClientContextProvider, getAnalyticsDeviceId, initAnalyticsAsync } from '@wowarenalogs/shared';
import { IAppConfig } from '@wowarenalogs/shared';
import { AuthProvider } from '@wowarenalogs/shared';
import { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Script from 'next/script';
import { useCallback, useEffect, useState } from 'react';

import { LocalCombatsContextProvider } from '../../hooks/localCombats';
import TitleBar from '../TitleBar';

const APP_CONFIG_STORAGE_KEY = '@wowarenalogs/appConfig';

function getAbsoluteAuthUrl(authUrl: string): string {
  if (!authUrl.startsWith('/')) {
    return authUrl;
  }

  if (window.location.hostname === 'localhost') {
    return `http://localhost:3000${authUrl}`;
  }
  return `${window.location.protocol}//${window.location.hostname}:${window.location.port}${authUrl}`;
}

export const DesktopLayout = ({ Component, pageProps }: AppProps) => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [appConfig, setAppConfig] = useState<IAppConfig>({});

  const [wowInstallations, setWowInstallations] = useState<Map<WowVersion, string>>(new Map());

  useEffect(() => {
    console.log('Check Dir For Installs:', appConfig.wowDirectory);
    window.wowarenalogs.fs?.getAllWoWInstallations(appConfig.wowDirectory || '').then((i) => {
      setWowInstallations(i);
    });
    if (appConfig.wowDirectory) {
      window.wowarenalogs.fs?.installAddon(appConfig.wowDirectory);
    }
  }, [appConfig.wowDirectory]);

  const updateLaunchAtStartup = useCallback((launch: boolean) => {
    window.wowarenalogs.app?.setOpenAtLogin(launch);
  }, []);

  const updateAppConfig = useCallback(
    (updater: (prevAppConfig: IAppConfig) => IAppConfig) => {
      setAppConfig((prev) => {
        const newConfig = updater(prev);
        updateLaunchAtStartup(newConfig.launchAtStartup || false);
        localStorage.setItem(APP_CONFIG_STORAGE_KEY, JSON.stringify(newConfig));
        return newConfig;
      });
    },
    [updateLaunchAtStartup],
  );

  useEffect(() => {
    const appConfigJson = localStorage.getItem(APP_CONFIG_STORAGE_KEY);
    if (appConfigJson) {
      const storedConfig = JSON.parse(appConfigJson) as IAppConfig;

      const newState = {
        wowDirectory: storedConfig.wowDirectory,
        tosAccepted: storedConfig.tosAccepted || false,
        lastWindowX: 0,
        lastWindowY: 0,
        lastWindowWidth: 1024,
        lastWindowHeight: 768,
        launchAtStartup: storedConfig.launchAtStartup || false,
      };
      setAppConfig(newState);

      if (storedConfig.lastWindowX !== undefined && storedConfig.lastWindowY !== undefined) {
        window.wowarenalogs.win?.setWindowPosition(storedConfig.lastWindowX, storedConfig.lastWindowY);
      }
      if (storedConfig.lastWindowHeight !== undefined && storedConfig.lastWindowWidth !== undefined)
        window.wowarenalogs.win?.setWindowSize(storedConfig.lastWindowWidth, storedConfig.lastWindowHeight);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (router.isReady)
      initAnalyticsAsync('650475e4b06ebfb536489356d27b60f8', 'G-Z6E8QS4ENW').then(() => {
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
        launchAtStartup={false}
        wowInstallations={wowInstallations}
        updateAppConfig={updateAppConfig}
        openExternalURL={(url) => {
          window.wowarenalogs.links?.openExternalURL(url);
        }}
        showLoginModalInSeparateWindow={(authUrl, callback) => {
          window.wowarenalogs.bnet?.onLoggedIn(callback);
          window.wowarenalogs.bnet?.login(getAbsoluteAuthUrl(authUrl), 'window title'); // TODO: window title
        }}
        setLaunchAtStartup={(openAtLogin: boolean) => {
          window.wowarenalogs.app?.setOpenAtLogin(openAtLogin);
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
            <div className="mt-8 text-white">
              <TitleBar />
              <div className="ml-1 mr-1">
                {loading && <div>Apploading: {loading.toString()}</div>}
                {!loading && <Component {...pageProps} />}
              </div>
            </div>
          </LocalCombatsContextProvider>
        </AuthProvider>
      </ClientContextProvider>
    </>
  );
};

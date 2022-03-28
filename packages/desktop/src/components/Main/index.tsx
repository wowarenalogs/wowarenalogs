import { ApolloProvider, ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import {
  AuthProvider,
  ClientContextProvider,
  getAnalyticsDeviceId,
  initAnalyticsAsync,
  MainLayout,
  env,
  IAppConfig,
  LoadingScreen,
} from '@wowarenalogs/shared';
// import { ipcRenderer, remote, shell } from 'electron';
import { useTranslation } from 'next-i18next';
import { DefaultSeo } from 'next-seo';
import { AppProps } from 'next/dist/next-server/lib/router/router';
import Head from 'next/head';
import { useCallback, useEffect, useMemo, useState } from 'react';

import 'antd/dist/antd.dark.css';

import FirstTimeSetup from '../../components/FirstTimeSetup';
import TitleBar from '../../components/TitleBar';
import { LocalCombatsContextProvider } from '../../hooks/LocalCombatLogsContext';
import { DesktopUtils } from '../../utils';

function getAbsoluteAuthUrl(authUrl: string): string {
  if (!authUrl.startsWith('/')) {
    return authUrl;
  }

  if (window.location.hostname === 'localhost') {
    return `http://localhost:3000${authUrl}`;
  }
  return `${window.location.protocol}//${window.location.hostname}:${window.location.port}${authUrl}`;
}

const link = createHttpLink({
  uri: '/api/graphql',
  credentials: env.stage === 'development' ? 'include' : 'same-origin',
});

const client = new ApolloClient({
  cache: new InMemoryCache({
    typePolicies: {
      CombatUnitStub: {
        keyFields: ['id', 'spec'],
      },
    },
  }),
  link,
});

const APP_CONFIG_STORAGE_KEY = '@wowarenalogs/appConfig';

export function Main({ Component, pageProps }: AppProps) {
  console.log('bridge', window.wowarenalogs);

  const { t } = useTranslation();

  const platform = window.wowarenalogs.getPlatform();
  console.log('clientside.platform', platform);
  const appIsPackaged = false; //ipcRenderer.sendSync(IPC_GET_APP_IS_PACKAGED_SYNC);

  const [loading, setLoading] = useState(true);
  const [appConfig, setAppConfig] = useState<IAppConfig>({});

  const updateLaunchAtStartup = useCallback((launch: boolean) => {
    // remote.app.setLoginItemSettings({
    //   openAtLogin: launch,
    // });
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
    // remote.getCurrentWindow().setTitle(t('app-name'));
    // remote.getCurrentWindow().setSize(1440, 1000);
    // remote.getCurrentWindow().setMinimumSize(1200, 1000);
    // remote.getCurrentWindow().on('moved', () => {
    //   const [x, y] = remote.getCurrentWindow().getPosition();
    //   updateAppConfig((prev) => {
    //     return {
    //       ...prev,
    //       lastWindowX: x,
    //       lastWindowY: y,
    //     };
    //   });
    // });
    // remote.getCurrentWindow().on('resized', () => {
    //   const [w, h] = remote.getCurrentWindow().getSize();
    //   updateAppConfig((prev) => {
    //     return {
    //       ...prev,
    //       lastWindowWidth: w,
    //       lastWindowHeight: h,
    //     };
    //   });
    // });
  }, [updateAppConfig, t]);

  useEffect(() => {
    const appConfigJson = localStorage.getItem(APP_CONFIG_STORAGE_KEY);
    if (appConfigJson) {
      const storedConfig = JSON.parse(appConfigJson) as IAppConfig;
      const wowInstallations = DesktopUtils.getAllWoWInstallations(storedConfig.wowDirectory || '', platform);
      const [windowX, windowY] = [100, 100]; //remote.getCurrentWindow().getPosition();
      const [windowWidth, windowHeight] = [800, 600]; //remote.getCurrentWindow().getSize();

      const newState = {
        wowDirectory: wowInstallations.size > 0 ? storedConfig.wowDirectory : undefined,
        tosAccepted: storedConfig.tosAccepted || false,
        lastWindowX: storedConfig.lastWindowX === undefined ? windowX : storedConfig.lastWindowX || 0,
        lastWindowY: storedConfig.lastWindowY === undefined ? windowY : storedConfig.lastWindowY || 0,
        lastWindowWidth: storedConfig.lastWindowWidth === undefined ? windowWidth : storedConfig.lastWindowWidth || 0,
        lastWindowHeight:
          storedConfig.lastWindowHeight === undefined ? windowHeight : storedConfig.lastWindowHeight || 0,
        launchAtStartup: storedConfig.launchAtStartup || false,
      };
      setAppConfig(newState);

      // remote.getCurrentWindow().setPosition(newState.lastWindowX, newState.lastWindowY, false);
      // remote.getCurrentWindow().setSize(newState.lastWindowWidth, newState.lastWindowHeight, false);

      if (wowInstallations.size > 0) {
        DesktopUtils.installAddonAsync(wowInstallations).catch(); // do not await. just let this run in background
        setLoading(false);
        return;
      }
    }
    setLoading(false);
  }, [platform]);

  const wowInstallations = useMemo(() => {
    return DesktopUtils.getAllWoWInstallations(appConfig.wowDirectory || '', platform);
  }, [appConfig, platform]);

  useEffect(() => {
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
  }, []);

  const content = loading ? (
    <LoadingScreen />
  ) : appConfig.wowDirectory && appConfig.tosAccepted ? (
    <ApolloProvider client={client}>
      <Head>
        <meta key="charset" charSet="utf-8" />
        <link key="icon" rel="icon" href="/favicon.ico" />
        <meta key="viewport" name="viewport" content="width=device-width, initial-scale=1" />
        <meta key="theme-color" name="theme-color" content="#000000" />
        <link type="text/css" href="https://wow.zamimg.com/css/basic.css?16" rel="stylesheet" />
        <link type="text/css" href="https://wow.zamimg.com/css/global/icon.css?16" rel="stylesheet" />
        <script key="wowhead0">{'window.whTooltips = { colorLinks: true, iconSize: true };'}</script>
        <script key="wowhead1" src="https://wow.zamimg.com/widgets/power.js" />
        <script key="ga0" async src="https://www.googletagmanager.com/gtag/js?id=G-Z6E8QS4ENW"></script>
        <script
          key="ga1"
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-Z6E8QS4ENW');`,
          }}
        />
      </Head>
      <DefaultSeo
        defaultTitle={t('app-title')}
        titleTemplate={`%s | ${t('app-title')}`}
        description={t('app-description')}
        openGraph={{
          type: 'website',
          title: t('app-name'),
          description: t('app-description'),
        }}
        twitter={{
          site: '@WoWArenaLogs',
          handle: '@WoWArenaLogs',
        }}
      />
      <ClientContextProvider
        isDesktop={true}
        openExternalURL={() => undefined}
        // openExternalURL={(url: string) => shell.openExternal(url)}
        showLoginModalInSeparateWindow={(authUrl: string, callback: () => void) => {
          // const loginModalWindow = new remote.BrowserWindow({
          //   backgroundColor: '#000000',
          //   title: t('login'),
          //   x: remote.getCurrentWindow().getPosition()[0] + 200,
          //   y: remote.getCurrentWindow().getPosition()[1] + 100,
          //   width: 800,
          //   height: 800,
          //   maximizable: false,
          //   minimizable: false,
          //   parent: remote.getCurrentWindow(),
          //   modal: true,
          //   webPreferences: {
          //     nodeIntegration: false,
          //     enableRemoteModule: false,
          //   },
          // });
          // loginModalWindow.setMenuBarVisibility(false);
          // loginModalWindow.on('closed', callback);
          // loginModalWindow.webContents.on('did-navigate', (event, url) => {
          //   const urlObj = new URL(url);
          //   if (
          //     (urlObj.hostname === 'localhost' ||
          //       urlObj.hostname === 'wowarenalogs.com' ||
          //       urlObj.hostname.endsWith('.wowarenalogs.com')) &&
          //     urlObj.pathname === '/'
          //   ) {
          //     loginModalWindow.close();
          //   }
          // });
          // const absoluteAuthUrl = getAbsoluteAuthUrl(authUrl);
          // loginModalWindow.loadURL(absoluteAuthUrl);
        }}
        wowInstallations={wowInstallations}
        updateAppConfig={updateAppConfig}
        launchAtStartup={appConfig.launchAtStartup || false}
        setLaunchAtStartup={updateLaunchAtStartup}
        platform={platform}
        appIsPackaged={appIsPackaged}
      >
        <AuthProvider>
          <LocalCombatsContextProvider>
            <MainLayout>
              <Component {...pageProps} />
            </MainLayout>
          </LocalCombatsContextProvider>
        </AuthProvider>
      </ClientContextProvider>
    </ApolloProvider>
  ) : (
    <FirstTimeSetup
      wowDirectory={appConfig.wowDirectory}
      tosAccepted={appConfig.tosAccepted || false}
      updateAppConfig={updateAppConfig}
    />
  );

  return (
    <div id="desktop">
      <TitleBar />
      {content}
    </div>
  );
}

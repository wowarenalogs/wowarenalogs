import { WowVersion } from '@wowarenalogs/parser';
import { ClientContextProvider } from '@wowarenalogs/shared';
import { IAppConfig } from '@wowarenalogs/shared';
import { AuthProvider } from '@wowarenalogs/shared';
import { AppProps } from 'next/app';
import { useCallback, useEffect, useState } from 'react';
import { LocalCombatsContextProvider } from '../../hooks/localCombats';
import TitleBar from '../TitleBar';

const APP_CONFIG_STORAGE_KEY = '@wowarenalogs/appConfig';

export const DesktopLayout = ({ Component, pageProps }: AppProps) => {
  const [loading, setLoading] = useState(true);
  const [appConfig, setAppConfig] = useState<IAppConfig>({});

  const [wowInstallations, setWowInstallations] = useState<Map<WowVersion, string>>(new Map());

  useEffect(() => {
    console.log('Check Dir For Installs:', appConfig.wowDirectory);
    window.wowarenalogs.fs?.getAllWoWInstallations(appConfig.wowDirectory || '').then((i) => {
      setWowInstallations(i);
    });
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
    window.wowarenalogs.win?.onWindowMoved((_event, x, y) => {
      updateAppConfig((prev) => {
        return {
          ...prev,
          lastWindowX: x,
          lastWindowY: y,
        };
      });
    });

    window.wowarenalogs.win?.onWindowResized((_event, width, height) => {
      updateAppConfig((prev) => {
        return {
          ...prev,
          lastWindowWidth: width,
          lastWindowHeight: height,
        };
      });
    });
  }, [updateAppConfig]); // TODO: unregister?

  useEffect(() => {
    const appConfigJson = localStorage.getItem(APP_CONFIG_STORAGE_KEY);
    if (appConfigJson) {
      const storedConfig = JSON.parse(appConfigJson) as IAppConfig;
      const [windowX, windowY] = [0, 0]; // TODO: fix getPosition() logic
      const [windowWidth, windowHeight] = [800, 400]; // TODO: fix getSize() logic

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

      window.wowarenalogs.win?.setWindowPosition(newState.lastWindowX, newState.lastWindowY);
      window.wowarenalogs.win?.setWindowSize(newState.lastWindowWidth, newState.lastWindowHeight);

      if (wowInstallations.size > 0) {
        // window.wowarenalogs.fs.installAddon(); // TODO: Fix addon installation
      }
    }
    setLoading(false);
  }, []);

  // TODO: Fix Sentry integration + Analytics
  // useEffect(() => {
  //   initAnalyticsAsync('650475e4b06ebfb536489356d27b60f8', 'G-Z6E8QS4ENW').then(() => {
  //     import('@sentry/react').then((Sentry) => {
  //       import('@sentry/tracing').then(({ Integrations }) => {
  //         Sentry.init({
  //           dsn: 'https://a076d3d635b64882b87cd3df9b018071@o516205.ingest.sentry.io/5622355',
  //           integrations: [new Integrations.BrowserTracing()],
  //           tracesSampleRate: 1.0,
  //         });
  //         const userId = getAnalyticsDeviceId();
  //         if (userId) {
  //           Sentry.setUser({
  //             id: userId,
  //           });
  //         }
  //       });
  //     });
  //   });
  // }, []);

  return (
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
        window.wowarenalogs.bnet?.login(authUrl, 'window title'); // TODO: window title
      }}
      setLaunchAtStartup={(openAtLogin: boolean) => {
        window.wowarenalogs.app?.setOpenAtLogin(openAtLogin);
      }}
    >
      <AuthProvider>
        <LocalCombatsContextProvider>
          <div className="mt-8 text-white">
            <TitleBar />
            <div>Apploading: {loading.toString()}</div>
            <div className="ml-1 mr-1">
              <Component {...pageProps} />
            </div>
          </div>
        </LocalCombatsContextProvider>
      </AuthProvider>
    </ClientContextProvider>
  );
};

import { WowVersion } from '@wowarenalogs/parser';
import React, { useContext, useEffect, useState } from 'react';

const APP_CONFIG_STORAGE_KEY = '@wowarenalogs/appConfig';

export interface IAppConfig {
  wowDirectory?: string;
  tosAccepted?: boolean;
  lastWindowX?: number;
  lastWindowY?: number;
  lastWindowWidth?: number;
  lastWindowHeight?: number;
  launchAtStartup?: boolean;
  enableVideoRecording?: boolean;
  flags?: string[];
}

interface IAppConfigContextData {
  isLoading: boolean;
  appConfig: IAppConfig;
  updateAppConfig: (updater: (prevAppConfig: IAppConfig) => IAppConfig) => void;
  wowInstallations: Map<WowVersion, string>;
}

const AppConfigContext = React.createContext<IAppConfigContextData>({
  isLoading: true,
  appConfig: {},
  updateAppConfig: () => {
    return;
  },
  wowInstallations: new Map(),
});

interface IProps {
  children: React.ReactNode | React.ReactNode[];
}

export const AppConfigContextProvider = (props: IProps) => {
  const [appConfig, setAppConfig] = useState<IAppConfig>({});
  const [isLoading, setLoading] = useState(true);

  const [wowInstallations, setWowInstallations] = useState<Map<WowVersion, string>>(new Map());

  useEffect(() => {
    window.wowarenalogs.fs?.getAllWoWInstallations(appConfig.wowDirectory || '').then((i) => {
      setWowInstallations(i);
    });
    if (appConfig.wowDirectory) {
      window.wowarenalogs.fs?.installAddon(appConfig.wowDirectory);
    }
  }, [appConfig.wowDirectory]);

  const updateAppConfig = (updater: (prevAppConfig: IAppConfig) => IAppConfig) => {
    setAppConfig((prev) => {
      const newConfig = updater(prev);
      try {
        window.wowarenalogs.app?.setOpenAtLogin(newConfig.launchAtStartup ?? false);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[AppConfig] Failed to update open-at-login', error);
      }
      try {
        localStorage.setItem(APP_CONFIG_STORAGE_KEY, JSON.stringify(newConfig));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[AppConfig] Failed to persist app config', error);
      }
      return newConfig;
    });
  };

  useEffect(() => {
    window.wowarenalogs.win?.onWindowMoved((_, x, y) => {
      updateAppConfig((prev) => {
        return {
          ...prev,
          lastWindowX: x,
          lastWindowY: y,
        };
      });
    });
    window.wowarenalogs.win?.onWindowResized((_, w, h) => {
      updateAppConfig((prev) => {
        return {
          ...prev,
          lastWindowWidth: w,
          lastWindowHeight: h,
        };
      });
    });
  }, []);

  useEffect(() => {
    const impl = async () => {
      let appConfigJson: string | null = null;
      try {
        appConfigJson = localStorage.getItem(APP_CONFIG_STORAGE_KEY);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[AppConfig] Failed to read app config from storage', error);
      }
      if (appConfigJson) {
        let storedConfig: IAppConfig = {};
        try {
          storedConfig = JSON.parse(appConfigJson) as IAppConfig;
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[AppConfig] Failed to parse app config JSON', error);
        }

        const [windowX, windowY] = (await window.wowarenalogs.win?.getWindowPosition()) ?? [];
        const [windowWidth, windowHeight] = (await window.wowarenalogs.win?.getWindowSize()) ?? [];

        const newState = {
          wowDirectory: storedConfig.wowDirectory,
          tosAccepted: storedConfig.tosAccepted || false,
          lastWindowX: storedConfig.lastWindowX === undefined ? windowX : storedConfig.lastWindowX || 0,
          lastWindowY: storedConfig.lastWindowY === undefined ? windowY : storedConfig.lastWindowY || 0,
          lastWindowWidth: storedConfig.lastWindowWidth === undefined ? windowWidth : storedConfig.lastWindowWidth || 0,
          lastWindowHeight:
            storedConfig.lastWindowHeight === undefined ? windowHeight : storedConfig.lastWindowHeight || 0,
          launchAtStartup: storedConfig.launchAtStartup || false,
          enableVideoRecording: storedConfig.enableVideoRecording || false,
          flags: storedConfig.flags || [],
        };
        setAppConfig(newState);

        if (storedConfig.lastWindowX !== undefined && storedConfig.lastWindowY !== undefined)
          window.wowarenalogs.win?.setWindowPosition(storedConfig.lastWindowX, storedConfig.lastWindowY);
        if (storedConfig.lastWindowHeight !== undefined && storedConfig.lastWindowWidth !== undefined)
          window.wowarenalogs.win?.setWindowSize(storedConfig.lastWindowWidth, storedConfig.lastWindowHeight);
      }
      setLoading(false);
    };
    impl();
  }, []);

  return (
    <AppConfigContext.Provider
      value={{
        isLoading,
        appConfig,
        updateAppConfig,
        wowInstallations,
      }}
    >
      {props.children}
    </AppConfigContext.Provider>
  );
};

export const useAppConfig = () => {
  return useContext(AppConfigContext);
};

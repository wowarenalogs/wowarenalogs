import { WowVersion } from '@wowarenalogs/parser';
import React, { useContext } from 'react';

export interface IAppConfig {
  wowDirectory?: string;
  tosAccepted?: boolean;
  lastWindowX?: number;
  lastWindowY?: number;
  lastWindowWidth?: number;
  lastWindowHeight?: number;
  launchAtStartup?: boolean;
}

interface IClientContextData {
  isDesktop: boolean;
  openExternalURL: (url: string) => void;
  showLoginModalInSeparateWindow: (authUrl: string, callback: () => void) => void;
  wowInstallations: Map<WowVersion, string>;
  updateAppConfig: (updater: (prevAppConfig: IAppConfig) => IAppConfig) => void;
  launchAtStartup: boolean;
  setLaunchAtStartup: (launch: boolean) => void;
  saveWindowPosition: () => Promise<void>;
}

const ClientContext = React.createContext<IClientContextData>({
  isDesktop: false,
  openExternalURL: () => null,
  showLoginModalInSeparateWindow: (authUrl: string, callback: () => void) => {
    callback();
  },
  wowInstallations: new Map<WowVersion, string>(),
  launchAtStartup: false,
  updateAppConfig: () => {
    return;
  },
  setLaunchAtStartup: (_launch: boolean) => {
    return;
  },
  saveWindowPosition: () => Promise.resolve(),
});

interface IProps {
  isDesktop: boolean;
  openExternalURL: (url: string) => void;
  showLoginModalInSeparateWindow: (authUrl: string, callback: () => void) => void;
  wowInstallations: Map<WowVersion, string>;
  updateAppConfig: (updater: (prevAppConfig: IAppConfig) => IAppConfig) => void;
  launchAtStartup: boolean;
  setLaunchAtStartup: (launch: boolean) => void;
  children: React.ReactNode | React.ReactNodeArray;
  saveWindowPosition: () => Promise<void>;
}

export const ClientContextProvider = (props: IProps) => {
  return (
    <ClientContext.Provider
      value={{
        openExternalURL: props.openExternalURL,
        isDesktop: props.isDesktop,
        showLoginModalInSeparateWindow: props.showLoginModalInSeparateWindow,
        wowInstallations: props.wowInstallations,
        updateAppConfig: props.updateAppConfig,
        launchAtStartup: props.launchAtStartup,
        setLaunchAtStartup: props.setLaunchAtStartup,
        saveWindowPosition: props.saveWindowPosition,
      }}
    >
      {props.children}
    </ClientContext.Provider>
  );
};

export const useClientContext = () => {
  const contextData = useContext(ClientContext);
  return contextData;
};

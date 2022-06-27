import React, { useContext } from 'react';
import { WowVersion } from 'wow-combat-log-parser';

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
  platform: string;
  appIsPackaged: boolean;
  openArmoryLink: (playerName: string, serverName: string, region: string, locale: string) => void;
  openExternalURL: (url: string) => void;
  showLoginModalInSeparateWindow: (authUrl: string, callback: () => void) => void;
  wowInstallations: Map<WowVersion, string>;
  updateAppConfig: (updater: (prevAppConfig: IAppConfig) => IAppConfig) => void;
  launchAtStartup: boolean;
  setLaunchAtStartup: (launch: boolean) => void;
}

const ClientContext = React.createContext<IClientContextData>({
  isDesktop: false,
  appIsPackaged: false,
  platform: '',
  openExternalURL: () => null,
  openArmoryLink: () => null,
  showLoginModalInSeparateWindow: (authUrl: string, callback: () => void) => {
    callback();
  },
  wowInstallations: new Map<WowVersion, string>(),
  launchAtStartup: false,
  updateAppConfig: () => {
    return;
  },
  setLaunchAtStartup: (launch: boolean) => {
    return;
  },
});

interface IProps {
  isDesktop: boolean;
  openExternalURL: (url: string) => void;
  openArmoryLink: (playerName: string, serverName: string, region: string, locale: string) => void;
  showLoginModalInSeparateWindow: (authUrl: string, callback: () => void) => void;
  wowInstallations: Map<WowVersion, string>;
  updateAppConfig: (updater: (prevAppConfig: IAppConfig) => IAppConfig) => void;
  launchAtStartup: boolean;
  setLaunchAtStartup: (launch: boolean) => void;
  children: React.ReactNode | React.ReactNodeArray;
}

export const ClientContextProvider = (props: IProps) => {
  return (
    <ClientContext.Provider
      value={{
        appIsPackaged: false,
        platform: '',
        openExternalURL: props.openExternalURL,
        openArmoryLink: props.openArmoryLink,
        isDesktop: props.isDesktop,
        showLoginModalInSeparateWindow: props.showLoginModalInSeparateWindow,
        wowInstallations: props.wowInstallations,
        updateAppConfig: props.updateAppConfig,
        launchAtStartup: props.launchAtStartup,
        setLaunchAtStartup: props.setLaunchAtStartup,
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

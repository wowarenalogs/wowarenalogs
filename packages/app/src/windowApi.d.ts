/* eslint-disable @typescript-eslint/no-explicit-any */
import { LogsModule } from './nativeBridge/modules/logsModule';
import { BnetModule } from './nativeBridge/modules/bnetModule';
import { FilesModule } from './nativeBridge/modules/filesModule';
import { ExternalLinksModule } from './nativeBridge/modules/externalLinksModule';
import { MainWindowModule } from './nativeBridge/modules/mainWindowModule';
import { ApplicationModule } from './nativeBridge/modules/applicationModule';

type ElectronOpaqueEvent = {
  senderId: number;
};

type OmitFirstArg<F> = F extends (x: any, ...args: infer P) => infer R ? (...args: P) => R : never;
type AsEventFunction<F> = F extends (x: any, ...args: infer P) => infer R
  ? (event: ElectronOpaqueEvent, ...args: P) => R
  : never;

export type NativeApi = {
  logs: {
    importLogFiles: OmitFirstArg<LogsModule['importLogFiles']>;
    startLogWatcher: OmitFirstArg<LogsModule['startLogWatcher']>;
    stopLogWatcher: OmitFirstArg<LogsModule['stopLogWatcher']>;
    handleNewCombat: (callback: AsEventFunction<LogsModule['handleNewCombat']>) => void;
    removeAll_handleNewCombat_listeners: () => void;
    handleSoloShuffleRoundEnded: (callback: AsEventFunction<LogsModule['handleSoloShuffleRoundEnded']>) => void;
    removeAll_handleSoloShuffleRoundEnded_listeners: () => void;
    handleSoloShuffleEnded: (callback: AsEventFunction<LogsModule['handleSoloShuffleEnded']>) => void;
    removeAll_handleSoloShuffleEnded_listeners: () => void;
    handleMalformedCombatDetected: (callback: AsEventFunction<LogsModule['handleMalformedCombatDetected']>) => void;
    removeAll_handleMalformedCombatDetected_listeners: () => void;
    handleParserError: (callback: AsEventFunction<LogsModule['handleParserError']>) => void;
    removeAll_handleParserError_listeners: () => void;
  };
  bnet: { login: OmitFirstArg<BnetModule['login']> };
  fs: {
    selectFolder: OmitFirstArg<FilesModule['selectFolder']>;
    getAllWoWInstallations: OmitFirstArg<FilesModule['getAllWoWInstallations']>;
    installAddon: OmitFirstArg<FilesModule['installAddon']>;
  };
  links: { openExternalURL: OmitFirstArg<ExternalLinksModule['openExternalURL']> };
  win: {
    isMaximized: OmitFirstArg<MainWindowModule['isMaximized']>;
    isMinimized: OmitFirstArg<MainWindowModule['isMinimized']>;
    minimize: OmitFirstArg<MainWindowModule['minimize']>;
    maximize: OmitFirstArg<MainWindowModule['maximize']>;
    hideToSystemTray: OmitFirstArg<MainWindowModule['hideToSystemTray']>;
    setWindowSize: OmitFirstArg<MainWindowModule['setWindowSize']>;
    setWindowPosition: OmitFirstArg<MainWindowModule['setWindowPosition']>;
    getWindowPosition: OmitFirstArg<MainWindowModule['getWindowPosition']>;
    getWindowSize: OmitFirstArg<MainWindowModule['getWindowSize']>;
    onWindowResized: (callback: AsEventFunction<MainWindowModule['onWindowResized']>) => void;
    removeAll_onWindowResized_listeners: () => void;
    onWindowMoved: (callback: AsEventFunction<MainWindowModule['onWindowMoved']>) => void;
    removeAll_onWindowMoved_listeners: () => void;
  };
  app: {
    quit: OmitFirstArg<ApplicationModule['quit']>;
    setOpenAtLogin: OmitFirstArg<ApplicationModule['setOpenAtLogin']>;
    getIsPackaged: OmitFirstArg<ApplicationModule['getIsPackaged']>;
    getVersion: OmitFirstArg<ApplicationModule['getVersion']>;
    isUpdateAvailable: OmitFirstArg<ApplicationModule['isUpdateAvailable']>;
    clearStorage: OmitFirstArg<ApplicationModule['clearStorage']>;
  };
};
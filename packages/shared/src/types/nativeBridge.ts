import { ICombatData, WowVersion } from '@wowarenalogs/parser';

type ElectronOpaqueEvent = {
  senderId: number;
};

type FSCodex = {
  ['setup-page-locate-wow-mac']: string;
  ['setup-page-locate-wow-windows']: string;
  ['setup-page-invalid-location']: string;
  ['setup-page-invalid-location-message']: string;
  ['confirm']: string;
};

export type INativeBridge = {
  win: {
    onWindowResized: (callback: (event: ElectronOpaqueEvent) => void) => void;
    onWindowMoved: (callback: (event: ElectronOpaqueEvent) => void) => void;
    setWindowSize: (width: number, height: number) => Promise<void>;
    setWindowPosition: (x: number, y: number) => Promise<void>;
    minimize?: () => Promise<void>;
    maximize?: (maximize?: boolean) => Promise<void>;
    isMinimized?: () => Promise<boolean>;
    isMaximized?: () => Promise<boolean>;
  };
  app: {
    quit?: () => Promise<void>;
  };
  links: {
    openArmoryLink?: (locale: string, region: string, serverName: string, playerName: string) => Promise<void>;
  };
  fs: {
    folderSelected: (callback: (event: ElectronOpaqueEvent, folder: string) => void) => void;
    selectFolder: (codex: FSCodex) => Promise<void>;
  };
  bnet: {
    login: (authUrl: string, windowTitle: string) => Promise<void>;
    onLoggedIn: (callback: (event: ElectronOpaqueEvent) => void) => void;
  };
  logs: {
    handleNewCombat: (callback: (event: ElectronOpaqueEvent, c: ICombatData) => void) => void;
    startLogWatcher: (wowDirectory: string, wowVersion: WowVersion) => Promise<void>;
    stopLogWatcher: () => Promise<void>;
  };
};

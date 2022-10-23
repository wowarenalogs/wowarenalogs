import { ICombatData, WowVersion } from '@wowarenalogs/parser';

type ElectronOpaqueEvent = {
  senderId: number;
};

export type INativeBridge = {
  platform:
    | 'aix'
    | 'android'
    | 'darwin'
    | 'freebsd'
    | 'haiku'
    | 'linux'
    | 'openbsd'
    | 'sunos'
    | 'win32'
    | 'cygwin'
    | 'netbsd';
  win?: {
    onWindowResized: (callback: (event: ElectronOpaqueEvent, w: number, h: number) => void) => void;
    onWindowMoved: (callback: (event: ElectronOpaqueEvent, x: number, y: number) => void) => void;
    setWindowSize: (width: number, height: number) => Promise<void>;
    setWindowPosition: (x: number, y: number) => Promise<void>;
    getWindowPosition: () => Promise<[number, number]>;
    getWindowSize: () => Promise<[number, number]>;
    minimize: () => Promise<void>;
    maximize: (maximize?: boolean) => Promise<void>;
    isMinimized: () => Promise<boolean>;
    isMaximized: () => Promise<boolean>;
  };
  app?: {
    quit: () => Promise<void>;
    setOpenAtLogin: (openAtLogin: boolean) => Promise<void>;
    getIsPackaged: () => Promise<boolean>;
  };
  links?: {
    openExternalURL: (url: string) => Promise<void>;
  };
  fs?: {
    getAllWoWInstallations: (path: string) => Promise<Map<WowVersion, string>>;
    selectFolder: () => Promise<string>;
    installAddon: (wowDirectory: string) => Promise<void>;
  };
  bnet?: {
    login: (authUrl: string, windowTitle: string) => Promise<void>;
  };
  logs?: {
    handleNewCombat: (callback: (event: ElectronOpaqueEvent, c: ICombatData) => void) => void;
    startLogWatcher: (wowDirectory: string, wowVersion: WowVersion) => Promise<void>;
    stopLogWatcher: () => Promise<void>;
    removeAll_handleNewCombat_listeners: () => Promise<void>;
  };
};

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
    handleFolderSelected: (callback: (event: ElectronOpaqueEvent, folder: string) => void) => void;
    selectFolder: (codex: FSCodex) => Promise<void>;
  };
  bnet: {
    login: (authUrl: string, windowTitle: string) => Promise<void>;
    onLoggedIn: (callback: (event: ElectronOpaqueEvent) => void) => void;
  };
};

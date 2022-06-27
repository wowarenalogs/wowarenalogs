type ElectronOpaqueEvent = {
  senderId: number;
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
    selectFolder: () => Promise<void>;
  };
};

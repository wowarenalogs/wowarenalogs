export type INativeBridge = {
  minimizeMainWindow?: () => Promise<void>;
  maximizeMainWindow?: (maximize?: boolean) => Promise<void>;
  isMainWindowMinimized?: () => Promise<boolean>;
  isMainWindowMaximized?: () => Promise<boolean>;
  quit?: () => Promise<void>;
  openArmoryLink?: (locale: string, region: string, serverName: string, playerName: string) => Promise<void>;
};

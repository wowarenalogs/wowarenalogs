import { BrowserWindow, contextBridge, ipcMain, IpcMainInvokeEvent, ipcRenderer, shell } from 'electron';

const bridgeState: {
  mainWindow?: BrowserWindow;
} = {
  mainWindow: undefined,
};

const Events = {
  armoryLinkOpenedEvent: 'wal-open-armory-link',
};

const externalUrlsAPI = {
  openArmoryLink: (playerName: string, serverName: string, region: string, locale: string) =>
    ipcRenderer.invoke(Events.armoryLinkOpenedEvent, playerName, serverName, region, locale) as Promise<
      ReturnType<typeof onArmoryLinkOpened>
    >,
};

export type ExternalUrlsBridgeAPI = typeof externalUrlsAPI;

export class ExternalUrlsBridge {
  // Should be integrated in preload.ts
  public static preloadBindings = () => {
    contextBridge.exposeInMainWorld('externalUrlsBridge', externalUrlsAPI);
  };

  // Should be called in main.ts
  public static mainBindings = (mainWindow: BrowserWindow) => {
    bridgeState.mainWindow = mainWindow;
    ipcMain.handle(Events.armoryLinkOpenedEvent, onArmoryLinkOpened);
  };
}

function onArmoryLinkOpened(
  _event: IpcMainInvokeEvent,
  playerName: string,
  serverName: string,
  region: string,
  locale: string,
) {
  return shell.openExternal(`https://worldofwarcraft.com/${locale}/character/${region}/${serverName}/${playerName}`);
}

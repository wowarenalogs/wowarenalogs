import { BrowserWindow, contextBridge, ipcMain, IpcMainInvokeEvent, ipcRenderer, IpcRendererEvent } from 'electron';

const bridgeState: {
  mainWindow?: BrowserWindow;
} = {
  mainWindow: undefined,
};

const Events = {
  bnetLoginModalOpenedEvent: 'wal-open-bnet-login',
  bnetLoginFinishedEvent: 'wal-bnet-login-finished',
};

const bnetLoginApi = {
  showLoginModalInSeparateWindow: (authUrl: string, windowTitle: string) =>
    ipcRenderer.invoke(Events.bnetLoginModalOpenedEvent, authUrl, windowTitle) as Promise<
      ReturnType<typeof showLoginModalInSeparateWindow>
    >,
  onLoginFinished: (callback: (event: IpcRendererEvent) => void) =>
    ipcRenderer.once(Events.bnetLoginFinishedEvent, callback),
};

export type BnetLoginBridgeAPI = typeof bnetLoginApi;

export class BnetLoginBridge {
  // Should be integrated in preload.ts
  public static preloadBindings = () => {
    contextBridge.exposeInMainWorld('bnet', bnetLoginApi);
  };

  // Should be called in main.ts
  public static mainBindings = (mainWindow: BrowserWindow) => {
    bridgeState.mainWindow = mainWindow;
    ipcMain.handle(Events.bnetLoginModalOpenedEvent, showLoginModalInSeparateWindow);
  };
}

function getAbsoluteAuthUrl(authUrl: string): string {
  if (!authUrl.startsWith('/')) {
    return authUrl;
  }

  if (window.location.hostname === 'localhost') {
    return `http://localhost:3000${authUrl}`;
  }
  return `${window.location.protocol}//${window.location.hostname}:${window.location.port}${authUrl}`;
}

function showLoginModalInSeparateWindow(_event: IpcMainInvokeEvent, authUrl: string, windowTitle: string) {
  const mainWindowPosition = bridgeState.mainWindow?.getPosition();

  const loginModalWindow = new BrowserWindow({
    backgroundColor: '#000000',
    title: windowTitle, //t('login'),
    x: mainWindowPosition ? mainWindowPosition[0] + 200 : 200,
    y: mainWindowPosition ? mainWindowPosition[1] + 100 : 200,
    width: 800,
    height: 800,
    maximizable: false,
    minimizable: false,
    parent: bridgeState.mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: false,
      enableRemoteModule: false,
    },
  });
  loginModalWindow.setMenuBarVisibility(false);
  loginModalWindow.on('closed', () => {
    bridgeState.mainWindow?.webContents.send(Events.bnetLoginModalOpenedEvent);
  });
  loginModalWindow.webContents.on('did-navigate', (event, url) => {
    const urlObj = new URL(url);
    if (
      (urlObj.hostname === 'localhost' ||
        urlObj.hostname === 'wowarenalogs.com' ||
        urlObj.hostname.endsWith('.wowarenalogs.com')) &&
      urlObj.pathname === '/'
    ) {
      loginModalWindow.close();
    }
  });
  const absoluteAuthUrl = getAbsoluteAuthUrl(authUrl);
  loginModalWindow.loadURL(absoluteAuthUrl);
  return null;
}

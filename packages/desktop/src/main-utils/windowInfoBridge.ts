import { BrowserWindow, contextBridge, ipcMain, IpcMainInvokeEvent, ipcRenderer } from 'electron';

const bridgeState: {
  mainWindow?: BrowserWindow;
} = {
  mainWindow: undefined,
};

const Events = {
  onWindowResizedEvent: 'wal-open-armory-link',
  onWindowMovedEvent: 'wal-window-moved',
  windowSizedEvent: 'wal-window-set-size',
  windowPositionedEvent: 'wal-window-set-position',
};

const windowinfoAPI = {
  onWindowResized: (callback: () => void) => ipcRenderer.on(Events.onWindowResizedEvent, callback),
  onWindowMoved: (callback: () => void) => ipcRenderer.on(Events.onWindowMovedEvent, callback),
  setWindowSize: (width: number, height: number) =>
    ipcRenderer.invoke(Events.windowSizedEvent, width, height) as Promise<ReturnType<typeof setWindowSize>>,
  setWindowPosition: (x: number, y: number) =>
    ipcRenderer.invoke(Events.windowPositionedEvent, x, y) as Promise<ReturnType<typeof setWindowPosition>>,
};

export type WindowinfoBridgeAPI = typeof windowinfoAPI;

export class WindowinfoBridge {
  // Should be integrated in preload.ts
  public static preloadBindings = () => {
    contextBridge.exposeInMainWorld('windowinfoBridge', windowinfoAPI);
  };

  // Should be called in main.ts
  public static mainBindings = (mainWindow: BrowserWindow) => {
    bridgeState.mainWindow = mainWindow;
    ipcMain.handle(Events.windowSizedEvent, setWindowSize);
    ipcMain.handle(Events.windowPositionedEvent, setWindowPosition);
    mainWindow.on('resize', () => {
      mainWindow.webContents.send(Events.onWindowResizedEvent);
    });
    mainWindow.on('move', () => {
      mainWindow.webContents.send(Events.onWindowMovedEvent);
    });
  };
}

function setWindowPosition(_event: IpcMainInvokeEvent, x: number, y: number) {
  return bridgeState.mainWindow?.setPosition(x, y);
}

function setWindowSize(_event: IpcMainInvokeEvent, width: number, height: number) {
  return bridgeState.mainWindow?.setSize(width, height);
}

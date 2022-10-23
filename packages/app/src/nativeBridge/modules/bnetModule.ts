import { BrowserWindow } from 'electron';

import { moduleFunction, NativeBridgeModule, nativeBridgeModule } from '../module';

@nativeBridgeModule('bnet')
export class BnetModule extends NativeBridgeModule {
  @moduleFunction()
  public login(mainWindow: Electron.BrowserWindow, absoluteAuthUrl: string, windowTitle: string): Promise<void> {
    return new Promise((resolve) => {
      const mainWindowPosition = mainWindow.getPosition();

      const loginModalWindow = new BrowserWindow({
        backgroundColor: '#000000',
        title: windowTitle,
        x: mainWindowPosition ? mainWindowPosition[0] + 200 : 200,
        y: mainWindowPosition ? mainWindowPosition[1] + 100 : 200,
        width: 800,
        height: 800,
        maximizable: false,
        minimizable: false,
        parent: mainWindow,
        modal: true,
        webPreferences: {
          nodeIntegration: false,
          sandbox: true,
        },
      });
      loginModalWindow.setMenuBarVisibility(false);
      loginModalWindow.webContents.on('did-navigate', (_event, url) => {
        const urlObj = new URL(url);
        if (
          (urlObj.hostname === 'localhost' ||
            urlObj.hostname === 'wowarenalogs.com' ||
            urlObj.hostname.endsWith('.wowarenalogs.com')) &&
          urlObj.pathname === '/'
        ) {
          resolve();
          loginModalWindow.close();
        }
      });
      loginModalWindow.loadURL(absoluteAuthUrl);
    });
  }
}

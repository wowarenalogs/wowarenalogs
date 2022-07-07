import { BrowserWindow } from 'electron';

import { moduleEvent, moduleFunction, NativeBridgeModule, nativeBridgeModule } from '../module';

@nativeBridgeModule('bnet')
export class BnetModule extends NativeBridgeModule {
  @moduleFunction()
  public login(mainWindow: Electron.BrowserWindow, absoluteAuthUrl: string, windowTitle: string): Promise<void> {
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
      // modal: true, // TODO: convert back to modal
      webPreferences: {
        nodeIntegration: false,
        sandbox: true,
      },
    });
    loginModalWindow.setMenuBarVisibility(false);
    loginModalWindow.on('closed', () => {
      this.onLoggedIn(mainWindow);
    });
    loginModalWindow.webContents.on('did-navigate', (_event, url) => {
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
    return loginModalWindow.loadURL(absoluteAuthUrl);
  }

  @moduleEvent('once')
  public onLoggedIn(_mainWindow: Electron.BrowserWindow): void {}
}

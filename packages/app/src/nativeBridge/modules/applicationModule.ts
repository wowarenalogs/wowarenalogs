import { app, session } from 'electron';

import { moduleFunction, NativeBridgeModule, nativeBridgeModule } from '../module';
import { globalStates } from './common/globalStates';

@nativeBridgeModule('app')
export class ApplicationModule extends NativeBridgeModule {
  @moduleFunction({ isRequired: true })
  public async quit(_mainWindow: Electron.BrowserWindow): Promise<void> {
    app.quit();
  }

  @moduleFunction({ isRequired: true })
  public async setOpenAtLogin(_mainWindow: Electron.BrowserWindow, openAtLogin: boolean): Promise<void> {
    if (!app.isPackaged) {
      // do not make the dev app launch on startup
      return;
    }
    return app.setLoginItemSettings({
      openAtLogin,
      args: ['--hidden'],
    });
  }

  @moduleFunction()
  public async getIsPackaged(_mainWindow: Electron.BrowserWindow) {
    return app.isPackaged;
  }

  @moduleFunction()
  public async getVersion(_mainWindow: Electron.BrowserWindow) {
    return app.getVersion();
  }

  @moduleFunction()
  public async isUpdateAvailable(_mainWindow: Electron.BrowserWindow) {
    return globalStates.isUpdateAvailable;
  }

  @moduleFunction()
  public async clearStorage(_mainWindow: Electron.BrowserWindow) {
    await session.defaultSession.clearStorageData();
  }
}

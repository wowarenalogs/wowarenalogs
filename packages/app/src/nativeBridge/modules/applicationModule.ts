import { app } from 'electron';

import { moduleFunction, NativeBridgeModule, nativeBridgeModule } from '../module';

@nativeBridgeModule('app')
export class ApplicationModule extends NativeBridgeModule {
  @moduleFunction()
  public async quit(_mainWindow: Electron.BrowserWindow): Promise<void> {
    app.quit();
  }

  @moduleFunction()
  public async setOpenAtLogin(_mainWindow: Electron.BrowserWindow, openAtLogin: boolean): Promise<void> {
    return app.setLoginItemSettings({
      openAtLogin,
    });
  }

  @moduleFunction()
  public async getIsPackaged(_mainWindow: Electron.BrowserWindow) {
    return app.isPackaged;
  }
}

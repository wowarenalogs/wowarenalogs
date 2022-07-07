import { app } from 'electron';

import { NativeBridgeModule } from '../module';

export class ApplicationModule extends NativeBridgeModule {
  constructor() {
    super('app');
  }

  public async quit(_mainWindow: Electron.BrowserWindow): Promise<void> {
    app.quit();
  }

  public async setOpenAtLogin(_mainWindow: Electron.BrowserWindow, openAtLogin: boolean): Promise<void> {
    return app.setLoginItemSettings({
      openAtLogin,
    });
  }

  public async getIsPackaged(_mainWindow: Electron.BrowserWindow) {
    return app.isPackaged;
  }

  public getInvokables() {
    return [
      {
        name: 'quit',
        invocation: this.quit,
      },
      {
        name: 'setOpenAtLogin',
        invocation: this.setOpenAtLogin,
      },
      {
        name: 'getIsPackaged',
        invocation: this.getIsPackaged,
      },
    ];
  }
}

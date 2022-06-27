import { BrowserWindow, shell } from 'electron';
import { NativeBridgeModule } from '../module';

export class MainWindowModule extends NativeBridgeModule {
  constructor() {
    super('win');
  }

  public async isMaximized(mainWindow: BrowserWindow): Promise<boolean> {
    return mainWindow.isMaximized();
  }

  public async isMinimized(mainWindow: BrowserWindow): Promise<boolean> {
    return mainWindow.isMinimized();
  }

  public async minimize(mainWindow: BrowserWindow): Promise<void> {
    mainWindow.minimize();
  }

  public async maximize(mainWindow: BrowserWindow, maximize?: boolean): Promise<void> {
    if (maximize === undefined) {
      maximize = true;
    }

    if (maximize) {
      mainWindow.maximize();
    } else {
      mainWindow.unmaximize();
    }
  }

  public getInvokables() {
    return [
      {
        name: 'isMaximized',
        invocation: this.isMaximized,
      },
      {
        name: 'isMinimized',
        invocation: this.isMinimized,
      },
      {
        name: 'minimize',
        invocation: this.minimize,
      },
      {
        name: 'maximize',
        invocation: this.maximize,
      },
    ];
  }
}

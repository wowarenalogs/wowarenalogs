import { BrowserWindow } from 'electron';
import { NativeBridgeModule } from '../module';

export class MaximizeMainWindowModule extends NativeBridgeModule {
  constructor() {
    super('maximizeMainWindow');
  }

  public async handleMessageAsync(mainWindow: BrowserWindow, maximize?: boolean): Promise<void> {
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
    return [];
  }
}

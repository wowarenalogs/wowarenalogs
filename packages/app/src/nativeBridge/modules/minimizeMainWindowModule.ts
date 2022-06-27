import { BrowserWindow } from 'electron';
import { NativeBridgeModule } from '../module';

export class MinimizeMainWindowModule extends NativeBridgeModule {
  constructor() {
    super('minimizeMainWindow');
  }

  public async handleMessageAsync(mainWindow: BrowserWindow): Promise<void> {
    mainWindow.minimize();
  }

  public getInvokables() {
    return [];
  }
}

import { BrowserWindow } from 'electron';
import { NativeBridgeModule } from '../module';

export class IsMainWindowMaximizedModule extends NativeBridgeModule {
  constructor() {
    super('isMainWindowMaximized');
  }

  public async handleMessageAsync(mainWindow: BrowserWindow): Promise<boolean> {
    return mainWindow.isMaximized();
  }
}

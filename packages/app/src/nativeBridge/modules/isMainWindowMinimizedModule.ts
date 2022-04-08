import { BrowserWindow } from 'electron';
import { NativeBridgeModule } from '../module';

export class IsMainWindowMinimizedModule extends NativeBridgeModule {
  constructor() {
    super('isMainWindowMinimized');
  }

  public async handleMessageAsync(mainWindow: BrowserWindow): Promise<boolean> {
    return mainWindow.isMinimized();
  }
}

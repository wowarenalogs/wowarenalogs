import { BrowserWindow, ipcMain } from 'electron';

import { IsMainWindowMaximizedModule } from './modules/isMainWindowMaximizedModule';
import { IsMainWindowMinimizedModule } from './modules/isMainWindowMinimizedModule';
import { MaximizeMainWindowModule } from './modules/maximizeMainWindowModule';
import { MinimizeMainWindowModule } from './modules/minimizeMainWindowModule';
import { NativeBridgeModule } from './module';
import { QuitModule } from './modules/quitModule';

export class NativeBridgeRegistry {
  private modules: Map<string, NativeBridgeModule> = new Map<string, NativeBridgeModule>();

  public registerModule(module: NativeBridgeModule): void {
    this.modules.set(module.name, module);
  }

  public generateAPIObject(): Object {
    return Object.assign({}, ...Array.from(this.modules.values()).map((module) => module.generateAPIObject()));
  }

  public startListeners(mainWindow: BrowserWindow): void {
    Array.from(this.modules.values()).forEach((module) => {
      ipcMain.handle(module.getMessageKey(), async (event, ...args) => {
        return await module.handleMessageAsync(mainWindow, ...args);
      });
    });
  }
}

export const nativeBridgeRegistry = new NativeBridgeRegistry();

nativeBridgeRegistry.registerModule(new MinimizeMainWindowModule());
nativeBridgeRegistry.registerModule(new MaximizeMainWindowModule());
nativeBridgeRegistry.registerModule(new IsMainWindowMinimizedModule());
nativeBridgeRegistry.registerModule(new IsMainWindowMaximizedModule());
nativeBridgeRegistry.registerModule(new QuitModule());

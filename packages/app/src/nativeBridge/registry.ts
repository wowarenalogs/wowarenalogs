import { BrowserWindow, ipcMain } from 'electron';

import { ExternalLinksModule } from './modules/externalLinksModule';
import { NativeBridgeModule } from './module';
import { ApplicationModule } from './modules/applicationModule';
import { FilesModule } from './modules/filesModule';
import { MainWindowModule } from './modules/mainWindowModule';
import { BnetModule } from './modules/bnetModule';
import { LogsModule } from './modules/logWatcherModule';

export class NativeBridgeRegistry {
  private modules: Map<string, NativeBridgeModule> = new Map<string, NativeBridgeModule>();

  public registerModule(module: NativeBridgeModule): void {
    this.modules.set(module.moduleName, module);
  }

  public startListeners(mainWindow: BrowserWindow): void {
    Array.from(this.modules.values()).forEach((module) => {
      const invokableFuncs = module.getInvokables();
      invokableFuncs.forEach((func) => {
        ipcMain.handle(module.getInvocationKey(func.name), async (_event, ...args) => {
          return await func.invocation(mainWindow, ...args);
        });
      });
      module.onRegistered(mainWindow);
    });
  }
}

export const nativeBridgeRegistry = new NativeBridgeRegistry();

nativeBridgeRegistry.registerModule(new LogsModule());
nativeBridgeRegistry.registerModule(new BnetModule());
nativeBridgeRegistry.registerModule(new FilesModule());
nativeBridgeRegistry.registerModule(new ExternalLinksModule());
nativeBridgeRegistry.registerModule(new MainWindowModule());
nativeBridgeRegistry.registerModule(new ApplicationModule());

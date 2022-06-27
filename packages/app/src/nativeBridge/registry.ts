import { BrowserWindow, ipcMain } from 'electron';

import { ArmoryLinksModule } from './modules/armoryLinksModule';
import { IsMainWindowMaximizedModule } from './modules/isMainWindowMaximizedModule';
import { IsMainWindowMinimizedModule } from './modules/isMainWindowMinimizedModule';
import { MaximizeMainWindowModule } from './modules/maximizeMainWindowModule';
import { MinimizeMainWindowModule } from './modules/minimizeMainWindowModule';
import { NativeBridgeModule } from './module';
import { QuitModule } from './modules/quitModule';
import { FolderSelectModule } from './modules/folderSelectModule';

export class NativeBridgeRegistry {
  private modules: Map<string, NativeBridgeModule> = new Map<string, NativeBridgeModule>();

  public registerModule(module: NativeBridgeModule): void {
    this.modules.set(module.moduleName, module);
  }

  public generateAPIObject(): Object {
    return Object.assign({}, ...Array.from(this.modules.values()).map((module) => module.generateAPIObject()));
  }

  public startListeners(mainWindow: BrowserWindow): void {
    Array.from(this.modules.values()).forEach((module) => {
      const invokableFuncs = module.getInvokables();
      invokableFuncs.forEach((func) => {
        console.log('invokable.ipcMain.handle', func.name);
        ipcMain.handle(`${module.getMessageKey()}:${func.name}`, async (_event, ...args) => {
          return await func.invocation(mainWindow, ...args);
        });
      });
      module.onRegistered(mainWindow);
    });
  }
}

export const nativeBridgeRegistry = new NativeBridgeRegistry();

nativeBridgeRegistry.registerModule(new FolderSelectModule());
nativeBridgeRegistry.registerModule(new ArmoryLinksModule());
nativeBridgeRegistry.registerModule(new MinimizeMainWindowModule());
nativeBridgeRegistry.registerModule(new MaximizeMainWindowModule());
nativeBridgeRegistry.registerModule(new IsMainWindowMinimizedModule());
nativeBridgeRegistry.registerModule(new IsMainWindowMaximizedModule());
nativeBridgeRegistry.registerModule(new QuitModule());

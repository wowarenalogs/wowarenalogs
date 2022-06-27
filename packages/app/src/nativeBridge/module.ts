import { BrowserWindow, ipcRenderer, IpcRendererEvent } from 'electron';

type InvokableFunction = {
  name: string;
  invocation: (mainWindow: BrowserWindow, ...args: any[]) => Promise<any>;
};

export abstract class NativeBridgeModule {
  constructor(public readonly moduleName: string) {}

  public getMessageKey(): string {
    return `wowarenalogs:${this.moduleName}`;
  }

  public generateAPIObject(): Object {
    const moduleApi: Record<string, Object> = {};

    this.getInvokables().forEach((func) => {
      moduleApi[func.name] = (...args: any[]) => {
        return ipcRenderer.invoke(`${this.getMessageKey()}:${func.name}`, ...args);
      };
    });

    this.getListeners().forEach((h) => {
      moduleApi[h] = (callback: (event: IpcRendererEvent, ...args: any[]) => void) => ipcRenderer.on(h, callback);
    });

    return {
      [this.moduleName]: moduleApi,
    };
  }

  /**
   * List of names that will call ipcRenderer.on([name], ...) for your module
   * These will expose callback setters to the renderer api to handle events of name [name]
   */
  public getListeners(): string[] {
    return [];
  }

  /**
   * Callback after module is registered in case any bespoke action is needed
   * Useful for mapping events on the mainWindow into module domain events
   */
  public onRegistered(_mainWindow: BrowserWindow): void {}

  /**
   * List of functions that will be exposed as imperatives on the renderer api
   * the api will use the [name] and execute [invocation]
   */
  public abstract getInvokables(): InvokableFunction[];
}

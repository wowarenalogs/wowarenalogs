import { BrowserWindow, ipcRenderer, IpcRendererEvent } from 'electron';

type InvokableFunction = {
  name: string;
  invocation: (mainWindow: BrowserWindow, ...args: any[]) => Promise<any>;
};

export abstract class NativeBridgeModule {
  constructor(public readonly moduleName: string) {}

  public getModuleKey(): string {
    return `wowarenalogs:${this.moduleName}`;
  }

  public generateAPIObject(): Object {
    const moduleApi: Record<string, Object> = {};

    this.getInvokables().forEach((func) => {
      moduleApi[func.name] = (...args: any[]) => {
        return ipcRenderer.invoke(this.getInvocationKey(func.name), ...args);
      };
    });

    this.getEventNames().forEach((eventName) => {
      moduleApi[eventName] = (callback: (event: IpcRendererEvent, ...args: any[]) => void) =>
        ipcRenderer.on(this.getEventKey(eventName), callback);
    });

    return {
      [this.moduleName]: moduleApi,
    };
  }

  public getInvocationKey(functionName: string) {
    return `${this.getModuleKey()}:${functionName}`;
  }

  public getEventKey(eventName: string): string {
    return `${this.getModuleKey()}:${eventName}`;
  }

  /**
   * Callback after module is registered in case any bespoke action is needed.
   * Useful for mapping events on the mainWindow into module domain events.
   * @param _mainWindow BrowserWindow
   */
  public onRegistered(_mainWindow: BrowserWindow): void {}

  /**
   * List of functions that will be exposed as imperatives on the renderer api
   * the api will use the [name] and execute [invocation]
   */
  public abstract getInvokables(): InvokableFunction[];

  /**
   * Names of events that get triggered via ipcRenderer.on([name], ...) from your module.
   * Renderer side bridge API will have callback setters for handling each of these events.
   */
  public getEventNames(): string[] {
    return [];
  }
}

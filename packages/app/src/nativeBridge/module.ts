import { BrowserWindow, ipcRenderer } from 'electron';

export abstract class NativeBridgeModule {
  constructor(public readonly name: string) {}

  public getMessageKey(): string {
    return `wowarenalogs:${this.name}`;
  }

  public generateAPIObject(): Object {
    return {
      [this.name]: (...args: any[]) => {
        return ipcRenderer.invoke(this.getMessageKey(), ...args);
      },
    };
  }

  public abstract handleMessageAsync(mainWindow: BrowserWindow, ...args: any[]): Promise<any>;
}

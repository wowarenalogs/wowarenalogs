import { BrowserWindow, shell } from 'electron';

import { NativeBridgeModule } from '../module';

export class ExternalLinksModule extends NativeBridgeModule {
  constructor() {
    super('links');
  }

  public async openExternalURL(_mainWindow: BrowserWindow, url: string) {
    // Security ref: https://benjamin-altpeter.de/shell-openexternal-dangers/
    if (typeof url !== 'string') throw new Error('openExternalURL limited to strings');
    if (!url.startsWith('https://')) throw new Error('openExternalURL limited to https protocol');
    return shell.openExternal(url);
  }

  public getInvokables() {
    return [
      {
        name: 'openExternalURL',
        invocation: this.openExternalURL,
      },
    ];
  }
}

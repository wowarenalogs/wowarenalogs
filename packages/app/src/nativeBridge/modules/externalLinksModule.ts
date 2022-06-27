import { BrowserWindow, shell } from 'electron';
import { NativeBridgeModule } from '../module';

export class ExternalLinksModule extends NativeBridgeModule {
  constructor() {
    super('links');
  }

  public async openArmoryLink(
    _mainWindow: BrowserWindow,
    locale: string,
    region: string,
    serverName: string,
    playerName: string,
  ) {
    return shell.openExternal(`https://worldofwarcraft.com/${locale}/character/${region}/${serverName}/${playerName}`);
  }

  public getInvokables() {
    return [
      {
        name: 'openArmoryLink',
        invocation: this.openArmoryLink,
      },
    ];
  }
}

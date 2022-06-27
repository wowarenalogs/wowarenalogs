import { BrowserWindow, shell } from 'electron';
import { NativeBridgeModule } from '../module';

export class ArmoryLinksModule extends NativeBridgeModule {
  constructor() {
    super('oldOpenArmoryLink');
  }

  public async handleMessageAsync(): Promise<void> {}

  public async openArmoryLink(
    mainWindow: BrowserWindow,
    locale: string,
    region: string,
    serverName: string,
    playerName: string,
  ) {
    return shell.openExternal(`https://worldofwarcraft.com/${locale}/character/${region}/${serverName}/${playerName}`);
  }

  public async armoryTestMin(mainWindow: BrowserWindow) {
    mainWindow.minimize();
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

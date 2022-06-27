import { BrowserWindow, shell } from 'electron';
import { NativeBridgeModule } from '../module';

export class ArmoryLinksModule extends NativeBridgeModule {
  constructor() {
    super('openArmoryLink');
  }

  public async handleMessageAsync(
    mainWindow: BrowserWindow,
    locale: string,
    region: string,
    serverName: string,
    playerName: string,
  ): Promise<void> {
    return shell.openExternal(`https://worldofwarcraft.com/${locale}/character/${region}/${serverName}/${playerName}`);
  }
}

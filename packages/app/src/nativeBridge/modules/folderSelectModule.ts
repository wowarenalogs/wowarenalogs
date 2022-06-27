import { BrowserWindow, dialog } from 'electron';
// import { dirname } from 'path';
import { NativeBridgeModule } from '../module';

const folderSelectedEvent = 'handleFolderSelected';

export class FolderSelectModule extends NativeBridgeModule {
  constructor() {
    super('fs');
  }

  public selectFolder(mainWindow: BrowserWindow) {
    const codex = {
      'setup-page-locate-wow-mac': 'test',
      'setup-page-locate-wow-windows': 'test',
      confirm: 'confirm',
      'setup-page-invalid-location': 'test',
      'setup-page-invalid-location-message': 'test',
    };

    return dialog
      .showOpenDialog({
        title:
          process.platform === 'darwin' ? codex['setup-page-locate-wow-mac'] : codex['setup-page-locate-wow-windows'],
        buttonLabel: codex['confirm'],
        properties: ['openFile'],
        filters: [
          {
            name: process.platform === 'darwin' ? 'World of Warcraft.app' : 'Wow.exe, WowClassic.exe',
            extensions: [process.platform === 'darwin' ? 'app' : 'exe'],
          },
        ],
      })
      .then((data) => {
        if (!data.canceled && data.filePaths.length > 0) {
          const wowExePath = data.filePaths[0];
          const wowDirectory = 'C:\\'; //dirname(wowExePath);
          const wowInstallations = []; //DesktopUtils.getWowInstallsFromPath(wowDirectory);
          if (wowInstallations.length > 0) {
            mainWindow.webContents.send(folderSelectedEvent, wowDirectory);
            // DesktopUtils.installAddon(wowInstallations);
          } else {
            dialog.showMessageBox({
              title: codex['setup-page-invalid-location'],
              message: codex['setup-page-invalid-location-message'],
              type: 'error',
            });
          }
          mainWindow.webContents.send(folderSelectedEvent, wowDirectory);
        }
        return data;
      });
  }

  public getInvokables() {
    return [
      {
        name: 'selectFolder',
        invocation: this.selectFolder,
      },
    ];
  }

  public override getListeners() {
    return ['handleFolderSelected'];
  }

  public async onRegistered(mainWindow: BrowserWindow) {
    // TODO: remove example
    mainWindow.on('resize', () => {
      mainWindow.webContents.send('test-resize');
    });
  }
}

import { BrowserWindow, dialog } from 'electron';
// import { dirname } from 'path';
import { NativeBridgeModule } from '../module';

const folderSelected = 'handleFolderSelected';

export class FolderSelectModule extends NativeBridgeModule {
  constructor() {
    super('fs');
  }

  public selectFolder(mainWindow: BrowserWindow) {
    // TODO: Fix codex (inject from renderer)
    const codex = {
      'setup-page-locate-wow-mac': 'test',
      'setup-page-locate-wow-windows': 'test',
      confirm: 'confirm',
      'setup-page-invalid-location': 'test',
      'setup-page-invalid-location-message': 'test',
    };

    const module = this;
    console.log('Creating dialog', module);
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
          console.log('int', this);
          if (wowInstallations.length > 0) {
            // TODO: see note in bnetModule about .send
            mainWindow.webContents.send('wowarenalogs:fs:handleFolderSelected', wowDirectory);
            // DesktopUtils.installAddon(wowInstallations);
          } else {
            dialog.showMessageBox({
              title: codex['setup-page-invalid-location'],
              message: codex['setup-page-invalid-location-message'],
              type: 'error',
            });
          }
          // TODO: see note in bnetModule about .send
          mainWindow.webContents.send('wowarenalogs:fs:handleFolderSelected', wowDirectory);
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
    return [folderSelected];
  }

  public async onRegistered(mainWindow: BrowserWindow) {
    // TODO: remove example
    mainWindow.on('resize', () => {
      mainWindow.webContents.send('test-resize');
    });
  }
}

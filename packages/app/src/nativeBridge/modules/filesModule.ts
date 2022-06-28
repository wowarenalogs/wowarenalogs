import { WowVersion } from '@wowarenalogs/parser';
import { ensureDir, writeFile } from 'fs-extra';
import { BrowserWindow, dialog } from 'electron';
import { join, dirname } from 'path';
import { trim, replace } from 'lodash';
import { NativeBridgeModule } from '../module';
import { DesktopUtils } from '../utils';

const folderSelected = 'handleFolderSelected';

type Codex = {
  ['setup-page-locate-wow-mac']: string;
  ['setup-page-locate-wow-windows']: string;
  ['setup-page-invalid-location']: string;
  ['setup-page-invalid-location-message']: string;
  ['confirm']: string;
};

export class FilesModule extends NativeBridgeModule {
  constructor() {
    super('fs');
  }

  public async selectFolder(mainWindow: BrowserWindow, codex: Codex) {
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
      .then(async (data) => {
        if (!data.canceled && data.filePaths.length > 0) {
          const wowExePath = data.filePaths[0];
          const wowDirectory = dirname(wowExePath);
          const wowInstallations = await DesktopUtils.getWowInstallsFromPath(wowDirectory);

          if (wowInstallations.size > 0) {
            // TODO: see note in bnetModule about .send
            mainWindow.webContents.send('wowarenalogs:fs:handleFolderSelected', wowDirectory);
            for (const [ver, dir] of Array.from(wowInstallations.entries())) {
              this.installAddonToPath(dir, ver);
            }
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

  public getInstallationsFolder(mainWindow: BrowserWindow, path: string) {
    return DesktopUtils.getWowInstallsFromPath(path);
  }

  public async installAddon(mainWindow: BrowserWindow, path: string) {
    const wowInstallations = await DesktopUtils.getWowInstallsFromPath(path);
    for (const [ver, dir] of Array.from(wowInstallations.entries())) {
      this.installAddonToPath(dir, ver);
    }
  }

  private normalizeAddonContent(content: string): string {
    return trim(replace(content, /\r+/g, ''));
  }

  private async installAddonToPath(path: string, version: WowVersion) {
    const remoteAddonTOCResponse = await fetch(`/addon/${version}/WoWArenaLogs.toc`);
    const remoteAddonTOC = await remoteAddonTOCResponse.text();

    const remoteAddonLUAResponse = await fetch(`/addon/${version}/WoWArenaLogs.lua`);
    const remoteAddonLUA = await remoteAddonLUAResponse.text();

    const addonDestPath = join(path, 'Interface/AddOns/WoWArenaLogs');
    await ensureDir(addonDestPath);

    await writeFile(join(addonDestPath, 'WoWArenaLogs.toc'), this.normalizeAddonContent(remoteAddonTOC), {
      encoding: 'utf-8',
    });
    await writeFile(join(addonDestPath, 'WoWArenaLogs.lua'), this.normalizeAddonContent(remoteAddonLUA), {
      encoding: 'utf-8',
    });
  }

  public getInvokables() {
    return [
      {
        name: 'selectFolder',
        invocation: this.selectFolder,
      },
      {
        name: 'getInstallationsFolder',
        invocation: this.getInstallationsFolder,
      },
      {
        name: 'installAddon',
        invocation: this.installAddon,
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

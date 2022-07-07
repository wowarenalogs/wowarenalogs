import { WowVersion } from '@wowarenalogs/parser';
import { BrowserWindow, dialog } from 'electron';
import { ensureDir, writeFileSync } from 'fs-extra';
import { replace, trim } from 'lodash';
import fetch from 'node-fetch';
import { dirname, join } from 'path';

import { NativeBridgeModule } from '../module';
import { DesktopUtils } from '../utils';

type Codex = {
  ['setup-page-locate-wow-mac']: string;
  ['setup-page-locate-wow-windows']: string;
  ['setup-page-invalid-location']: string;
  ['setup-page-invalid-location-message']: string;
  ['confirm']: string;
};

function normalizeAddonContent(content: string): string {
  return trim(replace(content, /\r+/g, ''));
}

async function installAddonToPath(path: string, version: WowVersion) {
  const remoteAddonTOCResponse = await fetch(
    `https://desktop-client.wowarenalogs.com/addon/${version}/WoWArenaLogs.toc`, // TODO: Is static url ok here?
  );
  const remoteAddonTOC = await remoteAddonTOCResponse.text();

  const remoteAddonLUAResponse = await fetch(
    `https://desktop-client.wowarenalogs.com/addon/${version}/WoWArenaLogs.lua`,
  );
  const remoteAddonLUA = await remoteAddonLUAResponse.text();

  const addonDestPath = join(path, 'Interface/AddOns/WoWArenaLogs');
  await ensureDir(addonDestPath);

  writeFileSync(join(addonDestPath, 'WoWArenaLogs.toc'), normalizeAddonContent(remoteAddonTOC), {
    encoding: 'utf-8',
  });
  writeFileSync(join(addonDestPath, 'WoWArenaLogs.lua'), normalizeAddonContent(remoteAddonLUA), {
    encoding: 'utf-8',
  });
}

export class FilesModule extends NativeBridgeModule {
  constructor() {
    super('fs');
  }

  public async selectFolder(mainWindow: BrowserWindow, codex: Codex) {
    return dialog
      .showOpenDialog({
        title:
          process.platform === 'darwin' ? codex['setup-page-locate-wow-mac'] : codex['setup-page-locate-wow-windows'],
        buttonLabel: codex.confirm,
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
            mainWindow.webContents.send('wowarenalogs:fs:folderSelected', wowDirectory);
            for (const [ver, dir] of Array.from(wowInstallations.entries())) {
              installAddonToPath(dir, ver);
            }
          } else {
            dialog.showMessageBox({
              title: codex['setup-page-invalid-location'],
              message: codex['setup-page-invalid-location-message'],
              type: 'error',
            });
          }
          // TODO: see note in bnetModule about .send
          mainWindow.webContents.send('wowarenalogs:fs:folderSelected', wowDirectory);
        }
        return data;
      });
  }

  public getAllWoWInstallations(mainWindow: BrowserWindow, path: string) {
    return DesktopUtils.getWowInstallsFromPath(path);
  }

  public async installAddon(mainWindow: BrowserWindow, path: string) {
    const wowInstallations = await DesktopUtils.getWowInstallsFromPath(path);
    for (const [ver, dir] of Array.from(wowInstallations.entries())) {
      installAddonToPath(dir, ver);
    }
  }

  public getInvokables() {
    return [
      {
        name: 'selectFolder',
        invocation: this.selectFolder,
      },
      {
        name: 'getAllWoWInstallations',
        invocation: this.getAllWoWInstallations,
      },
      {
        name: 'installAddon',
        invocation: this.installAddon,
      },
    ];
  }
}

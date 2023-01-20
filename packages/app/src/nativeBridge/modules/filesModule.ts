import { WowVersion } from '@wowarenalogs/parser';
import { BrowserWindow, dialog } from 'electron';
import { ensureDir, writeFileSync } from 'fs-extra';
import { replace, trim } from 'lodash';
import fetch from 'node-fetch';
import { dirname, join } from 'path';

import { BASE_REMOTE_URL } from '../../constants';
import { moduleFunction, NativeBridgeModule, nativeBridgeModule } from '../module';
import { DesktopUtils } from './common/desktopUtils';

function normalizeAddonContent(content: string): string {
  return trim(replace(content, /\r+/g, ''));
}

async function installAddonToPath(path: string, version: WowVersion) {
  const remoteAddonTOCResponse = await fetch(`${BASE_REMOTE_URL}/addon/${version}/WoWArenaLogs.toc`);
  const remoteAddonTOC = await remoteAddonTOCResponse.text();

  const remoteAddonLUAResponse = await fetch(`${BASE_REMOTE_URL}/addon/${version}/WoWArenaLogs.lua`);
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

@nativeBridgeModule('fs')
export class FilesModule extends NativeBridgeModule {
  @moduleFunction()
  public async selectFolder(_mainWindow: BrowserWindow) {
    const executableName = process.platform === 'darwin' ? 'World of Warcraft.app' : 'Wow.exe';
    const dialogResult = await dialog.showOpenDialog({
      title: `Locate your ${executableName}`,
      buttonLabel: 'Select',
      properties: ['openFile'],
      filters: [
        {
          name: process.platform === 'darwin' ? 'World of Warcraft.app' : 'Wow.exe',
          extensions: [process.platform === 'darwin' ? 'app' : 'exe'],
        },
      ],
    });
    if (!dialogResult.canceled && dialogResult.filePaths.length > 0) {
      const wowExePath = dialogResult.filePaths[0];
      const wowDirectory = dirname(wowExePath);
      const wowInstallations = await DesktopUtils.getWowInstallsFromPath(wowDirectory);
      if (wowInstallations.size > 0) {
        return wowDirectory;
      }

      dialog.showMessageBox({
        title: 'Invalid Location',
        message: `Please select "${executableName}" in a valid World of Warcraft installation.`,
        type: 'error',
      });
    }
    throw new Error('No valid directory selected');
  }

  @moduleFunction()
  public getAllWoWInstallations(_mainWindow: BrowserWindow, path: string) {
    return DesktopUtils.getWowInstallsFromPath(path);
  }

  @moduleFunction()
  public async installAddon(_mainWindow: BrowserWindow, path: string) {
    const wowInstallations = await DesktopUtils.getWowInstallsFromPath(path);
    for (const [ver, dir] of Array.from(wowInstallations.entries())) {
      installAddonToPath(dir, ver);
    }
  }
}

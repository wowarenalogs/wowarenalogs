import { remote } from 'electron';
import { closeSync, ensureDir, existsSync, openSync, readSync, writeFile } from 'fs-extra';
import _ from 'lodash';
import { join } from 'path';
import { WoWCombatLogParser, WowVersion } from 'wow-combat-log-parser';

const chunkParitialsBuffer: Record<string, string> = {};

export class DesktopUtils {
  public static getAllWoWInstallations(path: string): Map<WowVersion, string> {
    const results = new Map<WowVersion, string>();

    const METADATA = [
      {
        version: 'tbc',
        dir: '_classic_',
        macAppFile: 'World of Warcraft Classic.app',
        winAppFile: 'WowClassic.exe',
      },
      {
        version: 'retail',
        dir: '_retail_',
        macAppFile: 'World of Warcraft.app',
        winAppFile: 'Wow.exe',
      },
    ];

    Object.values(METADATA).forEach((metadata) => {
      if (
        ((remote.process.platform === 'darwin' && existsSync(join(path, '..', metadata.dir, metadata.macAppFile))) ||
          (remote.process.platform === 'win32' && existsSync(join(path, '..', metadata.dir, metadata.winAppFile)))) &&
        existsSync(join(path, '..', metadata.dir, 'Interface', 'AddOns'))
      ) {
        results.set(metadata.version as WowVersion, join(path, '..', metadata.dir));
      }
    });

    return results;
  }

  public static async installAddonAsync(wowInstallations: Map<WowVersion, string>): Promise<void> {
    for (const [ver, dir] of Array.from(wowInstallations.entries())) {
      const remoteAddonTOCResponse = await fetch(`/addon/${ver}/WoWArenaLogs.toc`);
      const remoteAddonTOC = await remoteAddonTOCResponse.text();

      const remoteAddonLUAResponse = await fetch(`/addon/${ver}/WoWArenaLogs.lua`);
      const remoteAddonLUA = await remoteAddonLUAResponse.text();

      const addonDestPath = join(dir, 'Interface/AddOns/WoWArenaLogs');
      await ensureDir(addonDestPath);

      await writeFile(join(addonDestPath, 'WoWArenaLogs.toc'), DesktopUtils.normalizeAddonContent(remoteAddonTOC), {
        encoding: 'utf-8',
      });
      await writeFile(join(addonDestPath, 'WoWArenaLogs.lua'), DesktopUtils.normalizeAddonContent(remoteAddonLUA), {
        encoding: 'utf-8',
      });
    }
  }

  private static normalizeAddonContent(content: string): string {
    return _.trim(_.replace(content, /\r+/g, ''));
  }

  public static parseLogFileChunk(parser: WoWCombatLogParser, path: string, start: number, size: number): void {
    if (size <= 0) {
      return;
    }

    const fd = openSync(path, 'r');
    const buffer = Buffer.alloc(size);
    readSync(fd, buffer, 0, size, start);
    closeSync(fd);

    let bufferString = buffer.toString('utf-8');
    // Was there a partial line left over from a previous call?
    if (chunkParitialsBuffer[path]) {
      bufferString = chunkParitialsBuffer[path] + bufferString;
    }

    const lines = bufferString.split('\n');
    lines.forEach((line, idx) => {
      if (idx === lines.length - 1) {
        if (line.length > 0) {
          chunkParitialsBuffer[path] = line;
        }
      } else {
        parser.parseLine(line);
      }
    });
  }
}

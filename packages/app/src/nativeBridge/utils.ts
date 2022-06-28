import { WoWCombatLogParser, WowVersion } from '@wowarenalogs/parser';
import { join } from 'path';
import { close, existsSync, open, read } from 'fs-extra';

const chunkParitialsBuffer: Record<string, string> = {};

export class DesktopUtils {
  public static async getWowInstallsFromPath(path: string) {
    const results = new Map<WowVersion, string>();
    const platform = process.platform;

    const METADATA = [
      {
        version: 'tbc',
        dir: '_classic_',
        macAppFile: 'World of Warcraft Classic.app',
        winAppFile: 'WowClassic.exe',
      },
      {
        version: 'shadowlands',
        dir: '_retail_',
        macAppFile: 'World of Warcraft.app',
        winAppFile: 'Wow.exe',
      },
    ];

    Object.values(METADATA).forEach(async (metadata) => {
      if (
        ((platform === 'darwin' && existsSync(join(path, '..', metadata.dir, metadata.macAppFile))) ||
          (platform === 'win32' && existsSync(join(path, '..', metadata.dir, metadata.winAppFile)))) &&
        existsSync(join(path, '..', metadata.dir, 'Interface', 'AddOns'))
      ) {
        results.set(metadata.version as WowVersion, join(path, '..', metadata.dir));
      }
    });
    return Promise.resolve(results);
  }

  public static async parseLogFileChunk(parser: WoWCombatLogParser, path: string, start: number, size: number) {
    if (size <= 0) {
      return;
    }
    const fd = await open(path, 'r');
    const buffer = Buffer.alloc(size);
    await read(fd, buffer, 0, size, start);
    await close(fd);
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

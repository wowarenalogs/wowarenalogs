import { WoWCombatLogParser, WowVersion } from '@wowarenalogs/parser';
import { closeSync, existsSync, openSync, readSync } from 'fs-extra';
import { join } from 'path';
import { StringDecoder } from 'string_decoder';

const NEWLINE = 0x0a;

export class DesktopUtils {
  public static async getWowInstallsFromPath(path: string) {
    const results = new Map<WowVersion, string>();
    const platform = process.platform;

    const METADATA = [
      {
        version: 'retail',
        dir: '_retail_',
        macAppFile: 'World of Warcraft.app',
        winAppFile: 'Wow.exe',
      },
    ];

    Object.values(METADATA).forEach(async (metadata) => {
      if (
        ((platform === 'darwin' && existsSync(join(path, '..', metadata.dir, metadata.macAppFile))) ||
          ((platform === 'win32' || platform === 'linux') && // WoW can run on linux in a simulated windows environment
            existsSync(join(path, '..', metadata.dir, metadata.winAppFile)))) &&
        existsSync(join(path, '..', metadata.dir, 'Interface', 'AddOns'))
      ) {
        results.set(metadata.version as WowVersion, join(path, '..', metadata.dir));
      }
    });
    return Promise.resolve(results);
  }

  public static parseLogFile(parser: WoWCombatLogParser, path: string) {
    const CHUNK_SIZE = 16 * 1024 * 1024;
    try {
      const fd = openSync(path, 'r');
      try {
        const buffer = Buffer.alloc(CHUNK_SIZE);
        const decoder = new StringDecoder('utf-8');
        let partialLine = '';
        let bytesRead = 0;
        while ((bytesRead = readSync(fd, buffer, 0, CHUNK_SIZE, null)) > 0) {
          const lines = (partialLine + decoder.write(buffer.subarray(0, bytesRead))).split('\n');
          partialLine = lines.pop() ?? '';
          lines.forEach((line) => {
            parser.parseLine(line);
          });
        }
        partialLine += decoder.end();
        if (partialLine.length > 0) {
          parser.parseLine(partialLine);
        }
      } finally {
        closeSync(fd);
      }
    } catch (_e) {
      // TODO: try to come up with some strategy to avoid these
      // Can reproduce by copy+pasting a new log file into wow folder while logger is watching (win32)
      // There are still some transient bugs
      // https://stackoverflow.com/questions/1764809/filesystemwatcher-changed-event-is-raised-twice
      return false;
    }
    return true;
  }

  public static parseLogFileChunk(parser: WoWCombatLogParser, path: string, start: number, size: number) {
    if (size <= 0) {
      return 0;
    }
    try {
      const fd = openSync(path, 'r');
      const buffer = Buffer.alloc(size);
      const bytesRead = readSync(fd, buffer, 0, size, start);
      closeSync(fd);

      const lastNewline = bytesRead > 0 ? buffer.lastIndexOf(NEWLINE, bytesRead - 1) : -1;
      if (lastNewline < 0) {
        return 0;
      }

      // Cutting on a newline keeps multi-byte characters intact across the boundary.
      buffer
        .subarray(0, lastNewline)
        .toString('utf-8')
        .split('\n')
        .forEach((line) => {
          parser.parseLine(line);
        });

      return lastNewline + 1;
    } catch (_e) {
      // TODO: try to come up with some strategy to avoid these
      // Can reproduce by copy+pasting a new log file into wow folder while logger is watching (win32)
      // There are still some transient bugs
      // https://stackoverflow.com/questions/1764809/filesystemwatcher-changed-event-is-raised-twice
      return null;
    }
  }
}

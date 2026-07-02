import { WoWCombatLogParser, WowVersion } from '@wowarenalogs/parser';
import { closeSync, existsSync, openSync, readFileSync, readSync } from 'fs-extra';
import { join } from 'path';

const chunkParitialsBuffer: Record<string, string> = {};

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
    try {
      const fd = openSync(path, 'r');
      const buffer = readFileSync(fd);
      closeSync(fd);
      const bufferString = buffer.toString('utf-8');

      const lines = bufferString.split('\n');
      lines.forEach((line) => {
        parser.parseLine(line);
      });
    } catch (_e) {
      // TODO: try to come up with some strategy to avoid these
      // Can reproduce by copy+pasting a new log file into wow folder while logger is watching (win32)
      // There are still some transient bugs
      // https://stackoverflow.com/questions/1764809/filesystemwatcher-changed-event-is-raised-twice
      return false;
    }
    return true;
  }

  // Discard any buffered partial line for this path. Used when a log file is replaced or
  // truncated (new-file-reset): a fragment held over from the old file's contents must not
  // be glued onto the first chunk of the new one.
  public static resetChunkPartials(path: string) {
    delete chunkParitialsBuffer[path];
  }

  public static parseLogFileChunk(parser: WoWCombatLogParser, path: string, start: number, size: number) {
    if (size <= 0) {
      return true;
    }
    try {
      const fd = openSync(path, 'r');
      const buffer = Buffer.alloc(size);
      readSync(fd, buffer, 0, size, start);
      closeSync(fd);
      let bufferString = buffer.toString('utf-8');
      // Was there a partial line left over from a previous call?
      // Clearing it here matters: it's only re-stored below if THIS chunk also ends
      // mid-line. Without the clear, a chunk ending exactly on a newline leaves the
      // already-consumed fragment behind, and it gets glued onto the front of every
      // later chunk - corrupting one real line per read (and, before parse errors were
      // made non-fatal, killing the whole parser pipeline mid-session).
      if (chunkParitialsBuffer[path]) {
        bufferString = chunkParitialsBuffer[path] + bufferString;
        delete chunkParitialsBuffer[path];
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
    } catch (_e) {
      // TODO: try to come up with some strategy to avoid these
      // Can reproduce by copy+pasting a new log file into wow folder while logger is watching (win32)
      // There are still some transient bugs
      // https://stackoverflow.com/questions/1764809/filesystemwatcher-changed-event-is-raised-twice
      return false;
    }
    return true;
  }
}

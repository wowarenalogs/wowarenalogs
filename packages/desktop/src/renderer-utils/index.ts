// import { closeSync, ensureDir, existsSync, openSync, readSync, writeFile } from 'fs-extra';
import _ from 'lodash';
// import { join } from 'path';
import { WoWCombatLogParser, WowVersion } from 'wow-combat-log-parser';

const chunkParitialsBuffer: Record<string, string> = {};

export class DesktopUtils {
  public static getAllWoWInstallations(path: string, platform: string): Map<WowVersion, string> {
    const results = new Map<WowVersion, string>();

    // const METADATA = [
    //   {
    //     version: 'tbc',
    //     dir: '_classic_',
    //     macAppFile: 'World of Warcraft Classic.app',
    //     winAppFile: 'WowClassic.exe',
    //   },
    //   {
    //     version: 'shadowlands',
    //     dir: '_retail_',
    //     macAppFile: 'World of Warcraft.app',
    //     winAppFile: 'Wow.exe',
    //   },
    // ];

    // Object.values(METADATA).forEach((metadata) => {
    //   if (
    //     ((platform === 'darwin' && existsSync(join(path, '..', metadata.dir, metadata.macAppFile))) ||
    //       (platform === 'win32' && existsSync(join(path, '..', metadata.dir, metadata.winAppFile)))) &&
    //     existsSync(join(path, '..', metadata.dir, 'Interface', 'AddOns'))
    //   ) {
    //     results.set(metadata.version as WowVersion, join(path, '..', metadata.dir));
    //   }
    // });

    return results;
  }
}

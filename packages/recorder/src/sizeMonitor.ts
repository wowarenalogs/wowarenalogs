import { BrowserWindow } from 'electron';

import ConfigService from './configService';
import { FileInfo } from './types';
import { deleteVideo, getMetadataForVideo, getSortedVideos } from './util';

// Had a bug here where we used filter with an async function but that isn't
// valid as it just returns a truthy promise. See issue 323. To get around
// this we do some creative stuff from here:
// https://advancedweb.hu/how-to-use-async-functions-with-array-filter-in-javascript/
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asyncFilter = async (fileStream: FileInfo[], filter: any) => {
  const results = await Promise.all(fileStream.map(filter));
  return fileStream.filter((_, index) => results[index]);
};

export default class SizeMonitor {
  private cfg = ConfigService.getInstance();

  private mainWindow: BrowserWindow;

  public static logger: Console = console;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  async run() {
    // Config might have changed, so update the limit and path.
    const storageDir = this.cfg.get<string>('storagePath');
    const maxStorageGB = this.cfg.get<number>('maxStorage');
    const maxStorageBytes = maxStorageGB * 1024 ** 3;

    SizeMonitor.logger.info('[SizeMonitor] Running, size limit is', maxStorageGB, 'GB');

    if (maxStorageGB === 0) {
      SizeMonitor.logger.info('[SizeMonitor] Limitless storage, doing nothing');
      return;
    }

    const files = await getSortedVideos(storageDir);

    const unprotectedFiles = await asyncFilter(files, async (file: FileInfo) => {
      try {
        const metadata = await getMetadataForVideo(file.name);
        const isUnprotected = !(metadata.protected || false);

        if (!isUnprotected) {
          SizeMonitor.logger.info('[SizeMonitor] Will not delete protected video', file.name);
        }

        return isUnprotected;
      } catch {
        SizeMonitor.logger.error('[SizeMonitor] Failed to get metadata for', file.name);
        await deleteVideo(file.name, SizeMonitor.logger);
        return false;
      }
    });

    let totalVideoFileSize = 0;

    const filesForDeletion = unprotectedFiles.filter((file) => {
      totalVideoFileSize += file.size;
      return totalVideoFileSize > maxStorageBytes;
    });

    SizeMonitor.logger.info(`[SizeMonitor] Deleting ${filesForDeletion.length} old video(s)`);

    await Promise.all(
      filesForDeletion.map(async (file) => {
        await deleteVideo(file.name, SizeMonitor.logger);
      }),
    );

    this.mainWindow.webContents.send('refreshState');
  }
}

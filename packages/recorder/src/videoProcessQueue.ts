import { spawn } from 'child_process';
import { existsSync } from 'fs-extra';
import path from 'path';

// import SizeMonitor from './sizeMonitor';
import ConfigService from './configService';
import { ManagerMessageBus } from './messageBus';
import { ILogger, VideoQueueItem } from './types';
import { getNoobsDistPath, getThumbnailFileNameForVideo, tryUnlink, writeMetadataFile } from './util';

const getFfmpegPath = () => path.join(getNoobsDistPath(), 'bin', 'ffmpeg.exe');

export default class VideoProcessQueue {
  private messageBus: ManagerMessageBus;
  // TODO: MIGHTFIX re-implement some kind of queue for processing
  // private videoQueue: any;

  // private mainWindow: BrowserWindow;

  public static logger: ILogger = console;

  private cfg = ConfigService.getInstance();

  constructor(bus: ManagerMessageBus) {
    this.messageBus = bus;
    const ffmpegPath = getFfmpegPath();
    if (!existsSync(ffmpegPath)) {
      throw new Error(`Could not find ffmpeg at ${ffmpegPath}`);
    }
    this.setupVideoProcessingQueue();
  }

  private async setupVideoProcessingQueue() {
    // const worker = this.processVideoQueueItem.bind(this);
    // const settings = { concurrency: 1 };
    // this.videoQueue = atomicQueue(worker, settings);
    // /* eslint-disable prettier/prettier */
    // this.videoQueue.on('error', VideoProcessQueue.errorProcessingVideo).on('idle', () => {
    //   this.videoQueueEmpty();
    // });
    // this.videoQueue.pool
    //   .on('start', (data: VideoQueueItem) => {
    //     this.startedProcessingVideo(data);
    //   })
    //   .on('finish', (_: unknown, data: VideoQueueItem) => {
    //     this.finishProcessingVideo(data);
    //   });
    /* eslint-enable prettier/prettier */
  }

  queueVideo = async (queueItem: VideoQueueItem) => {
    VideoProcessQueue.logger.info(`[VideoProcessQueue] Queuing video for processing ${queueItem}`);
    this.processVideoQueueItem(queueItem, () => {
      VideoProcessQueue.logger.info(`[VideoProcessQueue] Queue processed ${queueItem.filename}`);
    });
  };

  private async processVideoQueueItem(data: VideoQueueItem, done: () => void): Promise<void> {
    const minDuration = this.cfg.get<number>('minActivityDuration');

    if (data.duration < minDuration) {
      VideoProcessQueue.logger.info(
        `[VideoProcessQueue] Activity ${data.filename} lasting ${data.duration}s was too short, discarding`,
      );
      done();
      return;
    }

    VideoProcessQueue.logger.info(`[VideoProcessQueue] Processing bufferFile=${data.bufferFile}`);
    VideoProcessQueue.logger.info(`[VideoProcessQueue] Output dir=${this.cfg.get<string>('storagePath')}`);
    VideoProcessQueue.logMediaDuration('[VideoProcessQueue] Buffer duration', data.bufferFile);
    VideoProcessQueue.logger.info(
      `[VideoProcessQueue] Cut params start=${data.relativeStart}s duration=${data.duration}s filename=${data.filename}`,
    );

    const videoPath = await VideoProcessQueue.cutVideo(
      data.bufferFile,
      this.cfg.get<string>('storagePath'),
      data.filename,
      data.relativeStart,
      data.duration,
    );
    VideoProcessQueue.logger.info(`[VideoProcessQueue] Cut complete -> ${videoPath}`);
    VideoProcessQueue.logMediaDuration('[VideoProcessQueue] Cut duration', videoPath);

    try {
      const compensation = await VideoProcessQueue.calculateFrameCompensation(data.bufferFile, data.relativeStart);
      VideoProcessQueue.logger.info(`[VideoProcssQueue] Cut video compensation time: ${compensation}`);
      data.compensationTimeSeconds = compensation;
    } catch (error) {
      VideoProcessQueue.logger.info(`[VideoProcessingQueue] ffprobe error ${error}`);
      data.compensationTimeSeconds = 0;
    }

    if (data.metadata) {
      VideoProcessQueue.logger.info(`[Util] Write Metadata file: ${videoPath}`);
      await writeMetadataFile(videoPath, data);
    }
    await tryUnlink(data.bufferFile, VideoProcessQueue.logger);

    await VideoProcessQueue.getThumbnail(videoPath);

    this.messageBus.emit('video-written', data);
    done();
  }

  // private static errorProcessingVideo(err: any) {
  //   VideoProcessQueue.logger.error('[VideoProcessQueue] Error processing video', err);
  // }

  // private startedProcessingVideo(data: VideoQueueItem) {
  //   VideoProcessQueue.logger.info('[VideoProcessQueue] Now processing video', data.bufferFile);
  //   this.mainWindow.webContents.send('updateSaveStatus', SaveStatus.Saving);
  // }

  // private finishProcessingVideo(data: VideoQueueItem) {
  //   VideoProcessQueue.logger.info('[VideoProcessQueue] Finished processing video', data.bufferFile);

  //   this.mainWindow.webContents.send('updateSaveStatus', SaveStatus.NotSaving);
  //   this.mainWindow.webContents.send('refreshState');
  // }

  // private async videoQueueEmpty() {
  //   VideoProcessQueue.logger.info('[VideoProcessQueue] Video processing queue empty');
  //   new SizeMonitor(this.mainWindow).run();
  // }

  /**
   * Sanitize a filename and replace all invalid characters with a space.
   *
   * Multiple consecutive invalid characters will be replaced by a single space.
   * Multiple consecutive spaces will be replaced by a single space.
   */
  private static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/|?*]/g, ' ') // Replace all invalid characters with space
      .replace(/ +/g, ' '); // Replace multiple spaces with a single space
  }

  private static async calculateFrameCompensation(initialFile: string, relativeStart: number): Promise<number> {
    const ffprobePath = path.join(getNoobsDistPath(), 'bin', 'ffprobe.exe');
    const args = [
      '-skip_frame',
      'nokey',
      '-read_intervals',
      `%+${relativeStart}`,
      '-select_streams',
      'v:0',
      '-show_frames',
      '-v',
      'quiet',
      '-print_format',
      'ini',
      initialFile,
    ];
    VideoProcessQueue.logger.info(`[VideoProcessQueue] ffprobe ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      const proc = spawn(ffprobePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      proc.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe exited ${code}: ${stderr || stdout}`));
          return;
        }
        const lastTimestamp = VideoProcessQueue.parseLastFrameTimestamp(stdout);
        if (lastTimestamp === null) {
          reject(new Error(`Could not find frame data from ffprobe on ${initialFile}`));
          return;
        }
        resolve(relativeStart - lastTimestamp);
      });
      proc.on('error', reject);
    });
  }

  /**
   * Parse ffprobe -show_frames INI output and return best_effort_timestamp_time of the last frame (seconds).
   */
  private static parseLastFrameTimestamp(stdout: string): number | null {
    const frames: number[] = [];
    const block = /\[FRAME\]([\s\S]*?)(?=\[FRAME\]|$)/gi;
    let m: RegExpExecArray | null;
    while ((m = block.exec(stdout)) !== null) {
      const section = m[1];
      const timeMatch = section.match(/best_effort_timestamp_time=([\d.]+)/i);
      if (timeMatch) {
        frames.push(parseFloat(timeMatch[1]));
      }
    }
    const last = frames[frames.length - 1];
    return last !== undefined ? last : null;
  }

  /**
   * Takes an input video file, trims from relativeStart for desiredDuration seconds.
   * Uses stream copy (no re-encode). See:
   * https://superuser.com/questions/377343/cut-part-from-video-file-from-start-position-to-end-position-with-ffmpeg
   * https://superuser.com/questions/1167958/video-cut-with-missing-frames-in-ffmpeg?rq=1
   */
  private static async cutVideo(
    initialFile: string,
    finalDir: string,
    outputFilename: string | undefined,
    relativeStart: number,
    desiredDuration: number,
  ): Promise<string> {
    const videoFileName = path.basename(initialFile, path.extname(initialFile));
    const videoFilenameSuffix = outputFilename ? ` - ${outputFilename}` : '';
    const baseVideoFilename = VideoProcessQueue.sanitizeFilename(videoFileName + videoFilenameSuffix);
    const finalVideoPath = path.join(finalDir, `${baseVideoFilename}.mp4`);

    if (relativeStart < 0) {
      VideoProcessQueue.logger.info(`[VideoProcessQueue] Avoiding error by rejecting negative start: ${relativeStart}`);
      relativeStart = 0;
    }

    const ffmpegPath = getFfmpegPath();

    VideoProcessQueue.logger.info(
      `[VideoProcessQueue] ffmpeg cut ${initialFile} -> ${finalVideoPath} -ss ${relativeStart} -t ${desiredDuration}`,
    );

    const args = [
      '-y',
      '-i',
      initialFile,
      '-ss',
      relativeStart.toString(),
      '-t',
      desiredDuration.toString(),
      '-copyts',
      '-start_at_zero',
      '-fflags',
      '+genpts',
      '-c:v',
      'copy',
      '-c:a',
      'copy',
      '-movflags',
      '+faststart',
      finalVideoPath,
    ];

    return new Promise<string>((resolve, reject) => {
      const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      proc.on('close', (code) => {
        if (code === 0) {
          VideoProcessQueue.logger.info('[VideoProcessQueue] FFmpeg cut video succeeded');
          resolve(finalVideoPath);
        } else {
          VideoProcessQueue.logger.error(`[VideoProcessQueue] FFmpeg cut failed code=${code}: ${stderr}`);
          reject(new Error(`FFmpeg cut failed with code ${code}`));
        }
      });
      proc.on('error', (err) => {
        VideoProcessQueue.logger.error(`[VideoProcessQueue] FFmpeg spawn error: ${err}`);
        reject(err);
      });
    });
  }

  private static logMediaDuration(label: string, mediaPath: string) {
    const ffmpegPath = getFfmpegPath();
    const args = ['-hide_banner', '-i', mediaPath];

    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('close', () => {
      const match = stderr.match(/Duration:\s+(\d{2}:\d{2}:\d{2}\.\d+)/);
      if (match) {
        VideoProcessQueue.logger.info(`${label} ${match[1]} for ${mediaPath}`);
      } else {
        VideoProcessQueue.logger.info(`${label} unavailable for ${mediaPath}`);
      }
    });
  }

  /**
   * Takes an input video file and writes a screenshot at the start (0s) to disk.
   */
  private static async getThumbnail(video: string): Promise<void> {
    const thumbnailPath = getThumbnailFileNameForVideo(video);
    const ffmpegPath = getFfmpegPath();
    const args = ['-y', '-i', video, '-ss', '0', '-vframes', '1', '-f', 'image2', thumbnailPath];

    return new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      proc.on('close', (code) => {
        if (code === 0) {
          VideoProcessQueue.logger.info(`[VideoProcessQueue] Got thumbnail for ${video}`);
          resolve();
        } else {
          VideoProcessQueue.logger.error(
            `[VideoProcessQueue] Error getting thumbnail for video=${video} code=${code}: ${stderr}`,
          );
          reject(new Error(`FFmpeg thumbnail failed with code ${code}`));
        }
      });
      proc.on('error', reject);
    });
  }
}

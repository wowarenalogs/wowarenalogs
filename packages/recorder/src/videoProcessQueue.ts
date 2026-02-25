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
    const bufferDurationSeconds = await VideoProcessQueue.getMediaDurationSeconds(data.bufferFile);
    if (bufferDurationSeconds !== null) {
      data.recordingBufferDurationSeconds = bufferDurationSeconds;
      VideoProcessQueue.logger.info(
        `[VideoProcessQueue] Buffer duration ${bufferDurationSeconds.toFixed(2)}s for ${data.bufferFile}`,
      );
      if (data.recordingStopWallClockMs !== undefined) {
        data.recordingBufferStartWallClockMs = Math.round(
          data.recordingStopWallClockMs - bufferDurationSeconds * 1000,
        );
      }
    } else {
      VideoProcessQueue.logMediaDuration('[VideoProcessQueue] Buffer duration', data.bufferFile);
    }
    VideoProcessQueue.logger.info(
      `[VideoProcessQueue] Cut params start=${data.relativeStart}s duration=${data.duration}s filename=${data.filename}`,
    );

    const cutResult = await VideoProcessQueue.cutVideo(
      data.bufferFile,
      this.cfg.get<string>('storagePath'),
      data.filename,
      data.relativeStart,
      data.duration,
    );
    const videoPath = cutResult.path;
    VideoProcessQueue.logger.info(`[VideoProcessQueue] Cut complete -> ${videoPath}`);
    VideoProcessQueue.logMediaDuration('[VideoProcessQueue] Cut duration', videoPath);
    const compensation = data.relativeStart - cutResult.startForCut;
    data.compensationTimeSeconds = Number.isFinite(compensation) ? compensation : 0;
    VideoProcessQueue.logger.info(`[VideoProcessQueue] Cut compensation=${data.compensationTimeSeconds}s`);
    data.recordingCutStartSeconds = cutResult.startForCut;
    try {
      const firstKeyframeTimeSeconds = await VideoProcessQueue.getFirstKeyframeTimeSeconds(videoPath);
      if (firstKeyframeTimeSeconds !== null) {
        data.recordingFirstKeyframeTimeSeconds = firstKeyframeTimeSeconds;
        let bufferStartMs: number | null = data.recordingBufferStartWallClockMs ?? null;
        if (
          bufferStartMs === null &&
          data.recordingStartWallClockMs !== undefined &&
          data.recordingBacktrackRequestedSeconds !== undefined
        ) {
          bufferStartMs = data.recordingStartWallClockMs - data.recordingBacktrackRequestedSeconds * 1000;
        } else if (
          data.recordingStartWallClockMs !== undefined &&
          data.recordingBacktrackRequestedSeconds !== undefined
        ) {
          bufferStartMs = data.recordingStartWallClockMs - data.recordingBacktrackRequestedSeconds * 1000;
        }

        if (bufferStartMs !== null) {
          if (data.recordingBufferStartWallClockMs === undefined) {
            data.recordingBufferStartWallClockMs = Math.round(bufferStartMs);
          }
          data.recordingFirstKeyframeWallClockMs = Math.round(
            bufferStartMs + (cutResult.startForCut + firstKeyframeTimeSeconds) * 1000,
          );
        }
      }
    } catch (error) {
      VideoProcessQueue.logger.info(`[VideoProcessQueue] ffprobe error ${error}`);
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
  ): Promise<{ path: string; startForCut: number }> {
    const videoFileName = path.basename(initialFile, path.extname(initialFile));
    const videoFilenameSuffix = outputFilename ? ` - ${outputFilename}` : '';
    const baseVideoFilename = VideoProcessQueue.sanitizeFilename(videoFileName + videoFilenameSuffix);
    const finalVideoPath = path.join(finalDir, `${baseVideoFilename}.mp4`);

    if (relativeStart < 0) {
      VideoProcessQueue.logger.info(`[VideoProcessQueue] Avoiding error by rejecting negative start: ${relativeStart}`);
      relativeStart = 0;
    }

    const ffmpegPath = getFfmpegPath();

    const keyframeStart = await VideoProcessQueue.findNearestKeyframeStart(initialFile, relativeStart);
    const startForCut = keyframeStart ?? relativeStart;
    const durationForCut = Math.max(0, desiredDuration + (relativeStart - startForCut));
    VideoProcessQueue.logger.info(
      `[VideoProcessQueue] Keyframe snap requested=${relativeStart}s chosen=${startForCut}s duration=${durationForCut}s`,
    );

    VideoProcessQueue.logger.info(
      `[VideoProcessQueue] ffmpeg cut ${initialFile} -> ${finalVideoPath} -ss ${startForCut} -t ${durationForCut}`,
    );

    const args = [
      '-y',
      '-ss',
      startForCut.toString(),
      '-i',
      initialFile,
      '-t',
      durationForCut.toString(),
      '-c:v',
      'copy',
      '-c:a',
      'copy',
      '-avoid_negative_ts',
      'make_zero',
      '-movflags',
      '+faststart',
      finalVideoPath,
    ];

    return new Promise<{ path: string; startForCut: number }>((resolve, reject) => {
      const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      proc.on('close', (code) => {
        if (code === 0) {
          VideoProcessQueue.logger.info('[VideoProcessQueue] FFmpeg cut video succeeded');
          resolve({ path: finalVideoPath, startForCut });
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

  private static async getFirstKeyframeTimeSeconds(videoPath: string): Promise<number | null> {
    const ffprobePath = path.join(getNoobsDistPath(), 'bin', 'ffprobe.exe');
    const args = [
      '-skip_frame',
      'nokey',
      '-select_streams',
      'v:0',
      '-show_frames',
      '-v',
      'quiet',
      '-print_format',
      'ini',
      videoPath,
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
        const firstTimestamp = VideoProcessQueue.parseFirstFrameTimestamp(stdout);
        resolve(firstTimestamp);
      });
      proc.on('error', reject);
    });
  }

  /**
   * Parse ffprobe -show_frames INI output and return best_effort_timestamp_time of the first frame (seconds).
   */
  private static parseFirstFrameTimestamp(stdout: string): number | null {
    const block = /\[FRAME\]([\s\S]*?)(?=\[FRAME\]|$)/gi;
    const m = block.exec(stdout);
    if (!m) return null;
    const section = m[1];
    const timeMatch = section.match(/best_effort_timestamp_time=([\d.]+)/i);
    if (!timeMatch) return null;
    return parseFloat(timeMatch[1]);
  }

  private static async findNearestKeyframeStart(initialFile: string, relativeStart: number): Promise<number | null> {
    const safeStart = Math.max(0, relativeStart);
    const ffprobePath = path.join(getNoobsDistPath(), 'bin', 'ffprobe.exe');
    const args = [
      '-skip_frame',
      'nokey',
      '-select_streams',
      'v:0',
      '-show_frames',
      '-show_entries',
      'frame=best_effort_timestamp_time',
      '-print_format',
      'csv',
      initialFile,
    ];

    return new Promise((resolve) => {
      const proc = spawn(ffprobePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      proc.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      proc.on('close', () => {
        const times: number[] = [];
        stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && line.startsWith('frame,'))
          .forEach((line) => {
            const parts = line.split(',');
            const ts = parts[parts.length - 1];
            const val = ts ? parseFloat(ts) : NaN;
            if (!Number.isNaN(val)) times.push(val);
          });
        if (times.length === 0) {
          resolve(null);
          return;
        }
        const candidate = times.filter((t) => t <= safeStart).pop();
        resolve(candidate ?? times[0] ?? null);
      });
      proc.on('error', () => resolve(null));
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

  private static async getMediaDurationSeconds(mediaPath: string): Promise<number | null> {
    const ffprobePath = path.join(getNoobsDistPath(), 'bin', 'ffprobe.exe');
    const args = [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      mediaPath,
    ];

    return new Promise((resolve) => {
      const proc = spawn(ffprobePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      proc.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      proc.on('close', (code) => {
        if (code !== 0) {
          resolve(null);
          return;
        }
        const trimmed = stdout.trim();
        const val = trimmed ? parseFloat(trimmed) : NaN;
        resolve(Number.isFinite(val) ? val : null);
      });
      proc.on('error', () => resolve(null));
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

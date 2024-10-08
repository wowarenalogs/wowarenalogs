import { ffprobe, FfprobeData } from 'fluent-ffmpeg';
import { existsSync } from 'fs-extra';
import path from 'path';

// import SizeMonitor from './sizeMonitor';
import ConfigService from './configService';
import { ManagerMessageBus } from './messageBus';
import { ILogger, VideoQueueItem } from './types';
import { fixPathWhenPackaged, getThumbnailFileNameForVideo, tryUnlink, writeMetadataFile } from './util';

let ffmpeg: typeof import('fluent-ffmpeg');

export default class VideoProcessQueue {
  private messageBus: ManagerMessageBus;
  // TODO: MIGHTFIX re-implement some kind of queue for processing
  // private videoQueue: any;

  // private mainWindow: BrowserWindow;

  public static logger: ILogger = console;

  private cfg = ConfigService.getInstance();

  static async LoadFFMpegLibraries() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ffmpeg = (await import('fluent-ffmpeg')).default;
  }

  constructor(bus: ManagerMessageBus) {
    this.messageBus = bus;
    const ffmpegPath = fixPathWhenPackaged(path.join(__dirname, 'lib', 'obs-studio-node', 'ffmpeg.exe'));

    ffmpeg.setFfmpegPath(ffmpegPath);
    const ffmpegOK = existsSync(ffmpegPath);
    if (!ffmpegOK) throw new Error(`Could not find ffmpeg at ${ffmpegPath}`);

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

    const videoPath = await VideoProcessQueue.cutVideo(
      data.bufferFile,
      this.cfg.get<string>('storagePath'),
      data.filename,
      data.relativeStart,
      data.duration,
    );

    try {
      const compensation = await VideoProcessQueue.calculateFrameCompensation(data.bufferFile, data.relativeStart);
      VideoProcessQueue.logger.info(`[VideoProcssQueue] Cut video compensation time: ${compensation}`);
      data.compensationTimeSeconds = compensation;
    } catch (error) {
      VideoProcessQueue.logger.info(`[VideoProcessingQueue] ffprobe error ${error}`);
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
    return new Promise((resolve, reject) => {
      VideoProcessQueue.logger.info(
        `[VideoProcessQueue] ffprobe ['-skip_frame', 'nokey', '-read_intervals', %+${relativeStart}, '-select_streams', 'v:0', '-show_frames']`,
      );
      ffprobe(
        initialFile,
        ['-skip_frame', 'nokey', '-read_intervals', `%+${relativeStart}`, '-select_streams', 'v:0', '-show_frames'],
        (error, data) => {
          if (error) {
            reject(error);
          } else {
            const shimmedData = data as FfprobeData & {
              frames: { key_frame: number; best_effort_timestamp_time: number }[];
            };
            if (!shimmedData.frames || shimmedData.frames.length === 0) {
              reject(`Could not find frame data from ffprobe on ${initialFile}`);
            } else {
              resolve(relativeStart - shimmedData.frames[shimmedData.frames.length - 1].best_effort_timestamp_time);
            }
          }
        },
      );
    });
  }

  /**
   * Takes an input MP4 file, trims the footage from the start of the video so
   * that the output is desiredDuration seconds. Some ugly async/await stuff
   * here. Some interesting implementation details around ffmpeg in comments
   * below.
   *
   * @param {string} initialFile path to initial MP4 file
   * @param {string} finalDir path to output directory
   * @param {number} desiredDuration seconds to cut down to
   * @returns full path of the final video file
   */
  private static async cutVideo(
    initialFile: string,
    finalDir: string,
    outputFilename: string | undefined,
    relativeStart: number,
    desiredDuration: number,
  ): Promise<string> {
    const videoFileName = path.basename(initialFile, '.mp4');
    const videoFilenameSuffix = outputFilename ? ` - ${outputFilename}` : '';
    const baseVideoFilename = VideoProcessQueue.sanitizeFilename(videoFileName + videoFilenameSuffix);
    const finalVideoPath = path.join(finalDir, `${baseVideoFilename}.mp4`);

    return new Promise<string>((resolve) => {
      if (relativeStart < 0) {
        VideoProcessQueue.logger.info(
          `[VideoProcessQueue] Avoiding error by rejecting negative start: ${relativeStart}`,
        );
        // eslint-disable-next-line no-param-reassign
        relativeStart = 0;
      }

      VideoProcessQueue.logger.info(
        `[VideoProcessQueue] Desired duration: ${desiredDuration}, Relative start time: ${relativeStart}`,
      );

      // It's crucial that we don't re-encode the video here as that
      // would spin the CPU and delay the replay being available. I
      // did try this with re-encoding as it has compression benefits
      // but took literally ages. My CPU was maxed out for nearly the
      // same elapsed time as the recording.
      //
      // We ensure that we don't re-encode by passing the "-c copy"
      // option to ffmpeg. Read about it here:
      // https://superuser.com/questions/377343/cut-part-from-video-file-from-start-position-to-end-position-with-ffmpeg
      //
      // This thread has a brilliant summary why we need "-avoid_negative_ts make_zero":
      // https://superuser.com/questions/1167958/video-cut-with-missing-frames-in-ffmpeg?rq=1
      VideoProcessQueue.logger.info(
        `[VideoProcessQueue] ffmpeg call ${initialFile} input: -ss ${relativeStart}, -t ${desiredDuration} output: -t ${desiredDuration}, '-c:v copy', '-c:a copy', '-avoid_negative_ts make_zero' `,
      );

      ffmpeg(initialFile)
        .inputOptions([`-ss ${relativeStart}`, `-t ${desiredDuration}`])
        .outputOptions([`-t ${desiredDuration}`, '-c:v copy', '-c:a copy', '-avoid_negative_ts make_zero'])
        .output(finalVideoPath)

        // Handle the end of the FFmpeg cutting.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on('end', async (err: any) => {
          if (err) {
            VideoProcessQueue.logger.info(`[VideoProcessQueue] FFmpeg video cut error (1): ${err}`);
            throw new Error('FFmpeg error when cutting video (1)');
          } else {
            VideoProcessQueue.logger.info('[VideoProcessQueue] FFmpeg cut video succeeded');
            resolve(finalVideoPath);
          }
        })

        // Handle an error with the FFmpeg cutting. Not sure if we
        // need this as well as the above but being careful.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on('error', (err: any) => {
          VideoProcessQueue.logger.info(`[VideoProcessQueue] FFmpeg video cut error (2): ${err}`);
          throw new Error('FFmpeg error when cutting video (2)');
        })
        .run();
    });
  }

  /**
   * Takes an input video file and writes a screenshot a second into the
   * video to disk. Going further into the file seems computationally
   * expensive, so we avoid that.
   *
   * @param {string} video full path to initial MP4 file
   * @param {string} output path to output directory
   */
  private static async getThumbnail(video: string) {
    const thumbnailPath = getThumbnailFileNameForVideo(video);
    const thumbnailFile = path.basename(thumbnailPath);
    const thumbnailDir = path.dirname(thumbnailPath);

    return new Promise<void>((resolve) => {
      ffmpeg(video)
        .on('end', () => {
          VideoProcessQueue.logger.info(`[VideoProcessQueue] Got thumbnail for ${video}`);
          resolve();
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on('error', (err: any) => {
          VideoProcessQueue.logger.error(`[VideoProcessQueue] Error getting thumbnail for video=${video} err=${err}`);
          throw new Error(err);
        })
        .screenshots({
          timestamps: [0],
          folder: thumbnailDir,
          filename: thumbnailFile,
        });
    });
  }
}

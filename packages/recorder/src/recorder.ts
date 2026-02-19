import { BrowserWindow, screen } from 'electron';
import fs from 'fs';
import { isEqual } from 'lodash';
import noobs, { type Signal } from 'noobs';
import path from 'path';
import { v4 as uuidfn } from 'uuid';
import WaitQueue from 'wait-queue';

import { IActivity } from './activity';
import ConfigService from './configService';
// import { UiohookKeyboardEvent, UiohookMouseEvent, uIOhook } from 'uiohook-napi';
import { getOverlayConfig } from './configUtils';
import { obsResolutions } from './constants';
import { ManagerMessageBus } from './messageBus';
import { EOBSOutputSignal, ERecordingState, ESupportedEncoders } from './obsEnums';
import {
  ILogger,
  IOBSDevice,
  MicStatus,
  ObsAudioConfig,
  ObsBaseConfig,
  ObsOverlayConfig,
  ObsVideoConfig,
  RecStatus,
  TAudioSourceType,
  TPreviewPosition,
} from './types';
import {
  deferredPromiseHelper,
  fixPathWhenPackaged,
  getAssetPath,
  getPromiseBomb,
  getSortedVideos,
  // TODO: fix uiohook
  // isPushToTalkHotkey,
  // convertUioHookEvent,
  tryUnlink,
} from './util';
import VideoProcessQueue from './videoProcessQueue';

/**
 * Class for handing the interface between Warcraft Recorder and OBS.
 *
 * This works by constantly recording a "buffer" whenever WoW is open. If an
 * interesting event is spotted in the combatlog (e.g. an ENCOUNTER_START
 * event), the buffer becomes a real recording.
 *
 * This ensures we catch the start of activities, the fundamental problem
 * here being that the combatlog doesn't write in real time, and we might
 * actually see the ENCOUNTER_START event 20 seconds after it occured in
 * game.
 */
export class Recorder {
  /**
   * Messaging bus for event communications to the Manager class
   */
  private messageBus: ManagerMessageBus;

  /**
   * For quickly checking if we're recording an activity or not. This is
   * not the same as the OBS state.
   */
  public isRecording = false;

  /**
   * If we are currently overruning or not. Overrun is defined as the
   * final seconds where an activity has ended, but we're deliberatly
   * continuing the recording to catch the score screen, kill moments,
   * etc.
   */
  private isOverruning = false;

  /**
   * Promise we can await on to take actions after the overrun has completed.
   * This is undefined if isOverruning is false.
   */
  private overrunPromise: Promise<void> | undefined;

  /**
   * Timer object to trigger a restart of the buffer. We do this on an
   * interval so we aren't building up massive files.
   */
  private bufferRestartIntervalID: ReturnType<typeof setInterval> | undefined;

  /**
   * Reference back to the mainWindow object for updating the app status icon.
   */
  private mainWindow: BrowserWindow;

  /**
   * ConfigService instance.
   */
  private cfg: ConfigService = ConfigService.getInstance();

  /**
   * Location to write all recording to. This is not the final location of
   * the finalized video files.
   */
  private bufferStorageDir: string | undefined;

  /**
   * Once we have completed a recording, we throw it onto the
   * VideoProcessQueue to handle cutting it to size, writing accompanying
   * metadata and saving it to the final location for display in the GUI.
   */
  private videoProcessQueue: VideoProcessQueue;

  /**
   * On creation of the recorder we generate a UUID to identify the OBS
   * server. On a change of settings, we destroy the recorder object and
   * create a new one, with a different UUID.
   */
  private uuid: string = uuidfn();

  /**
   * Name of the video capture source in noobs.
   */
  private videoSourceName: string | undefined;

  /**
   * Resolution selected by the user in settings. Defaults to 1920x1080 for
   * no good reason other than avoiding undefined. It quickly gets set to
   * what the user configured.
   */
  private resolution: keyof typeof obsResolutions = '1920x1080';

  /**
   * Scale factor for resizing the video source if a user is running
   * windowed mode and decides to resize their game. We can handle
   * this cleanly, even mid-recording.
   */
  private videoScaleFactor = { x: 1, y: 1 };

  /**
   * Timer object for checking the size of the game window and rescaling if
   * required.
   */
  private videoSourceSizeInterval?: ReturnType<typeof setInterval>;

  /**
   * Names of audio input sources we added to the scene.
   */
  private audioInputSourceNames: string[] = [];

  /**
   * Names of audio output sources we added to the scene.
   */
  private audioOutputSourceNames: string[] = [];

  /**
   * WaitQueue object for storing signalling from OBS. We only care about
   * start signals here which indicate the recording has started.
   */
  private startQueue = new WaitQueue<Signal>();

  /**
   * WaitQueue object for storing signalling from OBS. We only care about
   * wrote/deactivate signals here which indicate the video file has been written.
   */
  private wroteQueue = new WaitQueue<Signal>();

  /**
   * Bool tracking if the preview exists yet.
   */
  private previewCreated = false;

  /**
   * Exists across a reconfigure.
   */
  private previewLocation: TPreviewPosition = {
    width: 0,
    height: 0,
    xPos: 0,
    yPos: 0,
  };

  /**
   * Name of the overlay image source in noobs.
   */
  private overlayImageSourceName: string | undefined;

  /**
   * Names of noobs sources used only for enumerating audio devices (never added to scene).
   */
  private static readonly AUDIO_ENUM_INPUT_SOURCE = 'WR Audio Input Enum';
  private static readonly AUDIO_ENUM_OUTPUT_SOURCE = 'WR Audio Output Enum';

  /**
   * The state of OBS according to its signalling.
   */
  public obsState: ERecordingState = ERecordingState.Offline;

  /**
   * For easy checking if OBS has been initialized.
   */
  public obsInitialized = false;

  /**
   * For easy checking if OBS has been configured.
   */
  public obsConfigured = false;

  /**
   * Callback to fire when recording state updates
   * TODO: MIGHTFIX update this to a proper emitter pattern
   */
  public recordingStateChangedCallback: ((status: RecStatus, error?: string) => void) | null = null;

  private _recorderStatus: RecStatus = 'WaitingForWoW';

  public static logger: ILogger = console;

  public get recorderStatus() {
    if (!this.obsInitialized) {
      return 'EngineNotStarted';
    }
    return this._recorderStatus;
  }

  private set recorderStatus(status: RecStatus) {
    this._recorderStatus = status;
  }

  /**
   * Load OBS/recording libraries. Noobs is imported statically; this mainly
   * ensures FFmpeg libraries are loaded. MUST be called before Recorder is constructed!
   */
  static async loadOBSLibraries() {
    await VideoProcessQueue.LoadFFMpegLibraries();
  }

  /**
   * Contructor.
   *
   * @param mainWindow main app window for IPC interaction
   */
  constructor(mainWindow: BrowserWindow, bus: ManagerMessageBus) {
    this.messageBus = bus;

    Recorder.logger.info(`[Recorder] Constructing recorder: ${this.uuid}`);
    this.mainWindow = mainWindow;
    this.videoProcessQueue = new VideoProcessQueue(this.messageBus);
    this.initializeOBS();
  }

  /**
   * Create the bufferStorageDir if it doesn't already exist. Also
   * cleans it out for good measure.
   */
  private createRecordingDirs(bufferStoragePath: string) {
    if (bufferStoragePath === '') {
      Recorder.logger.error('[Recorder] bufferStorageDir not set');
      return;
    }

    if (!fs.existsSync(bufferStoragePath)) {
      Recorder.logger.info(`[Recorder] Creating dir: ${bufferStoragePath}`);
      fs.mkdirSync(bufferStoragePath);
    } else {
      Recorder.logger.info('[Recorder] Clean out buffer');
      this.cleanupBuffer(0);
    }
  }

  /**
   * Initialize noobs (libobs bindings). This is synchronous and will block the main thread.
   */
  private initializeOBS() {
    Recorder.logger.info(`[Recorder] Initializing OBS (noobs) ${this.uuid}`);

    try {
      const noobsPath = fixPathWhenPackaged(path.join(__dirname, 'lib', 'noobs'));
      const logPath = fixPathWhenPackaged(path.join(__dirname, 'logs'));

      Recorder.logger.info(`[Recorder] noobs path=${noobsPath} logPath=${logPath}`);
      if (!fs.existsSync(noobsPath)) {
        throw new Error(`Path to noobs does not exist ${noobsPath}`);
      }

      noobs.Init(noobsPath, logPath, (signal: Signal) => this.handleSignal(signal));
      noobs.SetBuffering(true);

      const hwnd = this.mainWindow.getNativeWindowHandle();
      noobs.InitPreview(hwnd);

      this.createOverlayImageSource();

      noobs.CreateSource(Recorder.AUDIO_ENUM_INPUT_SOURCE, 'wasapi_input_capture');
      noobs.CreateSource(Recorder.AUDIO_ENUM_OUTPUT_SOURCE, 'wasapi_output_capture');

      this.obsInitialized = true;
      if (this.recordingStateChangedCallback) {
        this.recordingStateChangedCallback('WaitingForWoW', '');
      }
      Recorder.logger.info('[Recorder] OBS initialized successfully');
    } catch (e) {
      throw new Error(`Exception when initializing OBS (noobs): ${e}`);
    }
  }

  /**
   * Configures OBS. This does a bunch of things that we need the
   * user to have setup their config for, which is why it's split out.
   */
  public configureBase(config: ObsBaseConfig) {
    const { bufferStoragePath, obsFPS, obsRecEncoder, obsKBitRate, obsOutputResolution } = config;

    if (this.obsState !== ERecordingState.Offline) {
      throw new Error('[Recorder] OBS must be offline to do this');
    }

    this.bufferStorageDir = bufferStoragePath;
    this.createRecordingDirs(this.bufferStorageDir);
    this.resolution = obsOutputResolution as keyof typeof obsResolutions;
    const { height, width } = obsResolutions[this.resolution];

    noobs.ResetVideoContext(obsFPS, width, height);
    noobs.SetRecordingCfg(path.normalize(this.bufferStorageDir), 'mkv');

    const encoderSettings: Record<string, number | string> = {
      rate_control: 'VBR',
      bitrate: obsKBitRate * 1000,
      max_bitrate: obsKBitRate * 1000,
    };
    if (obsRecEncoder === ESupportedEncoders.AMD_AMF_H264) {
      encoderSettings['Bitrate.Peak'] = obsKBitRate * 1000 * 1.5;
    }
    noobs.SetVideoEncoder(obsRecEncoder, encoderSettings);
    Recorder.logger.info(`[Recorder] Video encoder: ${obsRecEncoder} settings: ${JSON.stringify(encoderSettings)}`);
  }

  private handleSignal(obsSignal: Signal) {
    Recorder.logger.info(`[Recorder] Got signal: ${JSON.stringify(obsSignal)}`);

    switch (obsSignal.id) {
      case EOBSOutputSignal.Start:
      case 'start':
        this.startQueue.push(obsSignal);
        this.obsState = ERecordingState.Recording;
        this.updateStatus('ReadyToRecord');
        break;

      case EOBSOutputSignal.Starting:
      case 'starting':
        this.obsState = ERecordingState.Starting;
        this.updateStatus('ReadyToRecord');
        break;

      case EOBSOutputSignal.Stop:
      case EOBSOutputSignal.Deactivate:
      case 'stop':
      case 'deactivate':
        this.obsState = ERecordingState.Offline;
        this.updateStatus('WaitingForWoW');
        break;

      case EOBSOutputSignal.Stopping:
      case 'stopping':
        this.obsState = ERecordingState.Stopping;
        this.updateStatus('WaitingForWoW');
        break;

      case EOBSOutputSignal.Wrote:
      case 'wrote':
        this.wroteQueue.push(obsSignal);
        break;

      default:
        Recorder.logger.info('[Recorder] No action needed on this signal');
        break;
    }

    Recorder.logger.info(`[Recorder] State is now: ${this.obsState}`);
  }

  /**
   * Configures the video source in OBS.
   */
  public configureVideoSources(config: ObsVideoConfig) {
    const { obsCaptureMode, monitorIndex, captureCursor } = config;

    if (this.videoSourceName) {
      noobs.RemoveSourceFromScene(this.videoSourceName);
      noobs.DeleteSource(this.videoSourceName);
      this.videoSourceName = undefined;
      this.videoScaleFactor = { x: 1, y: 1 };
    }

    if (obsCaptureMode === 'monitor_capture') {
      this.videoSourceName = this.createMonitorCaptureSource(monitorIndex, captureCursor);
    } else if (obsCaptureMode === 'game_capture') {
      this.videoSourceName = this.createGameCaptureSource(captureCursor);
    } else if (obsCaptureMode === 'window_capture') {
      this.videoSourceName = this.createWindowCaptureSource(captureCursor);
    } else {
      throw new Error(`[Recorder] Unexpected mode: ${obsCaptureMode}`);
    }

    noobs.AddSourceToScene(this.videoSourceName);

    if (this.videoSourceSizeInterval) {
      clearInterval(this.videoSourceSizeInterval);
    }

    this.watchVideoSourceSize();

    const overlayCfg = getOverlayConfig(this.cfg);
    this.configureOverlaySource(overlayCfg);
  }

  /**
   * Creates a monitor capture source.
   */
  private createMonitorCaptureSource(monitorIndex: number, captureCursor: boolean): string {
    Recorder.logger.info('[Recorder] Configuring OBS for Monitor Capture');
    const name = noobs.CreateSource('WR Monitor Capture', 'monitor_capture');
    noobs.SetSourceSettings(name, {
      ...noobs.GetSourceSettings(name),
      monitor: monitorIndex,
      capture_cursor: captureCursor,
    });
    return name;
  }

  /**
   * Creates a game capture source.
   */
  private createGameCaptureSource(captureCursor: boolean): string {
    Recorder.logger.info('[Recorder] Configuring OBS for Game Capture');
    const name = noobs.CreateSource('WR Game Capture', 'game_capture');
    const properties = noobs.GetSourceProperties(name);
    const windowProp = properties.find((p) => p.name === 'window');
    let window = 'World of Warcraft:waApplication Window:Wow.exe';
    if (windowProp && windowProp.type === 'list') {
      const windows = windowProp.items
        .filter((item) => item.name.includes('[Wow.exe]: World of Warcraft') || item.name.includes('魔兽世界'))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .reverse();
      if (windows.length) {
        window = String(windows[0].value);
      }
    }
    noobs.SetSourceSettings(name, {
      ...noobs.GetSourceSettings(name),
      capture_mode: 'window',
      allow_transparency: true,
      priority: 1,
      capture_cursor: captureCursor,
      window,
    });
    return name;
  }

  /**
   * Creates a window capture source.
   */
  private createWindowCaptureSource(captureCursor: boolean): string {
    Recorder.logger.info('[Recorder] Configuring OBS for Window Capture');
    const name = noobs.CreateSource('WR Window Capture', 'window_capture');
    noobs.SetSourceSettings(name, {
      ...noobs.GetSourceSettings(name),
      cursor: captureCursor,
      window: 'World of Warcraft:waApplication Window:Wow.exe',
      method: 2,
    });
    return name;
  }

  /**
   * Creates an image source for the chat overlay.
   */
  private createOverlayImageSource() {
    Recorder.logger.info('[Recorder] Create image source for chat overlay');
    this.overlayImageSourceName = noobs.CreateSource('WR Chat Overlay', 'image_source');
    noobs.SetSourceSettings(this.overlayImageSourceName, {
      ...noobs.GetSourceSettings(this.overlayImageSourceName),
      file: getAssetPath('poster', 'chat-cover.png'),
    });
  }

  /**
   * Set the configured audio sources to the OBS scene. This is public
   * so it can be called externally when WoW is opened - see the Poller
   * class. This removes any previously configured sources.
   */
  public configureAudioSources(config: ObsAudioConfig) {
    this.removeAudioSources();
    this.mainWindow.webContents.send('updateMicStatus', MicStatus.NONE);

    const { audioInputDevices, audioOutputDevices, micVolume, speakerVolume, obsForceMono } = config;

    noobs.SetForceMono(obsForceMono);

    const maxInputs = 3;
    const maxOutputs = 5;

    audioInputDevices
      .split(',')
      .filter((id) => id)
      .slice(0, maxInputs)
      .forEach((id) => {
        Recorder.logger.info(`[Recorder] Adding input source ${id}`);
        const name = noobs.CreateSource(`mic-${id.slice(0, 20)}`, TAudioSourceType.input);
        noobs.SetSourceSettings(name, { ...noobs.GetSourceSettings(name), device_id: id });
        noobs.SetSourceVolume(name, micVolume);
        noobs.AddSourceToScene(name);
        this.audioInputSourceNames.push(name);
      });

    if (this.audioInputSourceNames.length !== 0 && config.pushToTalk) {
      this.mainWindow.webContents.send('updateMicStatus', MicStatus.MUTED);
    } else if (this.audioInputSourceNames.length !== 0) {
      this.mainWindow.webContents.send('updateMicStatus', MicStatus.LISTENING);
    }

    audioOutputDevices
      .split(',')
      .filter((id) => id)
      .slice(0, maxOutputs)
      .forEach((id) => {
        Recorder.logger.info(`[Recorder] Adding output source ${id}`);
        const name = noobs.CreateSource(`desktop-${id.slice(0, 20)}`, TAudioSourceType.output);
        noobs.SetSourceSettings(name, { ...noobs.GetSourceSettings(name), device_id: id });
        noobs.SetSourceVolume(name, speakerVolume);
        noobs.AddSourceToScene(name);
        this.audioOutputSourceNames.push(name);
      });
  }

  /**
   * Remove all audio sources from the OBS scene. This is public
   * so it can be called externally when WoW is closed.
   */
  public removeAudioSources() {
    if (!this.obsInitialized) {
      throw new Error('[Recorder] OBS not initialized');
    }

    Recorder.logger.info('[Recorder] Removing OBS audio sources...');

    [...this.audioInputSourceNames, ...this.audioOutputSourceNames].forEach((name) => {
      noobs.RemoveSourceFromScene(name);
      noobs.DeleteSource(name);
    });
    this.audioInputSourceNames = [];
    this.audioOutputSourceNames = [];
  }

  /**
   * Release all OBS resources and shut it down.
   */
  public shutdownOBS() {
    Recorder.logger.info(`[Recorder] OBS shutting down ${this.uuid}`);

    if (!this.obsInitialized) {
      Recorder.logger.info('[Recorder] OBS not initialized so not attempting shutdown');
      return;
    }

    if (this.videoSourceSizeInterval) {
      clearInterval(this.videoSourceSizeInterval);
    }

    this.removeAudioSources();
    if (this.overlayImageSourceName) {
      noobs.RemoveSourceFromScene(this.overlayImageSourceName);
      noobs.DeleteSource(this.overlayImageSourceName);
      this.overlayImageSourceName = undefined;
    }
    if (this.videoSourceName) {
      noobs.RemoveSourceFromScene(this.videoSourceName);
      noobs.DeleteSource(this.videoSourceName);
      this.videoSourceName = undefined;
    }
    noobs.DeleteSource(Recorder.AUDIO_ENUM_INPUT_SOURCE);
    noobs.DeleteSource(Recorder.AUDIO_ENUM_OUTPUT_SOURCE);

    this.wroteQueue.empty();
    this.wroteQueue.clearListeners();
    this.startQueue.empty();
    this.startQueue.clearListeners();

    try {
      noobs.Shutdown();
    } catch (e) {
      Recorder.logger.warn(`[Recorder] Exception shutting down noobs: ${e}`);
    }

    this.obsInitialized = false;
    this.obsConfigured = false;
    if (this.recordingStateChangedCallback) {
      this.recordingStateChangedCallback('EngineNotStarted', '');
    }
    Recorder.logger.info('[Recorder] OBS shut down successfully');
  }

  /**
   * Start recorder buffer. This starts OBS and records in chunks
   * to the buffer location.
   */
  public async startBuffer() {
    Recorder.logger.info('[Recorder] Start recording buffer');

    if (!this.obsInitialized) {
      Recorder.logger.error('[Recorder] OBS not initialized');
      return;
    }

    await this.startOBS();

    // Some very specific timings can cause us to end up here with an
    // active timer, and we don't want to end up with two at all costs.
    // So cancel any. See issue 350.
    this.cancelBufferTimers();

    // We store off this timer as a member variable as we will cancel
    // it when a real game is detected.
    this.bufferRestartIntervalID = setInterval(
      () => {
        this.restartBuffer();
      },
      5 * 60 * 1000, // 5m
    );
  }

  /**
   * Stop recorder buffer.
   */
  public async stopBuffer() {
    Recorder.logger.info('[Recorder] Stop recording buffer');
    this.cancelBufferTimers();
    noobs.ForceStopRecording();
    this.cleanupBuffer(1);
  }

  /**
   * Restarts the buffer recording.
   */
  private async restartBuffer() {
    Recorder.logger.info('[Recorder] Restart recording buffer');
    await this.stopBuffer();
    await this.startBuffer();
  }

  /**
   * Cancel buffer timers. This can include any combination of:
   *  - _bufferRestartIntervalID: the interval on which we periodically restart the buffer
   */
  private cancelBufferTimers = () => {
    if (this.bufferRestartIntervalID) {
      Recorder.logger.info('[Recorder] Buffer restart interval cleared');
      clearInterval(this.bufferRestartIntervalID);
    }
  };

  /**
   * Start recording for real, this basically just cancels pending
   * buffer recording restarts.
   *
   * We don't need to actually start OBS recording as it's should already
   * be running.
   *
   * We do need to handle the case here that we're mid buffer restart and
   * OBS isn't in a Recording state but is about to be, so we will sleep
   * for a second and retry to avoid missing recordings if so.
   */
  public async start() {
    Recorder.logger.info('[Recorder] Start recording by cancelling buffer restart');

    if (this.isOverruning) {
      Recorder.logger.info('[Recorder] Overrunning from last game');
      await this.overrunPromise;
      Recorder.logger.info('[Recorder] Finished with last game overrun');
    }

    Recorder.logger.info(`[Recorder] ready check isRecording=${this.isRecording} obsState=${this.obsState}`);
    let rdy = !this.isRecording && this.obsState === ERecordingState.Recording;
    let retries = 5;

    while (!rdy) {
      Recorder.logger.info(`[Recorder] Not ready, will sleep and retry: ${retries}`);

      if (retries < 1) {
        Recorder.logger.warn(`[Recorder] Exhausted attempts to start ${this.isRecording} ${this.obsState}`);

        return;
      }

      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 1000));
      rdy = !this.isRecording && this.obsState === ERecordingState.Recording;
      retries--;
    }

    this.updateStatus('Recording');
    this.cancelBufferTimers();
    this.isRecording = true;
  }

  /**
   * Stop recording, no-op if not already recording.
   *
   * @param {Activity} activity the details of the recording
   * @param {boolean} closedWow if wow has just been closed
   */
  public async stop(activity: IActivity, closedWow = false) {
    Recorder.logger.info('[Recorder] Stop called');

    if (!this.isRecording) {
      Recorder.logger.warn('[Recorder] Stop recording called but not recording');
      return;
    }

    const { overrun } = activity;
    const activityDuration = (activity.endDate.getTime() - activity.startDate.getTime()) / 1000;
    const backtrackSeconds = activityDuration + overrun;

    Recorder.logger.info(`[Recorder] Stop recording after overrun: ${overrun}s, backtrack: ${backtrackSeconds}s`);
    const { promise, resolveHelper } = deferredPromiseHelper<void>();
    this.overrunPromise = promise;
    this.updateStatus('Overrunning');
    this.isOverruning = true;

    await new Promise((resolve) => setTimeout(resolve, 1000 * overrun));

    this.isRecording = false;

    let bufferFile: string;
    try {
      bufferFile = await this.saveBufferToFile(backtrackSeconds);
    } catch (e) {
      Recorder.logger.error('[Recorder] Unable to save buffer file');
      resolveHelper();
      this.isOverruning = false;
      return;
    }

    if (!closedWow) {
      Recorder.logger.info('[Recorder] WoW not closed, so starting buffer');
      await this.startBuffer();
    }

    resolveHelper();
    this.isOverruning = false;

    const duration = activity.overrun + activityDuration;
    this.videoProcessQueue.queueVideo({
      bufferFile,
      metadata: activity.metadata,
      filename: activity.fileName,
      relativeStart: 0,
      duration,
      compensationTimeSeconds: 0,
    });
  }

  /**
   * Force stop a recording, throwing it away entirely.
   */
  public async forceStop() {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;
    noobs.ForceStopRecording();
    await this.startBuffer();
  }

  /**
   * Clean-up the buffer directory.
   * @params Number of files to leave.
   */
  private async cleanupBuffer(filesToLeave: number) {
    if (!this.bufferStorageDir) {
      Recorder.logger.info('[Recorder] Not attempting to clean-up');
      return;
    }

    // Sort newest to oldest
    const sortedBufferVideos = await getSortedVideos(this.bufferStorageDir);
    if (!sortedBufferVideos || sortedBufferVideos.length === 0) return;
    const videosToDelete = sortedBufferVideos.slice(filesToLeave);

    const deletePromises = videosToDelete.map(async (video) => {
      await tryUnlink(video.name, Recorder.logger);
    });

    await Promise.all(deletePromises);
  }

  /**
   * Start the replay buffer. Waits for OBS to signal that recording has started.
   */
  private async startOBS() {
    Recorder.logger.info('[Recorder] Start OBS buffer called');

    if (this.obsState !== ERecordingState.Offline) {
      Recorder.logger.warn(`[Recorder] OBS can't start, state is: ${this.obsState}`);
      return;
    }

    noobs.StartBuffer();

    const startRace = await Promise.race([
      this.startQueue.shift(),
      getPromiseBomb(30000, '[Recorder] OBS timeout waiting for start'),
    ]);

    try {
      await startRace;
      this.startQueue.empty();
    } catch (error) {
      Recorder.logger.error(`[Recorder] Failed to start OBS: ${String(error)}`);
      this.updateStatus('FatalError', String(error));
    }
  }

  /**
   * Save the last `backtrackSeconds` seconds of the buffer to a file, stop the recording,
   * and return the path to the file. Waits for the wrote signal.
   */
  private async saveBufferToFile(backtrackSeconds: number): Promise<string> {
    Recorder.logger.info(`[Recorder] Saving buffer to file, backtrack=${backtrackSeconds}s`);

    this.wroteQueue.empty();
    const rounded = Math.round(backtrackSeconds);
    noobs.StartRecording(rounded);
    noobs.StopRecording();

    const stopRace = await Promise.race([
      this.wroteQueue.shift().then((a) => Recorder.logger.info(`[Recorder] got wrote signal: ${a.id}`)),
      getPromiseBomb(30000, '[Recorder] OBS timeout waiting for video file'),
    ]);

    try {
      await stopRace;
      this.wroteQueue.empty();
    } catch (error) {
      Recorder.logger.error(`[Recorder] Failed to get video file: ${String(error)}`);
      this.updateStatus('FatalError', String(error));
      throw error;
    }

    const bufferFile = noobs.GetLastRecording();
    if (!bufferFile) {
      throw new Error('[Recorder] GetLastRecording returned empty');
    }
    return bufferFile;
  }

  /**
   * Get a list of the audio input devices. Used by the settings to populate
   * the list of devices for user selection.
   */
  public getInputAudioDevices(): IOBSDevice[] {
    if (!this.obsInitialized) {
      throw new Error('[Recorder] OBS not initialized');
    }

    const props = noobs.GetSourceProperties(Recorder.AUDIO_ENUM_INPUT_SOURCE);
    const deviceProp = props.find((p) => p.name === 'device_id');
    if (!deviceProp || deviceProp.type !== 'list') {
      return [];
    }
    return deviceProp.items
      .filter((item) => item.value !== 'default')
      .map((item) => ({ id: String(item.value), description: item.name }));
  }

  /**
   * Get a list of the audio output devices. Used by the settings to populate
   * the list of devices for user selection.
   */
  public getOutputAudioDevices(): IOBSDevice[] {
    if (!this.obsInitialized) {
      throw new Error('[Recorder] OBS not initialized');
    }

    const props = noobs.GetSourceProperties(Recorder.AUDIO_ENUM_OUTPUT_SOURCE);
    const deviceProp = props.find((p) => p.name === 'device_id');
    if (!deviceProp || deviceProp.type !== 'list') {
      return [];
    }
    return deviceProp.items
      .filter((item) => item.value !== 'default')
      .map((item) => ({ id: String(item.value), description: item.name }));
  }

  /**
   * Return an array of all the encoders available to OBS.
   */
  public getAvailableEncoders(): string[] {
    if (!this.obsInitialized) {
      throw new Error('[Recorder] OBS not initialized');
    }

    const encoders = noobs.ListVideoEncoders();
    Recorder.logger.info(`[Recorder] Available encoders: ${encoders}`);
    return encoders;
  }

  /**
   * Set up an interval to run the scaleVideoSourceSize function, and run it
   * upfront.
   */
  private watchVideoSourceSize() {
    if (!this.obsInitialized) {
      throw new Error('[Recorder] OBS not initialized');
    }

    if (this.videoSourceSizeInterval) {
      clearInterval(this.videoSourceSizeInterval);
    }

    this.videoSourceSizeInterval = setInterval(() => {
      this.scaleVideoSourceSize();
    }, 2000);
  }

  /**
   * Watch the video input source for size changes. This only matters for
   * doing game capture on a windowed instance of WoW, such that we'll scale
   * it to the size of the output video if it's resized by the player.
   */
  private scaleVideoSourceSize() {
    if (!this.videoSourceName) {
      return;
    }

    const pos = noobs.GetSourcePos(this.videoSourceName);
    if (pos.width === 0 || pos.height === 0) {
      return;
    }

    const { width, height } = obsResolutions[this.resolution];
    const xScaleFactor = Math.round((width / pos.width) * 100) / 100;
    const yScaleFactor = Math.round((height / pos.height) * 100) / 100;
    const newScaleFactor = { x: xScaleFactor, y: yScaleFactor };

    if (!isEqual(this.videoScaleFactor, newScaleFactor)) {
      Recorder.logger.info(`[Recorder] Rescaling from ${this.videoScaleFactor} to ${newScaleFactor}`);
      this.videoScaleFactor = newScaleFactor;
      noobs.SetSourcePos(this.videoSourceName, {
        ...pos,
        scaleX: newScaleFactor.x,
        scaleY: newScaleFactor.y,
      });
    }
  }

  /**
   * Trigger callbacks when status updates
   */
  public onStatusUpdates(callback: (status: RecStatus, err?: string) => void) {
    this.recordingStateChangedCallback = callback;
  }

  /**
   * Set status of recorder
   */
  public updateStatus(status: RecStatus, err = '') {
    this.recorderStatus = status;
    if (this.recordingStateChangedCallback) {
      this.recordingStateChangedCallback(this.recorderStatus, err);
    }
  }

  createPreview() {
    Recorder.logger.info('[Recorder] Creating preview');
    if (this.previewCreated) {
      Recorder.logger.warn('[Recorder] Preview display already exists');
      return;
    }
    this.previewCreated = true;
  }

  public hidePreview() {
    if (!this.previewCreated) {
      Recorder.logger.warn('[Recorder] Preview display not created');
      return;
    }
    noobs.HidePreview();
  }

  /**
   * Show the scene preview on the UI, taking the location and dimensions as
   * input. We scale to match the monitor scaling here too else the preview
   * will be misplaced (see issue 397).
   */
  public showPreview(width: number, height: number, xPos: number, yPos: number) {
    if (!this.previewCreated) {
      Recorder.logger.info('[Recorder] Preview display not yet created, creating...');
      this.createPreview();
    }

    if (!this.previewCreated) {
      Recorder.logger.error('[Recorder] Preview display still does not exist');
      return;
    }

    const winBounds = this.mainWindow.getBounds();
    const currentScreen = screen.getDisplayNearestPoint({
      x: winBounds.x,
      y: winBounds.y,
    });
    const { scaleFactor } = currentScreen;
    this.previewLocation = { width, height, xPos, yPos };

    noobs.ConfigurePreview(xPos * scaleFactor, yPos * scaleFactor, width * scaleFactor, height * scaleFactor);
    noobs.ShowPreview();
  }

  /**
   * Show the preview on the UI, only if we already know the location and
   * dimensions.
   */
  public showPreviewMemory() {
    if (this.previewLocation !== undefined) {
      const { width, height, xPos, yPos } = this.previewLocation;
      this.showPreview(width, height, xPos, yPos);
    }
  }

  /**
   * Apply a chat overlay to the scene.
   */
  public configureOverlaySource(config: ObsOverlayConfig) {
    const { chatOverlayEnabled, chatOverlayWidth, chatOverlayHeight, chatOverlayXPosition, chatOverlayYPosition } =
      config;

    if (!this.overlayImageSourceName) {
      Recorder.logger.error('[Recorder] Overlay image source not created');
      return;
    }

    noobs.RemoveSourceFromScene(this.overlayImageSourceName);

    if (!chatOverlayEnabled) {
      return;
    }

    const baseWidth = 5000;
    const baseHeight = 2000;
    const toCropX = (baseWidth - chatOverlayWidth) / 2;
    const toCropY = (baseHeight - chatOverlayHeight) / 2;

    noobs.AddSourceToScene(this.overlayImageSourceName);
    noobs.SetSourcePos(this.overlayImageSourceName, {
      x: chatOverlayXPosition,
      y: chatOverlayYPosition,
      scaleX: 1,
      scaleY: 1,
      cropLeft: toCropX,
      cropRight: toCropX,
      cropTop: toCropY,
      cropBottom: toCropY,
    });
  }

  // private muteInputDevices() {
  //   if (this.inputDevicesMuted) {
  //     return;
  //   }

  //   this.audioInputDevices.forEach((device) => {
  //     device.muted = true;
  //   });

  //   this.inputDevicesMuted = true;
  //   this.mainWindow.webContents.send('updateMicStatus', MicStatus.MUTED);
  // }

  // private unmuteInputDevices() {
  //   if (!this.inputDevicesMuted) {
  //     return;
  //   }

  //   this.audioInputDevices.forEach((device) => {
  //     device.muted = false;
  //   });

  //   this.inputDevicesMuted = false;
  //   this.mainWindow.webContents.send('updateMicStatus', MicStatus.LISTENING);
  // }
}

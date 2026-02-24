import { BrowserWindow, screen } from 'electron';
import fs from 'fs';
import { isEqual } from 'lodash';
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
  Noobs,
  ObsAudioConfig,
  ObsBaseConfig,
  ObsListItem,
  ObsOverlayConfig,
  ObsProperty,
  ObsVideoConfig,
  RecStatus,
  Signal,
  TAudioSourceType,
  TPreviewPosition,
} from './types';
import {
  deferredPromiseHelper,
  getAssetPath,
  getNoobsDistPath,
  getPromiseBomb,
  getSortedVideos,
  // TODO: fix uiohook
  // isPushToTalkHotkey,
  // convertUioHookEvent,
  tryUnlink,
} from './util';
import VideoProcessQueue from './videoProcessQueue';

let noobsModule: Noobs | null = null;

function getNoobs(): Noobs {
  if (noobsModule) return noobsModule;
  if (process.platform !== 'win32') {
    throw new Error('OBS recording (noobs) is only supported on Windows');
  }
  // Lazy load so optional dependency doesn't break npm install on non-Windows (CI)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  noobsModule = require('noobs');
  return noobsModule as Noobs;
}

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
  private overrunResolve: (() => void) | undefined;

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
   * Name of the video capture source in getNoobs().
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
   * Cache for encoder logging to reduce noise.
   */
  private lastEncodersLogged: string | undefined;

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
   * WaitQueue object for storing deactivate signals from OBS.
   */
  private deactivateQueue = new WaitQueue<Signal>();

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
   * Name of the overlay image source in getNoobs().
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
      fs.mkdirSync(bufferStoragePath, { recursive: true });
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
      const noobsPath = getNoobsDistPath();
      const logPath = noobsPath;

      Recorder.logger.info(`[Recorder] noobs path=${noobsPath} logPath=${logPath}`);
      if (!fs.existsSync(noobsPath)) {
        throw new Error(`Path to noobs does not exist ${noobsPath}`);
      }

      getNoobs().Init(noobsPath, logPath, (signal: Signal) => this.handleSignal(signal));
      getNoobs().SetBuffering(true);

      const hwnd = this.mainWindow.getNativeWindowHandle();
      getNoobs().InitPreview(hwnd);

      this.createOverlayImageSource();

      getNoobs().CreateSource(Recorder.AUDIO_ENUM_INPUT_SOURCE, 'wasapi_input_capture');
      getNoobs().CreateSource(Recorder.AUDIO_ENUM_OUTPUT_SOURCE, 'wasapi_output_capture');

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

    getNoobs().ResetVideoContext(obsFPS, width, height);
    getNoobs().SetRecordingCfg(path.normalize(this.bufferStorageDir), 'mp4');

    const encoderSettings: Record<string, number | string> = {
      rate_control: 'VBR',
      bitrate: obsKBitRate * 1000,
      max_bitrate: obsKBitRate * 1000,
      keyint_sec: 1,
      CQP: 24,
      CRF: 22,
    };
    if (obsRecEncoder === ESupportedEncoders.AMD_AMF_H264) {
      encoderSettings['Bitrate.Peak'] = obsKBitRate * 1000 * 1.5;
    }
    getNoobs().SetVideoEncoder(obsRecEncoder, encoderSettings);
    Recorder.logger.info(`[Recorder] Video encoder: ${obsRecEncoder} settings: ${JSON.stringify(encoderSettings)}`);
  }

  private handleSignal(obsSignal: Signal) {
    Recorder.logger.info(`[Recorder] Got signal: ${JSON.stringify(obsSignal)}`);

    switch (obsSignal.id) {
      case EOBSOutputSignal.Start:
      case 'start':
      case EOBSOutputSignal.Activate:
      case 'activate':
        this.startQueue.push(obsSignal);
        this.obsState = ERecordingState.Recording;
        this.updateStatus('ReadyToRecord');
        break;

      case EOBSOutputSignal.Starting:
      case 'starting':
        // Some noobs versions emit "starting" after "start". Don't regress state.
        if (this.obsState !== ERecordingState.Recording) {
          this.obsState = ERecordingState.Starting;
          this.updateStatus('ReadyToRecord');
        }
        break;

      case EOBSOutputSignal.Stop:
      case EOBSOutputSignal.Deactivate:
      case 'stop':
      case 'deactivate':
        if (obsSignal.id === 'stop') this.wroteQueue.push(obsSignal);
        this.obsState = ERecordingState.Offline;
        this.updateStatus('WaitingForWoW');
        if (obsSignal.id === EOBSOutputSignal.Deactivate) {
          this.deactivateQueue.push(obsSignal);
        }
        break;

      case EOBSOutputSignal.Stopping:
      case 'stopping':
        this.obsState = ERecordingState.Stopping;
        this.updateStatus('WaitingForWoW');
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
      getNoobs().RemoveSourceFromScene(this.videoSourceName);
      getNoobs().DeleteSource(this.videoSourceName);
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

    getNoobs().AddSourceToScene(this.videoSourceName);

    // Refresh the preview now that a video source exists in the scene.
    // InitPreview is called during initializeOBS before any sources are added,
    // so the preview renders black until we re-show it with content.
    if (this.previewCreated) {
      this.showPreviewMemory();
    }

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
    const name = getNoobs().CreateSource('WR Monitor Capture', 'monitor_capture');
    const properties = getNoobs().GetSourceProperties(name);
    const monitorProp = properties.find((p: ObsProperty) => p.name === 'monitor' || p.name === 'monitor_id');
    const methodProp = properties.find((p: ObsProperty) => p.name === 'method');
    const monitorItem =
      monitorProp && monitorProp.type === 'list'
        ? monitorProp.items?.[Math.max(0, Math.min(monitorIndex, (monitorProp.items?.length ?? 1) - 1))]
        : undefined;
    const methodItem = methodProp && methodProp.type === 'list' ? methodProp.items?.[0] : undefined;

    const settings = {
      ...getNoobs().GetSourceSettings(name),
      capture_cursor: captureCursor,
      ...(monitorProp?.name ? { [monitorProp.name]: monitorItem?.value ?? monitorIndex } : { monitor: monitorIndex }),
      ...(methodProp?.name && methodItem ? { [methodProp.name]: methodItem.value } : {}),
    };

    getNoobs().SetSourceSettings(name, settings);
    return name;
  }

  /**
   * Creates a game capture source.
   */
  private createGameCaptureSource(captureCursor: boolean): string {
    Recorder.logger.info('[Recorder] Configuring OBS for Game Capture');
    const name = getNoobs().CreateSource('WR Game Capture', 'game_capture');
    const properties = getNoobs().GetSourceProperties(name);
    const windowProp = properties.find((p: ObsProperty) => p.name === 'window');
    const captureModeProp = properties.find((p: ObsProperty) => p.name === 'capture_mode' || p.name === 'mode');
    let window = 'World of Warcraft:waApplication Window:Wow.exe';
    if (windowProp && windowProp.type === 'list') {
      const windows = (windowProp.items ?? [])
        .filter(
          (item: ObsListItem) => item.name.includes('[Wow.exe]: World of Warcraft') || item.name.includes('魔兽世界'),
        )
        .sort((a: ObsListItem, b: ObsListItem) => String(a.name).localeCompare(String(b.name)))
        .reverse();
      if (windows.length) {
        window = String(windows[0].value);
      }
    }
    const captureModeItem =
      captureModeProp && captureModeProp.type === 'list'
        ? (captureModeProp.items?.find((item) => String(item.value) === 'window') ?? captureModeProp.items?.[0])
        : undefined;

    const settings = {
      ...getNoobs().GetSourceSettings(name),
      allow_transparency: true,
      priority: 1,
      capture_cursor: captureCursor,
      window,
      ...(captureModeProp?.name && captureModeItem
        ? { [captureModeProp.name]: captureModeItem.value }
        : { capture_mode: 'window' }),
    };
    getNoobs().SetSourceSettings(name, settings);
    return name;
  }

  /**
   * Creates a window capture source.
   */
  private createWindowCaptureSource(captureCursor: boolean): string {
    Recorder.logger.info('[Recorder] Configuring OBS for Window Capture');
    const name = getNoobs().CreateSource('WR Window Capture', 'window_capture');
    const properties = getNoobs().GetSourceProperties(name);
    const windowProp = properties.find((p: ObsProperty) => p.name === 'window');
    const methodProp = properties.find((p: ObsProperty) => p.name === 'method');
    const priorityProp = properties.find((p: ObsProperty) => p.name === 'priority');

    const windowItem =
      windowProp && windowProp.type === 'list'
        ? (windowProp.items?.find(
            (item) => item.name.includes('[Wow.exe]: World of Warcraft') || item.name.includes('魔兽世界'),
          ) ?? windowProp.items?.[0])
        : undefined;
    const methodItem = methodProp && methodProp.type === 'list' ? methodProp.items?.[0] : undefined;
    const priorityItem = priorityProp && priorityProp.type === 'list' ? priorityProp.items?.[0] : undefined;

    const settings = {
      ...getNoobs().GetSourceSettings(name),
      cursor: captureCursor,
      ...(windowProp?.name
        ? { [windowProp.name]: windowItem?.value }
        : { window: 'World of Warcraft:waApplication Window:Wow.exe' }),
      ...(methodProp?.name && methodItem ? { [methodProp.name]: methodItem.value } : { method: 2 }),
      ...(priorityProp?.name && priorityItem ? { [priorityProp.name]: priorityItem.value } : {}),
    };

    getNoobs().SetSourceSettings(name, settings);
    return name;
  }

  /**
   * Creates an image source for the chat overlay.
   */
  private createOverlayImageSource() {
    Recorder.logger.info('[Recorder] Create image source for chat overlay');
    this.overlayImageSourceName = getNoobs().CreateSource('WR Chat Overlay', 'image_source');
    getNoobs().SetSourceSettings(this.overlayImageSourceName, {
      ...getNoobs().GetSourceSettings(this.overlayImageSourceName),
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

    getNoobs().SetForceMono(obsForceMono);

    const maxInputs = 3;
    const maxOutputs = 5;

    audioInputDevices
      .split(',')
      .filter((id) => id)
      .slice(0, maxInputs)
      .forEach((id) => {
        Recorder.logger.info(`[Recorder] Adding input source ${id}`);
        const name = getNoobs().CreateSource(`mic-${id.slice(0, 20)}`, TAudioSourceType.input);
        getNoobs().SetSourceSettings(name, { ...getNoobs().GetSourceSettings(name), device_id: id });
        getNoobs().SetSourceVolume(name, micVolume);
        getNoobs().AddSourceToScene(name);
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
        const name = getNoobs().CreateSource(`desktop-${id.slice(0, 20)}`, TAudioSourceType.output);
        getNoobs().SetSourceSettings(name, { ...getNoobs().GetSourceSettings(name), device_id: id });
        getNoobs().SetSourceVolume(name, speakerVolume);
        getNoobs().AddSourceToScene(name);
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
      getNoobs().RemoveSourceFromScene(name);
      getNoobs().DeleteSource(name);
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
      getNoobs().RemoveSourceFromScene(this.overlayImageSourceName);
      getNoobs().DeleteSource(this.overlayImageSourceName);
      this.overlayImageSourceName = undefined;
    }
    if (this.videoSourceName) {
      getNoobs().RemoveSourceFromScene(this.videoSourceName);
      getNoobs().DeleteSource(this.videoSourceName);
      this.videoSourceName = undefined;
    }
    getNoobs().DeleteSource(Recorder.AUDIO_ENUM_INPUT_SOURCE);
    getNoobs().DeleteSource(Recorder.AUDIO_ENUM_OUTPUT_SOURCE);

    this.wroteQueue.empty();
    this.wroteQueue.clearListeners();
    this.startQueue.empty();
    this.startQueue.clearListeners();
    this.deactivateQueue.empty();
    this.deactivateQueue.clearListeners();

    try {
      getNoobs().Shutdown();
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
  }

  /**
   * Stop recorder buffer.
   */
  public async stopBuffer() {
    Recorder.logger.info('[Recorder] Stop recording buffer');
    getNoobs().ForceStopRecording();
  }

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
  public async start(backtrackSeconds = 0) {
    Recorder.logger.info('[Recorder] Start recording by cancelling buffer restart');

    if (this.isOverruning) {
      if (!this.isRecording && this.overrunResolve) {
        Recorder.logger.warn('[Recorder] Overrun flag set but not recording; clearing stale state');
        this.overrunResolve();
        this.overrunResolve = undefined;
        this.isOverruning = false;
      } else {
        Recorder.logger.info('[Recorder] Overrunning from last game');
        await this.overrunPromise;
        Recorder.logger.info('[Recorder] Finished with last game overrun');
      }
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

    const safeBacktrack = Math.max(0, backtrackSeconds);
    Recorder.logger.info(`[Recorder] Starting recording with backtrack: ${safeBacktrack}s`);
    getNoobs().StartRecording(safeBacktrack);
    this.updateStatus('Recording');
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
      if (this.isOverruning && this.overrunResolve) {
        Recorder.logger.warn('[Recorder] Clearing stale overrun state');
        this.overrunResolve();
        this.overrunResolve = undefined;
        this.isOverruning = false;
      }
      return;
    }

    const { overrun } = activity;
    const activityDuration = (activity.endDate.getTime() - activity.startDate.getTime()) / 1000;

    Recorder.logger.info(`[Recorder] Stop recording after overrun: ${overrun}s`);
    const { promise, resolveHelper } = deferredPromiseHelper<void>();
    this.overrunPromise = promise;
    this.overrunResolve = resolveHelper;
    this.updateStatus('Overrunning');
    this.isOverruning = true;

    await new Promise((resolve) => setTimeout(resolve, 1000 * overrun));

    this.isRecording = false;

    let bufferFile: string;
    try {
      getNoobs().StopRecording();
      bufferFile = await this.saveBufferToFile();
    } catch (e) {
      Recorder.logger.error('[Recorder] Unable to save buffer file');
      Recorder.logger.error(String(e));
      resolveHelper();
      this.overrunResolve = undefined;
      this.isOverruning = false;
      return;
    }

    if (!closedWow) {
      Recorder.logger.info('[Recorder] WoW not closed, waiting for deactivate to restart buffer');
      const deactivateRace = await Promise.race([
        this.deactivateQueue.shift(),
        getPromiseBomb(30000, '[Recorder] OBS timeout waiting for deactivate'),
      ]);
      try {
        await deactivateRace;
        this.deactivateQueue.empty();
      } catch (error) {
        Recorder.logger.warn(`[Recorder] Failed waiting for deactivate: ${String(error)}`);
      }
      Recorder.logger.info('[Recorder] Restarting buffer after deactivate');
      await this.startBuffer();
    }

    resolveHelper();
    this.overrunResolve = undefined;
    this.isOverruning = false;

    const duration = activity.overrun + activityDuration;
    this.videoProcessQueue.queueVideo({
      bufferFile,
      metadata: activity.metadata,
      filename: activity.fileName,
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
    getNoobs().ForceStopRecording();
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

    if (this.obsState !== ERecordingState.Offline && this.obsState !== ERecordingState.Starting) {
      Recorder.logger.warn(`[Recorder] OBS can't start, state is: ${this.obsState}`);
      return;
    }

    this.obsState = ERecordingState.Starting;
    this.updateStatus('ReadyToRecord');
    this.startQueue.empty();
    getNoobs().StartBuffer();

    const timeoutBomb = getPromiseBomb(30000, '[Recorder] OBS timeout waiting for start');
    const startRace = await Promise.race([this.startQueue.shift(), timeoutBomb]);

    try {
      await startRace;
      this.startQueue.empty();
    } catch (error) {
      Recorder.logger.error(`[Recorder] Failed to start OBS: ${String(error)}`);
      this.updateStatus('FatalError', String(error));
    } finally {
      // Prevent unhandled rejections if the timeout fires after a successful start
      timeoutBomb.catch(() => undefined);
    }
  }

  /**
   * Save the last `backtrackSeconds` seconds of the buffer to a file, stop the recording,
   * and return the path to the file. Waits for the wrote signal.
   */
  private async saveBufferToFile(): Promise<string> {
    Recorder.logger.info('[Recorder] Saving recording to file');

    this.wroteQueue.empty();
    const wroteRace = await Promise.race([
      this.wroteQueue.shift().then((a) => Recorder.logger.info(`[Recorder] got wrote signal: ${a.id}`)),
      getPromiseBomb(5000, '[Recorder] OBS timeout waiting for wrote'),
    ]);

    try {
      await wroteRace;
      this.wroteQueue.empty();
    } catch (error) {
      Recorder.logger.warn(`[Recorder] Proceeding without wrote signal: ${String(error)}`);
    }

    const bufferFile = getNoobs().GetLastRecording();
    if (!bufferFile) {
      throw new Error('[Recorder] GetLastRecording returned empty');
    }
    if (!fs.existsSync(bufferFile)) {
      Recorder.logger.warn(`[Recorder] Recording path does not exist yet: ${bufferFile}`);
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

    const props = getNoobs().GetSourceProperties(Recorder.AUDIO_ENUM_INPUT_SOURCE);
    const deviceProp = props.find((p: ObsProperty) => p.name === 'device_id');
    if (!deviceProp || deviceProp.type !== 'list') {
      return [];
    }
    return (deviceProp.items ?? [])
      .filter((item: ObsListItem) => item.value !== 'default')
      .map((item: ObsListItem) => ({ id: String(item.value), description: item.name }));
  }

  /**
   * Get a list of the audio output devices. Used by the settings to populate
   * the list of devices for user selection.
   */
  public getOutputAudioDevices(): IOBSDevice[] {
    if (!this.obsInitialized) {
      throw new Error('[Recorder] OBS not initialized');
    }

    const props = getNoobs().GetSourceProperties(Recorder.AUDIO_ENUM_OUTPUT_SOURCE);
    const deviceProp = props.find((p: ObsProperty) => p.name === 'device_id');
    if (!deviceProp || deviceProp.type !== 'list') {
      return [];
    }
    return (deviceProp.items ?? [])
      .filter((item: ObsListItem) => item.value !== 'default')
      .map((item: ObsListItem) => ({ id: String(item.value), description: item.name }));
  }

  /**
   * Return an array of all the encoders available to OBS.
   */
  public getAvailableEncoders(): string[] {
    if (!this.obsInitialized) {
      throw new Error('[Recorder] OBS not initialized');
    }

    const encoders = getNoobs().ListVideoEncoders();
    const encodersKey = encoders.join(',');
    if (this.lastEncodersLogged !== encodersKey) {
      this.lastEncodersLogged = encodersKey;
      Recorder.logger.info(`[Recorder] Available encoders: ${encodersKey}`);
    }
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

    const pos = getNoobs().GetSourcePos(this.videoSourceName);
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
      getNoobs().SetSourcePos(this.videoSourceName, {
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
    getNoobs().HidePreview();
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

    getNoobs().ConfigurePreview(xPos * scaleFactor, yPos * scaleFactor, width * scaleFactor, height * scaleFactor);
    getNoobs().ShowPreview();
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

    getNoobs().RemoveSourceFromScene(this.overlayImageSourceName);

    if (!chatOverlayEnabled) {
      return;
    }

    const baseWidth = 5000;
    const baseHeight = 2000;
    const toCropX = (baseWidth - chatOverlayWidth) / 2;
    const toCropY = (baseHeight - chatOverlayHeight) / 2;

    getNoobs().AddSourceToScene(this.overlayImageSourceName);
    getNoobs().SetSourcePos(this.overlayImageSourceName, {
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

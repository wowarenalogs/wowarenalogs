import { BrowserWindow, screen } from 'electron';
import fs from 'fs';
import { isEqual } from 'lodash';
import type {
  EOutputSignal,
  ERecordingFormat,
  IAdvancedRecording,
  IFader,
  IInput,
  IScene,
  ISceneItem,
  ISceneItemInfo,
  ISource,
} from 'obs-studio-node';
import path from 'path';
import { v4 as uuidfn } from 'uuid';
import WaitQueue from 'wait-queue';

import { IActivity } from './activity';
import ConfigService from './configService';
// import { UiohookKeyboardEvent, UiohookMouseEvent, uIOhook } from 'uiohook-napi';
import { getOverlayConfig } from './configUtils';
import { obsResolutions } from './constants';
import { ManagerMessageBus } from './messageBus';
import {
  EColorSpace,
  EFPSType,
  EOBSOutputSignal,
  ERangeType,
  ERecordingState,
  EScaleType,
  ESourceFlags,
  ESupportedEncoders,
  EVideoFormat,
} from './obsEnums';
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

let osn: typeof import('obs-studio-node');

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
   * Date the recording started.
   */
  private recorderStartDate = new Date();

  /**
   * Reference back to the mainWindow object for updating the app status icon.
   */
  private mainWindow: BrowserWindow;

  /**
   * Shiny new OSN API object for controlling OBS.
   */
  private obsRecordingFactory: IAdvancedRecording | undefined;

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
   * OBS IScene object.
   */
  private scene: IScene | undefined;

  /**
   * ISceneItem object for the video feed, useful to have handy for rescaling.
   */
  private videoSceneItem: ISceneItem | undefined;

  /**
   * Object representing the video source.
   */
  private videoSource: IInput | undefined;

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
   * Arbritrarily chosen channel numbers for video input. We only ever
   * include one video source.
   */
  private videoChannel = 1;

  /**
   * Some arbritrarily chosen channel numbers we can use for adding input
   * devices to the OBS scene. That is, adding microphone audio to the
   * recordings.
   */
  private audioInputChannels = [2, 3, 4];

  /**
   * Array of input devices we are including in the source. This is not an
   * array of all the devices we know about.
   */
  private audioInputDevices: IInput[] = [];

  /**
   * Gets toggled if push to talk is enabled and when the hotkey for push to
   * talk is held down.
   */
  // private inputDevicesMuted = false;

  /**
   * Some arbritrarily chosen channel numbers we can use for adding output
   * devices to the OBS scene. That is, adding speaker audio to the
   * recordings.
   */
  private audioOutputChannels = [5, 6, 7, 8, 9];

  /**
   * Array of output devices we are including in the source. This is not an
   * array of all the devices we know about.
   */
  private audioOutputDevices: IInput[] = [];

  /**
   * WaitQueue object for storing signalling from OBS. We only care about
   * start signals here which indicate the recording has started.
   */
  private startQueue = new WaitQueue<EOutputSignal>();

  /**
   * WaitQueue object for storing signalling from OBS. We only care about
   * wrote signals here which indicate the video file has been written.
   */
  private wroteQueue = new WaitQueue<EOutputSignal>();

  /**
   * Name we use to create and reference the preview display.
   */
  private previewName = 'preview';

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
   * The image source to be used for the overlay, we create this
   * ahead of time regardless of if the user has the overlay enabled.
   */
  private overlayImageSource: IInput | undefined;

  /**
   * Faders are used to modify the volume of an input source. We keep a list
   * of them here as we need a fader per audio source so it's handy to have a
   * list for cleaning them up.
   */
  private faders: IFader[] = [];

  /**
   * Handle to the scene item for the overlay source. Handy for adding
   * and removing it later.
   */
  private overlaySceneItem: ISceneItem | undefined;

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
   * Load OBS libraries as a DLL instead of through static imports
   * This is to let implementers choose to simply not bundle OBS libraries for platforms
   * where recording won't be supported
   *
   * MUST be called before Recorder is constructed!
   */
  static async loadOBSLibraries() {
    osn = await import('obs-studio-node');
    await VideoProcessQueue.LoadFFMpegLibraries();
    // eslint-disable-next-line no-console
    console.log('Loading noobs...,');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const noobs: any = await import('noobs');
    // eslint-disable-next-line no-console
    noobs.Init('D:\\Github\\wowarenalogs\\packages\\app\\node_modules\\noobs\\dist', 'D:\\Video', (e: any) =>
      console.log(e),
    );
    // eslint-disable-next-line no-console
    console.log({ noobs });
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
   * Call through OSN to initialize OBS. This is slow and synchronous,
   * so use sparingly - it will block the main thread.
   */
  private initializeOBS() {
    Recorder.logger.info(`[Recorder] Initializing OBS ${this.uuid}`);

    try {
      const obsPath = fixPathWhenPackaged(path.join(__dirname, 'lib', 'obs-studio-node'));
      const obsExecutableFilename = path.join(obsPath, 'obs64.exe');
      const osnDataPath = fixPathWhenPackaged(path.join(__dirname, 'dist', 'osn-data'));

      Recorder.logger.info(
        `[Recorder] Loading OBS obsPath=${obsPath} obsExecutableFilename=${obsExecutableFilename} osnDataPath=${osnDataPath}`,
      );
      const testObsPath = fs.existsSync(obsPath);
      const testExec = fs.existsSync(obsExecutableFilename);
      // const testOSN = existsSync(osnDataPath);
      if (!testObsPath) {
        throw new Error(`Path to OBS does not exist ${obsPath}`);
      }
      if (!testExec) {
        throw new Error(`Could not find obs64.exe at ${obsExecutableFilename}`);
      }

      Recorder.logger.info(`[Recorder] Setting server path ${obsExecutableFilename} ${obsPath}`);
      osn.NodeObs.IPC.setServerPath(obsExecutableFilename, obsPath);
      Recorder.logger.info(`[Recorder] Setting host ${this.uuid}`);
      osn.NodeObs.IPC.host(this.uuid);
      Recorder.logger.info(`[Recorder] Setting working directory ${obsPath}`);
      osn.NodeObs.SetWorkingDirectory(obsPath);
      Recorder.logger.info(`[Recorder] Setting osnDataPath ${osnDataPath}`);
      const initResult = osn.NodeObs.OBS_API_initAPI('en-US', osnDataPath, '1.0.0', '');
      Recorder.logger.info(`[Recorder] OBS init: ${initResult}`);
      if (initResult !== 0) {
        throw new Error(`OBS process initialization failed with code ${initResult}`);
      }
    } catch (e) {
      throw new Error(`Exception when initializing OBS process: ${e}`);
    }

    this.scene = osn.SceneFactory.create('WR Scene');
    osn.Global.setOutputSource(this.videoChannel, this.scene);
    this.createOverlayImageSource();

    this.obsInitialized = true;
    if (this.recordingStateChangedCallback) {
      this.recordingStateChangedCallback('WaitingForWoW', '');
    }
    Recorder.logger.info('[Recorder] OBS initialized successfully');
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

    // The AMD encoder causes recordings to get much darker if using the full
    // color range setting. So swap that to partial here. See https://github.com/aza547/wow-recorder/issues/446.
    const colorRange = ERangeType.Partial; //obsRecEncoder === ESupportedEncoders.AMD_AMF_H264 ? ERangeType.Partial : ERangeType.Full;
    // TODO: not sure what to do here. I had dark/bad results on .Full with the default nv enc; made .Partial the default...

    // TODO: Type error happened here when upgrading packages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (osn.VideoFactory as any).videoContext = {
      fpsNum: obsFPS,
      fpsDen: 1,
      baseWidth: width,
      baseHeight: height,
      outputWidth: width,
      outputHeight: height,
      // Bit of a mess here to keep typescript happy and make this readable.
      // See https://github.com/stream-labs/obs-studio-node/issues/1260.
      // TODO: MIGHTFIX these enums are pure fuckery
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      outputFormat: EVideoFormat.NV12 as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      colorspace: EColorSpace.CS709 as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scaleType: EScaleType.Bicubic as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fpsType: EFPSType.Fractional as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      range: colorRange as unknown as any,
    };

    if (!this.obsRecordingFactory) {
      this.obsRecordingFactory = osn.AdvancedRecordingFactory.create();
    }

    if (this.obsRecordingFactory) {
      this.obsRecordingFactory.path = path.normalize(this.bufferStorageDir);
      this.obsRecordingFactory.format = 'mp4' as ERecordingFormat;
      this.obsRecordingFactory.useStreamEncoders = false;
      this.obsRecordingFactory.overwrite = false;
      this.obsRecordingFactory.noSpace = false;

      // This function is defined here:
      //   (client) https://github.com/stream-labs/obs-studio-node/blob/staging/obs-studio-client/source/video-encoder.cpp
      //   (server) https://github.com/stream-labs/obs-studio-node/blob/staging/obs-studio-server/source/osn-video-encoder.cpp
      //
      // Ideally we'd pass the 3rd arg with all the settings, but it seems that
      // hasn't been implemented so we instead call .update() shortly after.
      this.obsRecordingFactory.videoEncoder = osn.VideoEncoderFactory.create(obsRecEncoder, 'WR-video-encoder', {});

      this.obsRecordingFactory.videoEncoder.update({
        rate_control: 'VBR',
        bitrate: obsKBitRate * 1000,
        max_bitrate: obsKBitRate * 1000,
      });

      // Not totally clear why AMF is a special case here. Theory is that as it
      // is a plugin to OBS (it's a seperate github repo), and the likes of the
      // nvenc/x264 encoders are native to OBS so have homogenized settings. We
      // add a 1.5 multiplier onto the peak from what the user sets here.
      if (obsRecEncoder === ESupportedEncoders.AMD_AMF_H264) {
        this.obsRecordingFactory.videoEncoder.update({
          'Bitrate.Peak': obsKBitRate * 1000 * 1.5,
        });
      }

      Recorder.logger.info(`Video encoder settings: ${JSON.stringify(this.obsRecordingFactory.videoEncoder.settings)}`);

      this.obsRecordingFactory.signalHandler = (signal) => {
        this.handleSignal(signal);
      };
    }
  }

  private handleSignal(obsSignal: EOutputSignal) {
    Recorder.logger.info(`[Recorder] Got signal: ${JSON.stringify(obsSignal)}`);

    if (obsSignal.type !== 'recording') {
      Recorder.logger.info('[Recorder] No action needed on this signal');
      return;
    }

    switch (obsSignal.signal) {
      case EOBSOutputSignal.Start:
        this.startQueue.push(obsSignal);
        this.obsState = ERecordingState.Recording;
        this.updateStatus('ReadyToRecord');
        break;

      case EOBSOutputSignal.Starting:
        this.obsState = ERecordingState.Starting;
        this.updateStatus('ReadyToRecord');
        break;

      case EOBSOutputSignal.Stop:
        this.obsState = ERecordingState.Offline;
        this.updateStatus('WaitingForWoW');
        break;

      case EOBSOutputSignal.Stopping:
        this.obsState = ERecordingState.Stopping;
        this.updateStatus('WaitingForWoW');
        break;

      case EOBSOutputSignal.Wrote:
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

    if (this.scene === undefined || this.scene === null) {
      throw new Error('[Recorder] No scene');
    }

    if (this.videoSource) {
      this.videoSource.release();
      this.videoSource.remove();
      this.videoScaleFactor = { x: 1, y: 1 };
    }

    if (obsCaptureMode === 'monitor_capture') {
      this.videoSource = Recorder.createMonitorCaptureSource(monitorIndex, captureCursor);
    } else if (obsCaptureMode === 'game_capture') {
      this.videoSource = Recorder.createGameCaptureSource(captureCursor);
    } else if (obsCaptureMode === 'window_capture') {
      this.videoSource = Recorder.createWindowCaptureSource(captureCursor);
    } else {
      throw new Error(`[Recorder] Unexpected mode: ${obsCaptureMode}`);
    }

    this.videoSceneItem = this.scene.add(this.videoSource);

    if (this.videoSourceSizeInterval) {
      clearInterval(this.videoSourceSizeInterval);
    }

    this.watchVideoSourceSize();

    // Re-add the overlay so it doesnt end up underneath the game itself.
    const overlayCfg = getOverlayConfig(this.cfg);
    this.configureOverlaySource(overlayCfg);
  }

  /**
   * Creates a monitor capture source.
   */
  private static createMonitorCaptureSource(monitorIndex: number, captureCursor: boolean) {
    Recorder.logger.info('[Recorder] Configuring OBS for Monitor Capture');

    const monitorCaptureSource = osn.InputFactory.create('monitor_capture', 'WR Monitor Capture');

    const { settings } = monitorCaptureSource;
    settings.monitor = monitorIndex;
    settings.capture_cursor = captureCursor;

    monitorCaptureSource.update(settings);
    monitorCaptureSource.save();

    return monitorCaptureSource;
  }

  /**
   * Creates a game capture source.
   */
  private static createGameCaptureSource(captureCursor: boolean) {
    Recorder.logger.info('[Recorder] Configuring OBS for Game Capture');

    const gameCaptureSource = osn.InputFactory.create('game_capture', 'WR Game Capture');

    const { settings } = gameCaptureSource;

    // This is the name of the retail window, we fall back to this
    // if we don't find something in the game capture source.
    let window = 'World of Warcraft:waApplication Window:Wow.exe';

    // Search the game capture source for WoW options.
    let prop = gameCaptureSource.properties.first();

    while (prop && prop.name !== 'window') {
      prop = prop.next();
    }

    if (prop.name === 'window' && osn.isListProperty(prop)) {
      // Filter the WoW windows, and reverse sort them alphabetically. This
      // is deliberate so that "waApplication" wins over the legacy "gxWindowClass".
      const windows = prop.details.items
        .filter((item) => {
          return item.name.includes('[Wow.exe]: World of Warcraft') || item.name.includes('魔兽世界');
        })
        .sort()
        .reverse();

      if (windows.length) {
        window = windows[0].value as string;
      }
    }

    settings.capture_mode = 'window';
    settings.allow_transparency = true;
    settings.priority = 1;
    settings.capture_cursor = captureCursor;
    settings.window = window;

    gameCaptureSource.update(settings);
    gameCaptureSource.save();
    gameCaptureSource.enabled = true;
    return gameCaptureSource;
  }

  /**
   * Creates a window capture source.
   */
  private static createWindowCaptureSource(captureCursor: boolean) {
    Recorder.logger.info('[Recorder] Configuring OBS for Window Capture');

    const windowCaptureSource = osn.InputFactory.create('window_capture', 'WR Window Capture', {
      cursor: captureCursor,
      window: 'World of Warcraft:waApplication Window:Wow.exe',
      // This corresponds to Windows Graphics Capture. The other mode "BITBLT" doesn't seem to work and
      // capture behind the WoW window. Not sure why, some googling suggested Windows theme issues.
      // See https://github.com/obsproject/obs-studio/blob/master/plugins/win-capture/window-capture.c#L70.
      method: 2,
    });

    return windowCaptureSource;
  }

  /**
   * Creates an image source.
   */
  private createOverlayImageSource() {
    Recorder.logger.info('[Recorder] Create image source for chat overlay');

    const settings = {
      file: getAssetPath('poster', 'chat-cover.png'),
    };

    this.overlayImageSource = osn.InputFactory.create('image_source', 'WR Chat Overlay', settings);

    if (this.overlayImageSource === null) {
      Recorder.logger.error('[Recorder] Failed to create image source');
    }
  }

  /**
   * Set the configured audio sources ot the OBS scene. This is public
   * so it can be called externally when WoW is opened - see the Poller
   * class. This removes any previously configured sources.
   */
  public configureAudioSources(config: ObsAudioConfig) {
    this.removeAudioSources();
    // uIOhook.removeAllListeners(); // TODO: fix uiohook
    this.mainWindow.webContents.send('updateMicStatus', MicStatus.NONE);

    const { audioInputDevices, audioOutputDevices, micVolume, speakerVolume, obsForceMono } = config;

    // Pretty sure these arguments are doing nothing.
    // See https://github.com/stream-labs/obs-studio-node/issues/1367.
    const track1 = osn.AudioTrackFactory.create(160, 'track1');
    osn.AudioTrackFactory.setAtIndex(track1, 1);

    audioInputDevices
      .split(',')
      .filter((id) => id)
      .forEach((id) => {
        Recorder.logger.info(`[Recorder] Adding input source ${id}`);
        const obsSource = this.createOBSAudioSource(id, TAudioSourceType.input);

        const micFader = osn.FaderFactory.create(0);
        micFader.attach(obsSource);
        micFader.mul = micVolume;
        this.faders.push(micFader);

        this.audioInputDevices.push(obsSource);
      });

    if (this.audioInputDevices.length > this.audioInputChannels.length) {
      Recorder.logger.warn(
        `[Recorder] Too many audio input devices, configuring first ${this.audioInputChannels.length}`,
      );

      this.audioInputDevices = this.audioInputDevices.slice(0, this.audioInputChannels.length);
    }

    if (this.audioInputDevices.length !== 0 && config.pushToTalk) {
      this.mainWindow.webContents.send('updateMicStatus', MicStatus.MUTED);
    } else if (this.audioInputDevices.length !== 0) {
      this.mainWindow.webContents.send('updateMicStatus', MicStatus.LISTENING);
    }

    this.audioInputDevices.forEach((device) => {
      const index = this.audioInputDevices.indexOf(device);
      const channel = this.audioInputChannels[index];

      if (obsForceMono) {
        device.flags = ESourceFlags.ForceMono;
      }

      this.addAudioSource(device, channel);
    });

    if (config.pushToTalk) {
      this.audioInputDevices.forEach((device) => {
        device.muted = true;
      });

      // this.inputDevicesMuted = true;

      // TODO: fix uiohook
      // const pttHandler = (fn: () => void, event: UiohookKeyboardEvent | UiohookMouseEvent) => {
      //   const convertedEvent = convertUioHookEvent(event);

      //   if (isPushToTalkHotkey(config, convertedEvent)) {
      //     fn();
      //   }
      // };

      // TODO: fix uiohook
      /* eslint-disable prettier/prettier */
      // uIOhook.on('keydown', (e) => pttHandler(() => this.unmuteInputDevices(), e));
      // uIOhook.on('keyup', (e) => pttHandler(() => this.muteInputDevices(), e));
      // uIOhook.on('mousedown', (e) => pttHandler(() => this.unmuteInputDevices(), e));
      // uIOhook.on('mouseup', (e) => pttHandler(() => this.muteInputDevices(), e));
      /* eslint-enable prettier/prettier */
    }

    audioOutputDevices
      .split(',')
      .filter((id) => id)
      .forEach((id) => {
        Recorder.logger.info(`[Recorder] Adding output source ${id}`);

        const obsSource = this.createOBSAudioSource(id, TAudioSourceType.output);

        const speakerFader = osn.FaderFactory.create(0);
        speakerFader.attach(obsSource);
        speakerFader.mul = speakerVolume;
        this.faders.push(speakerFader);
        this.audioOutputDevices.push(obsSource);
      });

    if (this.audioOutputDevices.length > this.audioOutputChannels.length) {
      Recorder.logger.warn(
        `[Recorder] Too many audio output devices, configuring first ${this.audioOutputChannels.length}`,
      );

      this.audioOutputDevices = this.audioOutputDevices.slice(0, this.audioOutputChannels.length);
    }

    this.audioOutputDevices.forEach((device) => {
      const index = this.audioOutputDevices.indexOf(device);
      const channel = this.audioOutputChannels[index];
      this.addAudioSource(device, channel);
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

    this.faders.forEach((fader) => {
      fader.detach();
      fader.destroy();
    });

    this.faders = [];

    this.audioInputDevices.forEach((device, idx) => {
      const channel = this.audioInputChannels[idx];
      this.removeAudioSource(device, channel);
    });

    this.audioOutputDevices.forEach((device, idx) => {
      const channel = this.audioOutputChannels[idx];
      this.removeAudioSource(device, channel);
    });

    this.audioInputDevices = [];
    this.audioOutputDevices = [];
  }

  /**
   * Add a single audio source to the OBS scene.
   */
  private addAudioSource(obsInput: IInput, channel: number) {
    Recorder.logger.info(`[Recorder] Adding OBS audio source ${obsInput.name} ${obsInput.id}`);

    if (!this.obsInitialized) {
      throw new Error('[Recorder] OBS not initialized');
    }

    if (channel <= 1 || channel >= 64) {
      throw new Error(`[Recorder] Invalid channel number ${channel}`);
    }

    osn.Global.setOutputSource(channel, obsInput);
  }

  /**
   * Remove a single audio source from the OBS scene.
   */
  private removeAudioSource(obsInput: IInput, channel: number) {
    if (!this.obsInitialized) {
      throw new Error('[Recorder] OBS not initialized');
    }

    Recorder.logger.info(`[Recorder] Removing OBS audio source ${obsInput.name} ${obsInput.id}`);

    osn.Global.setOutputSource(channel, null as unknown as ISource);
    obsInput.release();
    obsInput.remove();
  }

  /**
   * Release all OBS resources and shut it down.
   */
  public shutdownOBS() {
    Recorder.logger.info(`[Recorder] OBS shutting down ${this.uuid}`);

    if (!this.obsInitialized) {
      Recorder.logger.info('[Recorder] OBS not initialized so not attempting shutdown');
    }

    if (this.videoSourceSizeInterval) {
      clearInterval(this.videoSourceSizeInterval);
    }

    if (this.overlayImageSource) {
      this.overlayImageSource.release();
      this.overlayImageSource.remove();
    }

    if (this.videoSource) {
      this.videoSource.release();
      this.videoSource.remove();
    }

    osn.Global.setOutputSource(1, null as unknown as ISource);

    if (this.obsRecordingFactory) {
      osn.AdvancedRecordingFactory.destroy(this.obsRecordingFactory);
      this.obsRecordingFactory = undefined;
    }

    this.wroteQueue.empty();
    this.wroteQueue.clearListeners();
    this.startQueue.empty();
    this.startQueue.clearListeners();

    try {
      osn.NodeObs.OBS_service_removeCallback();
      osn.NodeObs.IPC.disconnect();
    } catch (e) {
      throw new Error(`Exception shutting down OBS process: ${e}`);
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
    this.recorderStartDate = new Date();

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
    await this.stopOBS();
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

    if (!this.obsRecordingFactory) {
      Recorder.logger.warn('[Recorder] Stop called but no recording factory');
      return;
    }

    // Set-up some state in preparation for awaiting out the overrun. This is
    // all to allow us to asynchronously delay an incoming start() call until we
    // are finished with the previous recording.
    const { overrun } = activity;
    Recorder.logger.info(`[Recorder] Stop recording after overrun: ${overrun}s`);
    const { promise, resolveHelper } = deferredPromiseHelper<void>();
    this.overrunPromise = promise;
    this.updateStatus('Overrunning');
    this.isOverruning = true;

    // Await for the specified overrun.
    await new Promise((resolve) => setTimeout(resolve, 1000 * overrun));

    // The ordering is crucial here, we don't want to call stopOBS more
    // than once in a row else we will crash the app. See issue 291.
    this.isRecording = false;
    await this.stopOBS();

    // Grab some details now before we start OBS again and they are forgotten.
    const bufferFile = this.obsRecordingFactory.lastFile();

    if (!bufferFile) {
      Recorder.logger.error('[Recorder] Unable to get the last file from OBS');
      return;
    }

    const relativeStart = (activity.startDate.getTime() - this.recorderStartDate.getTime()) / 1000;

    // Restart the buffer, it's important that we do this before we resolve the
    // overrun promise else we'll fail to start the following recording.
    if (!closedWow) {
      Recorder.logger.info('[Recorder] WoW not closed, so starting buffer');
      await this.startBuffer();
    }

    // Finally we can resolve the overrunPromise and allow any pending calls to
    // start() to go ahead by resolving the overrun promise.
    resolveHelper();
    this.isOverruning = false;

    const duration = activity.overrun + (activity.endDate.getTime() - activity.startDate.getTime()) / 1000;
    // If we got this far, we've got everything we need to process the
    // video. Add it to the queue for processing.
    this.videoProcessQueue.queueVideo({
      bufferFile,
      metadata: activity.metadata,
      filename: activity.fileName,
      relativeStart,
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

    await this.stopOBS();
    this.isRecording = false;
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
   * Tell OBS to start recording, and assert it signals that it has.
   */
  private async startOBS() {
    Recorder.logger.info('[Recorder] Start OBS called');

    if (!this.obsRecordingFactory) {
      Recorder.logger.warn('[Recorder] StartOBS called but no recording factory');
      return;
    }

    if (this.obsState !== ERecordingState.Offline) {
      Recorder.logger.warn(`[Recorder] OBS can't start, state is: ${this.obsState}`);
      return;
    }

    this.obsRecordingFactory.start();

    // Wait up to 30 seconds for OBS to signal it has started recording,
    // really this shouldn't take nearly as long.
    const startRace = await Promise.race([
      this.startQueue.shift(),
      getPromiseBomb(30000, '[Recorder] OBS timeout waiting for start'),
    ]);

    try {
      await startRace;
      this.startQueue.empty();
      this.recorderStartDate = new Date();
    } catch (error) {
      Recorder.logger.error(`[Recorder] Failed to start OBS: ${String(error)}`);
      this.updateStatus('FatalError', String(error));
    }
  }

  /**
   * Tell OBS to stop recording, and assert it signals that it has.
   */
  private async stopOBS() {
    Recorder.logger.info('[Recorder] Stop OBS called');

    if (!this.obsRecordingFactory) {
      Recorder.logger.warn('[Recorder] stopOBS called but no recording factory');
      return;
    }

    if (this.obsState !== ERecordingState.Recording) {
      Recorder.logger.warn(`[Recorder] OBS can't stop, current state is: ${this.obsState}`);
    }

    this.wroteQueue.empty();

    // Wait up to 30 seconds for OBS to signal it has wrote the file, really
    // this shouldn't take nearly as long as this but we're generous to account
    // for slow HDDs etc.
    const stopRace = Promise.race([
      this.wroteQueue.shift().then((a) => Recorder.logger.info(`[Recorder] shifted signal = ${a.signal}`)),
      getPromiseBomb(30000, '[Recorder] OBS timeout waiting for video file'),
    ]);

    this.obsRecordingFactory.stop();
    Recorder.logger.info(`[Recorder] Stop OBS signal sent`);

    try {
      await stopRace;
      this.wroteQueue.empty();
    } catch (error) {
      Recorder.logger.error(`[Recorder] Failed to stop OBS: ${String(error)}`);
      this.updateStatus('FatalError', String(error));
    }
  }

  /**
   * Get a list of the audio input devices. Used by the settings to populate
   * the list of devices for user selection.
   */
  public getInputAudioDevices() {
    if (!this.obsInitialized) {
      throw new Error('[Recorder] OBS not initialized');
    }

    const inputDevices = osn.NodeObs.OBS_settings_getInputAudioDevices() as IOBSDevice[];

    return inputDevices.filter((v) => v.id !== 'default');
  }

  /**
   * Get a list of the audio output devices. Used by the settings to populate
   * the list of devices for user selection.
   */
  public getOutputAudioDevices() {
    if (!this.obsInitialized) {
      throw new Error('[Recorder] OBS not initialized');
    }

    const outputDevices = osn.NodeObs.OBS_settings_getOutputAudioDevices() as IOBSDevice[];

    return outputDevices.filter((v) => v.id !== 'default');
  }

  /**
   * Create an OBS audio source.
   */
  private createOBSAudioSource(id: string, type: TAudioSourceType) {
    Recorder.logger.info(`[Recorder] Creating OBS audio source ${id} ${type}`);

    if (!this.obsInitialized) {
      throw new Error('[Recorder] OBS not initialized');
    }

    return osn.InputFactory.create(type, type === TAudioSourceType.input ? 'mic-audio' : 'desktop-audio', {
      device_id: id,
    });
  }

  /**
   * Return an array of all the encoders available to OBS.
   */
  public getAvailableEncoders() {
    Recorder.logger.info('[Recorder] Getting available encoders');

    if (!this.obsInitialized) {
      throw new Error('[Recorder] OBS not initialized');
    }

    const encoders = osn.VideoEncoderFactory.types();
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
    if (!this.videoSource) {
      throw new Error('[Recorder] videoSource was undefined');
    }

    if (!this.videoSceneItem) {
      throw new Error('[Recorder] videoSceneItem was undefined');
    }

    if (this.videoSource.width === 0 || this.videoSource.height === 0) {
      // This happens often, suspect it's before OBS gets a hook into a game capture process.
      return;
    }

    const { width, height } = obsResolutions[this.resolution];

    const xScaleFactor = Math.round((width / this.videoSource.width) * 100) / 100;

    const yScaleFactor = Math.round((height / this.videoSource.height) * 100) / 100;

    const newScaleFactor = { x: xScaleFactor, y: yScaleFactor };

    if (!isEqual(this.videoScaleFactor, newScaleFactor)) {
      Recorder.logger.info(`[Recorder] Rescaling from ${this.videoScaleFactor} to ${newScaleFactor}`);

      this.videoScaleFactor = newScaleFactor;
      this.videoSceneItem.scale = newScaleFactor;
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

    if (this.scene === undefined) {
      Recorder.logger.error('[Recorder] Scene undefined so not creating preview');
      return;
    }

    if (this.previewCreated) {
      Recorder.logger.warn('[Recorder] Preview display already exists');
      return;
    }

    osn.NodeObs.OBS_content_createSourcePreviewDisplay(
      this.mainWindow.getNativeWindowHandle(),
      this.scene.name,
      this.previewName,
    );

    osn.NodeObs.OBS_content_setShouldDrawUI(this.previewName, false);
    osn.NodeObs.OBS_content_setPaddingSize(this.previewName, 0);
    osn.NodeObs.OBS_content_setPaddingColor(this.previewName, 0, 0, 0);

    this.previewCreated = true;
  }

  public hidePreview() {
    if (!this.previewCreated) {
      Recorder.logger.warn('[Recorder] Preview display not created');
      return;
    }

    // I'd love to make OBS_content_destroyDisplay work here but I've not managed
    // so far. This is a hack to "hide" it by moving it off screen.
    this.previewLocation.xPos = 50000;
    this.previewLocation.yPos = 50000;

    osn.NodeObs.OBS_content_moveDisplay(this.previewName, this.previewLocation.xPos, this.previewLocation.yPos);
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

    osn.NodeObs.OBS_content_resizeDisplay(this.previewName, width * scaleFactor, height * scaleFactor);

    osn.NodeObs.OBS_content_moveDisplay(this.previewName, xPos * scaleFactor, yPos * scaleFactor);
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

    if (this.scene === undefined || this.overlayImageSource === undefined) {
      Recorder.logger.error(
        `[Recorder] Not applying overlay as scene or image source undefined ${this.scene} ${this.overlayImageSource}`,
      );

      return;
    }

    if (this.overlaySceneItem !== undefined) {
      this.overlaySceneItem.remove();
    }

    if (!chatOverlayEnabled) {
      return;
    }

    // This is the height of the chat overlay image, a bit ugly
    // to have it hardcoded here, but whatever.
    const baseWidth = 5000;
    const baseHeight = 2000;

    const toCropX = (baseWidth - chatOverlayWidth) / 2;
    const toCropY = (baseHeight - chatOverlayHeight) / 2;

    const overlaySettings: ISceneItemInfo = {
      name: 'overlay',
      crop: {
        left: toCropX,
        right: toCropX,
        top: toCropY,
        bottom: toCropY,
      },
      scaleX: 1,
      scaleY: 1,
      visible: true,
      x: chatOverlayXPosition,
      y: chatOverlayYPosition,
      rotation: 0,
      streamVisible: true,
      recordingVisible: true,
      scaleFilter: 0,
      blendingMode: 0,
    };

    this.overlaySceneItem = this.scene.add(this.overlayImageSource, overlaySettings);
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

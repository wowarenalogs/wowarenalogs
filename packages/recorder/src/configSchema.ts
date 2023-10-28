import { Schema } from 'electron-store';

export type ConfigurationSchema = {
  storagePath: string;
  bufferStoragePath: string;
  separateBufferPath: boolean;
  maxStorage: number;
  monitorIndex: number;
  audioInputDevices: string;
  audioOutputDevices: string;
  minEncounterDuration: number;
  obsOutputResolution: string;
  obsFPS: number;
  obsForceMono: boolean;
  obsKBitRate: number;
  obsCaptureMode: 'window_capture' | 'game_capture' | 'monitor_capture';
  obsRecEncoder: string;
  captureCursor: boolean;
  chatOverlayEnabled: boolean;
  chatOverlayWidth: number;
  chatOverlayHeight: number;
  chatOverlayXPosition: number;
  chatOverlayYPosition: number;
  speakerVolume: number;
  micVolume: number;
  pushToTalk: boolean;
  pushToTalkKey: number;
  pushToTalkMouseButton: number;
  pushToTalkModifiers: string;
};

export type ConfigurationSchemaKey = keyof ConfigurationSchema;

/**
 * Config schema. The descriptions included here may get displayed in the UI.
 */
export const configSchema: Schema<ConfigurationSchema> = {
  storagePath: {
    type: 'string',
    default: 'D:\\Video', // TODO: MUSTFIX default is bad
  },
  separateBufferPath: {
    description:
      'Enable storing temporary recordings in a seperate location. This should always be a local location. This feature is intended for people who want their final recordings to be on an NFS drive but not incur the network traffic of constantly recording to it.',
    type: 'boolean',
    default: false,
  },
  bufferStoragePath: {
    description:
      'Location to store temporary recordings. If left unset this will default to a folder inside the Storage Path.',
    type: 'string',
    default: '',
  },
  maxStorage: {
    description:
      'Maximum allowed storage that the application will consume for video files. The oldest videos will be deleted one by one to remain under the limit. Recording will not stop. Set to 0 to signify unlimited.',
    type: 'integer',
    default: 0,
    minimum: 0,
  },
  monitorIndex: {
    description: 'The monitor to record. Only applicible if monitor capture is selected.',
    type: 'integer',
    default: 1,
    minimum: 1,
    maximum: 4,
  },
  audioInputDevices: {
    description: 'Audio input devices to be included in the recording.',
    type: 'string',
    default: '',
  },
  audioOutputDevices: {
    description: 'Audio output devices to be included in the recording.',
    type: 'string',
    default: '',
  },
  minEncounterDuration: {
    description:
      'Minimum raid boss encounter duration, encounters shorter than this will not be recorded. This setting is aimed at avoiding saving boss resets.',
    type: 'integer',
    default: 15,
    maximum: 10000,
  },
  obsOutputResolution: {
    description:
      'Resolution of videos as saved on disk. Set this to the size of your WoW monitor, for now Warcraft Recorder does not support rescaling.',
    type: 'string',
    default: '1920x1080',
  },
  obsFPS: {
    description:
      'The number of frames per second to record the video at. Lower FPS gives smaller video size, but also more choppy playback.',
    type: 'integer',
    default: 60,
    minimum: 15,
    maximum: 60,
  },
  obsForceMono: {
    description:
      'Whether to force the audio of your input device to mono. Enable if your microphone audio is only playing out of one stereo channel.',
    type: 'boolean',
    default: true,
  },
  obsKBitRate: {
    description: 'Bit rate to record at. Lower bit rate values give smaller video size but worse video quality.',
    type: 'integer',
    default: 15,
    minimum: 1,
    maximum: 300,
  },
  obsCaptureMode: {
    description:
      'The capture mode OBS should use to record. Recommended is Window capture, but each have their own limitations. See #faq in discord for more details.',
    type: 'string',
    default: 'window_capture',
  },
  obsRecEncoder: {
    description:
      'The video encoder to use. Hardware encoders are typically preferable, usually giving better performance, but are specific to your graphics card.',
    type: 'string',
    default: 'obs_x264',
  },
  captureCursor: {
    description: 'Whether the cursor should be included in recordings.',
    type: 'boolean',
    default: false,
  },
  chatOverlayEnabled: {
    description: 'If a chat overlay should be added to the scene.',
    type: 'boolean',
    default: false,
  },
  chatOverlayWidth: {
    description: 'The width of the chat overlay.',
    type: 'integer',
    default: 700,
  },
  chatOverlayHeight: {
    description: 'The height of the chat overlay.',
    type: 'integer',
    default: 230,
  },
  chatOverlayXPosition: {
    description: 'The x-position of the chat overlay.',
    type: 'integer',
    default: 0,
  },
  chatOverlayYPosition: {
    description: 'The y-position of the chat overlay.',
    type: 'integer',
    default: 870,
  },
  speakerVolume: {
    description: 'The volume of your speakers in the recording, from 0 to 1.',
    type: 'integer',
    default: 1,
  },
  micVolume: {
    description: 'The volume of your mic in the recording, from 0 to 1.',
    type: 'integer',
    default: 1,
  },
  pushToTalk: {
    description: 'If the input audio devices should be recorded all the time, or only when a hotkey is held down.',
    type: 'boolean',
    default: false,
  },
  pushToTalkKey: {
    description: 'The push to talk hotkey, represented by the key code.',
    type: 'number',
    default: -1,
  },
  pushToTalkMouseButton: {
    description: 'The push to talk mouse button.',
    type: 'number',
    default: -1,
  },
  pushToTalkModifiers: {
    description: 'A comma seperated list of modifiers required in conjunction with the push to talk hotkey.',
    type: 'string',
    default: '',
  },
};

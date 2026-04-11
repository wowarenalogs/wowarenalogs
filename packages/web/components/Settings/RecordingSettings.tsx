import { IOBSDevice, RecStatus, ResolutionOptions } from '@wowarenalogs/recorder';
import { Dropdown, useClientContext } from '@wowarenalogs/shared';
import { useEffect, useRef, useState } from 'react';
import {
  TbAlertCircle,
  TbAlertOctagon,
  TbCaretDown,
  TbVideo,
  TbVideoMinus,
  TbVideoOff,
  TbVideoPlus,
} from 'react-icons/tb';

import { useAppConfig } from '../../hooks/AppConfigContext';
import { useVideoRecordingContext } from '../../hooks/VideoRecordingContext';
import { AudioMeterBar, sourceNameForDevice, useAudioLevels } from './AudioLevelMeter';

// TODO: Figure out a clean way to share options between the two systems
// Right now, if we export from @recorder anything concrete (ie not just types) we get
// dependencies here on Electron that nextjs won't like
const resolutionOptions: ResolutionOptions[] = [
  '1024x768',
  '1280x720',
  '1280x800',
  '1280x1024',
  '1360x768',
  '1366x768',
  '1440x900',
  '1600x900',
  '1680x1050',
  '1920x1080',
  '1920x1200',
  '2560x1080',
  '2560x1440',
  '2560x1600',
  '3440x1440',
  '3840x1080',
  '3440x1200',
  '3840x1440',
  '3840x1600',
  '3840x2160',
  '5120x1440',
];

const captureModes = [
  {
    key: 'game_capture',
    name: 'Game Capture',
  },
  {
    key: 'monitor_capture',
    name: 'Monitor/Display Capture',
  },
];

// more enum bullshit
// const recStatus = ['WaitingForWoW', 'Recording', 'InvalidConfig', 'ReadyToRecord', 'FatalError', 'Overruning'];
const recStates: Record<RecStatus | 'EngineNotStarted', { icon: JSX.Element; message: string }> = {
  EngineNotStarted: {
    icon: <TbVideo size={32} color="gray" />,
    message: 'Engine not started',
  },
  WaitingForWoW: {
    icon: <TbVideoOff size={32} color="yellow" />,
    message: 'Waiting for WoW process or settings change...',
  },
  Recording: {
    icon: <TbVideo size={32} color="green" />,
    message: 'Recording active',
  },
  InvalidConfig: {
    icon: <TbAlertCircle size={32} color="red" />,
    message: '',
  },
  ReadyToRecord: {
    icon: <TbVideoMinus size={32} color="aqua" />,
    message: 'Ready',
  },
  FatalError: {
    icon: <TbAlertOctagon size={32} color="red" />,
    message: 'Fatal error!',
  },
  Overrunning: {
    icon: <TbVideoPlus size={32} />,
    message: 'Recording overrun...',
  },
};

function PreviewVideoWindow() {
  const divRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rect = divRef.current?.getBoundingClientRect();
    window.wowarenalogs.obs?.drawPreviewWindow?.(rect?.width || 50, rect?.height || 50, rect?.x || 50, rect?.y || 50);
    return () => {
      window.wowarenalogs.obs?.hidePreviewWindow?.();
    };
  }, []);

  if (!window.wowarenalogs.obs?.drawPreviewWindow) return null;

  return (
    <div
      ref={divRef}
      onClick={() => {
        const rect = divRef.current?.getBoundingClientRect();
        window.wowarenalogs.obs?.drawPreviewWindow?.(
          rect?.width || 50,
          rect?.height || 50,
          rect?.x || 50,
          rect?.y || 50,
        );
      }}
      className="h-[200px] w-[400px]"
    />
  );
}

/**
 * Accepts an OBS device config list of device ids and removes the given id, if present
 * @param list Device id list (serialized format for config)
 * @param deviceId Id of device to remove
 * @returns New device id list (serialized for config)
 */
function removeDeviceId(list?: string, deviceId?: string) {
  if (list === undefined || list === null) return '';
  const devices = list.split(',').filter((i) => i);
  return devices.filter((i) => i !== deviceId).join(',');
}

/**
 * Accepts an OBS device config list of device ids and adds the given id
 * @param list Device id list (serialized format for config)
 * @param deviceId Id of device to add
 * @returns New device id list (serialized for config)
 */
function addDeviceId(list?: string, deviceId?: string) {
  if (list === undefined || list === null) return '';
  const devices = list
    .split(',')
    .filter((i) => i)
    .filter((i) => i !== deviceId);
  return [...devices, deviceId].join(',');
}

const RecordingSettings = () => {
  const clientContext = useClientContext();
  const { appConfig, updateAppConfig } = useAppConfig();
  const { recordingConfig, recordingStatus, recordingStatusError, encoderOptions } = useVideoRecordingContext();
  const [outputAudioOptions, setOutputAudioOptions] = useState<IOBSDevice[]>([]);
  const [inputAudioOptions, setInputAudioOptions] = useState<IOBSDevice[]>([]);
  const [pendingFps, setPendingFps] = useState<number | null>(null);
  const [pendingBitrate, setPendingBitrate] = useState<number | null>(null);
  const [pendingCqp, setPendingCqp] = useState<number | null>(null);
  const [pendingCrf, setPendingCrf] = useState<number | null>(null);
  const audioLevels = useAudioLevels();

  async function checkAudioDevices() {
    if (window.wowarenalogs.obs?.getAudioDevices) {
      const devices = await window.wowarenalogs.obs.getAudioDevices();
      setOutputAudioOptions(devices?.output || []);
      setInputAudioOptions(devices?.input || []);
    }
  }
  useEffect(() => {
    checkAudioDevices();
  }, []);

  useEffect(() => {
    if (!recordingConfig) return;
    setPendingFps(recordingConfig.obsFPS ?? null);
    setPendingBitrate(recordingConfig.obsKBitRate ?? null);
    setPendingCqp(recordingConfig.obsCQP ?? null);
    setPendingCrf(recordingConfig.obsCRF ?? null);
  }, [recordingConfig]);

  useEffect(() => {
    if (pendingFps === null) return;
    const handle = setTimeout(() => {
      if (pendingFps !== recordingConfig?.obsFPS) {
        window.wowarenalogs.obs?.setConfig?.('obsFPS', pendingFps);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [pendingFps, recordingConfig?.obsFPS]);

  useEffect(() => {
    if (pendingBitrate === null) return;
    const handle = setTimeout(() => {
      if (pendingBitrate !== recordingConfig?.obsKBitRate) {
        window.wowarenalogs.obs?.setConfig?.('obsKBitRate', pendingBitrate);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [pendingBitrate, recordingConfig?.obsKBitRate]);

  useEffect(() => {
    if (pendingCqp === null) return;
    const handle = setTimeout(() => {
      if (pendingCqp !== recordingConfig?.obsCQP) {
        window.wowarenalogs.obs?.setConfig?.('obsCQP', pendingCqp);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [pendingCqp, recordingConfig?.obsCQP]);

  useEffect(() => {
    if (pendingCrf === null) return;
    const handle = setTimeout(() => {
      if (pendingCrf !== recordingConfig?.obsCRF) {
        window.wowarenalogs.obs?.setConfig?.('obsCRF', pendingCrf);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [pendingCrf, recordingConfig?.obsCRF]);

  const engineStarted = !!appConfig.enableVideoRecording;

  const showDebugInfo = process.env.NODE_ENV === 'development' && clientContext.isDesktop;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-2xl font-bold mb-1">Video Recording</div>
      <div className="alert">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          className="stroke-info shrink-0 w-6 h-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          ></path>
        </svg>
        <span>For help setting up video recording, please see our pinned guide in the #faq channel on Discord.</span>
        <div className="flex-1 flex justify-end">
          <button
            className="btn btn-sm"
            onClick={() => window.wowarenalogs.links?.openExternalURL('https://discord.gg/NFTPK9tmJK')}
          >
            Go
          </button>
        </div>
      </div>
      <div className="flex flex-row gap-4">
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex flex-row">
            <div className="form-control">
              <label className="label gap-2 justify-start items-center">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={engineStarted}
                  onChange={async (e) => {
                    const shouldEnable = e.target.checked;
                    updateAppConfig((prev) => {
                      return {
                        ...prev,
                        enableVideoRecording: shouldEnable,
                      };
                    });

                    try {
                      if (shouldEnable) {
                        await window.wowarenalogs.obs?.startRecordingEngine?.();
                        if (!recordingConfig?.storagePath) {
                          if (appConfig.wowDirectory) {
                            await window.wowarenalogs.obs?.setConfig?.(
                              'storagePath',
                              appConfig.wowDirectory.startsWith('/') || appConfig.wowDirectory.startsWith('~')
                                ? appConfig.wowDirectory + '/Logs'
                                : appConfig.wowDirectory + '\\Logs',
                            );
                          } else {
                            window.alert('You haven\'t set your WoW path yet. Please do so in the "Basics" section.');
                          }
                        }
                      } else if (window.wowarenalogs.obs?.stopRecordingEngine) {
                        await window.wowarenalogs.obs.stopRecordingEngine();
                      } else {
                        window.alert(
                          'You are running an old version of the app that does not support this operation. Please update your WoW Arena Logs to the latest version.',
                        );
                      }
                    } catch (error) {
                      // eslint-disable-next-line no-console
                      console.error('[RecordingSettings] Failed to toggle video recording', error);
                      updateAppConfig((prev) => {
                        return {
                          ...prev,
                          enableVideoRecording: !shouldEnable,
                        };
                      });
                    }

                    await checkAudioDevices();
                  }}
                />
                <span className="label-text">Enable video recording</span>
              </label>
            </div>
            <div className="flex-1" />
          </div>
          {engineStarted && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-row gap-2 items-center">
                {recStates[recordingStatus] && recStates[recordingStatus].icon}
                {recStates[recordingStatus] && recStates[recordingStatus].message}
                {recordingStatusError}
              </div>
              <div className="flex flex-row flex-wrap gap-2 items-center">
                <Dropdown
                  menuItems={resolutionOptions.map((k) => ({
                    onClick: () => {
                      window.wowarenalogs.obs?.setConfig?.('obsOutputResolution', k);
                    },
                    key: k,
                    label: k,
                  }))}
                >
                  <div>{recordingConfig?.obsOutputResolution ?? 'Select video resolution'}</div>
                  <TbCaretDown size={20} />
                </Dropdown>
                <Dropdown
                  menuItems={captureModes.map((k) => ({
                    onClick: () => {
                      window.wowarenalogs.obs?.setConfig?.('obsCaptureMode', k.key);
                    },
                    key: k.key,
                    label: k.name,
                  }))}
                >
                  <div>
                    {captureModes.find((m) => m.key === recordingConfig?.obsCaptureMode)?.name ?? 'Select capture mode'}
                  </div>
                  <TbCaretDown size={20} />
                </Dropdown>
                {recordingConfig?.obsCaptureMode === 'monitor_capture' && (
                  <Dropdown
                    menuItems={[1, 2, 3, 4].map((k) => ({
                      onClick: () => {
                        window.wowarenalogs.obs?.setConfig?.('monitorIndex', k);
                      },
                      key: k.toString(),
                      label: k.toString(),
                    }))}
                  >
                    <div>{recordingConfig.monitorIndex ?? 'Select monitor'}</div>
                    <TbCaretDown size={20} />
                  </Dropdown>
                )}
                <div className="form-control">
                  <label className="label gap-2 justify-start items-center">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={recordingConfig?.captureCursor || false}
                      onChange={(e) => {
                        window.wowarenalogs.obs?.setConfig?.('captureCursor', e.target.checked);
                      }}
                    />
                    <span className="label-text">Capture cursor</span>
                  </label>
                </div>
              </div>
              <div className="flex flex-row-reverse gap-2">
                <input
                  type="text"
                  placeholder=""
                  readOnly
                  className="input input-sm input-bordered flex-1"
                  value={recordingConfig?.storagePath ?? ''}
                />
                <button
                  className="btn btn-sm gap-2"
                  onClick={async () => {
                    if (window.wowarenalogs.obs?.selectFolder) {
                      const folderChoice = await window.wowarenalogs.obs.selectFolder(
                        'Select folder to store videos to',
                      );
                      if (folderChoice.length > 0) {
                        window.wowarenalogs.obs?.setConfig?.('storagePath', folderChoice[0]);
                      }
                    }
                  }}
                >
                  Set VOD Directory
                </button>
              </div>
              <div>
                <div className="flex flex-row gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="font-bold">Recorded Audio Inputs</div>
                    {inputAudioOptions.map((o) => {
                      const checked = recordingConfig?.audioInputDevices.includes(o.id);
                      const level = audioLevels.get(sourceNameForDevice(o.id, 'input')) ?? 0;
                      return (
                        <div key={o.id} className="flex flex-col gap-1">
                          <div className="flex flex-row gap-1">
                            <input
                              type="checkbox"
                              className="checkbox mr-1"
                              checked={checked}
                              onChange={() => {
                                if (checked) {
                                  window.wowarenalogs.obs?.setConfig?.(
                                    'audioInputDevices',
                                    removeDeviceId(recordingConfig?.audioInputDevices, o.id),
                                  );
                                } else {
                                  window.wowarenalogs.obs?.setConfig?.(
                                    'audioInputDevices',
                                    addDeviceId(recordingConfig?.audioInputDevices, o.id),
                                  );
                                }
                              }}
                            />
                            {o.description}
                          </div>
                          {checked && audioLevels.size > 0 && <AudioMeterBar volume={level} />}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="font-bold">Recorded Audio Outputs</div>
                    {outputAudioOptions.map((o) => {
                      const checked = recordingConfig?.audioOutputDevices.includes(o.id);
                      const level = audioLevels.get(sourceNameForDevice(o.id, 'output')) ?? 0;
                      return (
                        <div key={o.id} className="flex flex-col gap-1">
                          <div className="flex flex-row gap-1">
                            <input
                              type="checkbox"
                              className="checkbox mr-1"
                              checked={checked}
                              onChange={() => {
                                if (checked) {
                                  window.wowarenalogs.obs?.setConfig?.(
                                    'audioOutputDevices',
                                    removeDeviceId(recordingConfig?.audioOutputDevices, o.id),
                                  );
                                } else {
                                  window.wowarenalogs.obs?.setConfig?.(
                                    'audioOutputDevices',
                                    addDeviceId(recordingConfig?.audioOutputDevices, o.id),
                                  );
                                }
                              }}
                            />
                            {o.description}
                          </div>
                          {checked && audioLevels.size > 0 && <AudioMeterBar volume={level} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="collapse collapse-arrow border border-base-300 bg-base-200 mt-2">
                <input type="checkbox" defaultChecked />
                <div className="collapse-title text-base font-semibold">Advanced</div>
                <div className="collapse-content">
                  <div className="text-sm opacity-70 mb-2">
                    Changes to encoder, FPS, or bitrate will restart the buffer and may briefly pause recording.
                  </div>
                  <div className="text-sm text-warning mb-3">
                    CQP/CRF are advanced encoder settings. Only change them if you know what they do.
                  </div>
                  <div className="flex flex-col gap-3">
                    {window.wowarenalogs.obs?.getEncoders && (
                      <div className="flex flex-col gap-1">
                        <div className="text-sm font-semibold">Encoder</div>
                        <Dropdown
                          menuItems={encoderOptions.map((k) => ({
                            onClick: () => {
                              window.wowarenalogs.obs?.setConfig?.('obsRecEncoder', k);
                            },
                            key: k,
                            label: k,
                          }))}
                        >
                          <div>{recordingConfig?.obsRecEncoder ?? 'Select encoding method'}</div>
                          <TbCaretDown size={20} />
                        </Dropdown>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="form-control">
                        <div className="label">
                          <span className="label-text">FPS</span>
                        </div>
                        <input
                          type="number"
                          min={15}
                          max={60}
                          step={1}
                          className="input input-sm input-bordered"
                          value={pendingFps ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              setPendingFps(null);
                              return;
                            }
                            const next = Math.max(15, Math.min(60, Math.round(Number(raw))));
                            if (!Number.isFinite(next)) return;
                            setPendingFps(next);
                          }}
                        />
                      </label>
                      <label className="form-control">
                        <div className="label">
                          <span className="label-text">Bitrate (Mbps)</span>
                        </div>
                        <input
                          type="number"
                          min={1}
                          max={300}
                          step={1}
                          className="input input-sm input-bordered"
                          value={pendingBitrate ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              setPendingBitrate(null);
                              return;
                            }
                            const next = Math.max(1, Math.min(300, Math.round(Number(raw))));
                            if (!Number.isFinite(next)) return;
                            setPendingBitrate(next);
                          }}
                        />
                      </label>
                      <label className="form-control">
                        <div className="label">
                          <span className="label-text">CQP</span>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={51}
                          step={1}
                          className="input input-sm input-bordered"
                          value={pendingCqp ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              setPendingCqp(null);
                              return;
                            }
                            const next = Math.max(0, Math.min(51, Math.round(Number(raw))));
                            if (!Number.isFinite(next)) return;
                            setPendingCqp(next);
                          }}
                        />
                      </label>
                      <label className="form-control">
                        <div className="label">
                          <span className="label-text">CRF</span>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={51}
                          step={1}
                          className="input input-sm input-bordered"
                          value={pendingCrf ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              setPendingCrf(null);
                              return;
                            }
                            const next = Math.max(0, Math.min(51, Math.round(Number(raw))));
                            if (!Number.isFinite(next)) return;
                            setPendingCrf(next);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        {engineStarted && (
          <div className="mr-2">
            <PreviewVideoWindow key={recordingConfig?.obsCaptureMode || 'no-mode'} />
          </div>
        )}
      </div>
      {showDebugInfo && engineStarted && (
        <div className="flex flex-col gap-2">
          <div className="divider" />
          <div className="flex gap-2">
            <button
              className="btn"
              onClick={async () => {
                await window.wowarenalogs.obs?.startBuffer?.();
                window.wowarenalogs.obs?.startRecording?.(4.8);
              }}
            >
              Test Start Recording
            </button>
            <button
              className="btn"
              onClick={async () => {
                await window.wowarenalogs.obs?.startBuffer?.();
              }}
            >
              Test Start Buffer
            </button>
            <button
              className="btn"
              onClick={async () => {
                const startDate = new Date(Date.now() - 4500);
                window.wowarenalogs.obs?.startRecording?.(4.5);
                await new Promise((resolve) => setTimeout(resolve, 5000));
                const now = new Date();
                window.wowarenalogs.obs?.stopRecording?.({
                  startDate,
                  endDate: now,
                  fileName: 'test-neg-backtrack',
                  overrun: 5,
                });
              }}
            >
              Test Backtrack 4.5s
            </button>
            <button
              className="btn"
              onClick={async () => {
                const startDate = new Date();
                window.wowarenalogs.obs?.startRecording?.(0);
                await new Promise((resolve) => setTimeout(resolve, 10000));
                const now = new Date();
                window.wowarenalogs.obs?.stopRecording?.({
                  startDate,
                  endDate: now,
                  fileName: 'test-backtrack-0',
                  overrun: 0,
                });
              }}
            >
              Test Backtrack 0s (10s)
            </button>
            <button
              className="btn"
              onClick={() => {
                const now = new Date();
                window.wowarenalogs.obs?.stopRecording?.({
                  // Test: a video starting 10s ago and 5s of overrun
                  // this should write a 15s video
                  startDate: new Date(now.getTime() - 10000),
                  endDate: new Date(),
                  fileName: 'test',
                  overrun: 5,
                });
              }}
            >
              Test Stop Recording
            </button>
            <button
              className="btn"
              onClick={() => {
                window.wowarenalogs.obs?.setConfig?.('storagePath', 'd');
              }}
            >
              Test Erase Storage Path Config
            </button>
          </div>
          <textarea className="textarea" readOnly rows={8} defaultValue={JSON.stringify(recordingConfig, null, 2)} />
        </div>
      )}
    </div>
  );
};

export default RecordingSettings;

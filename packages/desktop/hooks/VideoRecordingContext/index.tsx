import { ConfigurationSchema, RecStatus } from '@wowarenalogs/recorder';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { useAppConfig } from '../AppConfigContext';

type VideoRecordingContextType = {
  recordingStatus: RecStatus;
  recordingStatusError: string | null;
  recordingConfig: ConfigurationSchema | null;
  encoderOptions: string[];
};

export const VideoRecordingContext = createContext<VideoRecordingContextType>({
  recordingStatus: 'EngineNotStarted',
  recordingStatusError: null,
  recordingConfig: null,
  encoderOptions: [],
});

const supportedEncoders = ['amd_amf_h264', 'ffmpeg_nvenc', 'jim_nvenc', 'obs_x264'];

export const VideoRecordingContextProvider = ({ children }: { children: ReactNode }) => {
  const { appConfig } = useAppConfig();
  const [recordingStatus, setRecordingStatus] = useState<RecStatus>('EngineNotStarted');
  const [encoderOptions, setEncoderOptions] = useState<string[]>([]);
  const [recordingStatusError, setRecordStatusError] = useState<string | null>(null);
  const [recordingConfig, setRecordingConfig] = useState<ConfigurationSchema | null>(null);
  const [pendingAutoStart, setPendingAutoStart] = useState(true);

  // update config
  useEffect(() => {
    window.wowarenalogs.obs?.configUpdated?.((_e, newConf) => {
      setRecordingConfig(newConf || null);
    });

    return () => {
      window.wowarenalogs.obs?.removeAll_configUpdated_listeners?.();
    };
  }, []);

  // update recording status
  useEffect(() => {
    window.wowarenalogs.obs?.recorderStatusUpdated?.(async (_e, status, err) => {
      setRecordingStatus(status);
      setRecordStatusError(err || null);

      if (status !== 'EngineNotStarted') {
        setPendingAutoStart(false);
        if (window.wowarenalogs.obs?.getEncoders) {
          const encs = await window.wowarenalogs.obs.getEncoders();
          setEncoderOptions(encs?.filter((a) => supportedEncoders.includes(a)) || []);
        }
      }
    });

    return () => {
      window.wowarenalogs.obs?.removeAll_recorderStatusUpdated_listeners?.();
    };
  }, []);

  // auto start recording if previously enabled
  useEffect(() => {
    if (appConfig.enableVideoRecording && pendingAutoStart) {
      window.wowarenalogs.obs?.startRecordingEngine?.();
    }
  }, [appConfig.enableVideoRecording, pendingAutoStart]);

  return (
    <VideoRecordingContext.Provider value={{ recordingStatus, recordingStatusError, recordingConfig, encoderOptions }}>
      {children}
    </VideoRecordingContext.Provider>
  );
};

export const useVideoRecordingContext = () => {
  return useContext(VideoRecordingContext);
};

import { ConfigurationSchema, RecStatus } from '@wowarenalogs/recorder';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { useAppConfig } from '../AppConfigContext';

type VideoRecordingContextType = {
  recordingStatus: RecStatus;
  recordingStatusError: string | null;
  recordingConfig: ConfigurationSchema | null;
};

export const VideoRecordingContext = createContext<VideoRecordingContextType>({
  recordingStatus: 'EngineNotStarted',
  recordingStatusError: null,
  recordingConfig: null,
});

export const VideoRecordingContextProvider = ({ children }: { children: ReactNode }) => {
  const { appConfig } = useAppConfig();
  const [recordingStatus, setRecordingStatus] = useState<RecStatus>('EngineNotStarted');
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
    window.wowarenalogs.obs?.recorderStatusUpdated?.((_e, status, err) => {
      setRecordingStatus(status);
      setRecordStatusError(err || null);

      if (status !== 'EngineNotStarted') {
        setPendingAutoStart(false);
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
    <VideoRecordingContext.Provider value={{ recordingStatus, recordingStatusError, recordingConfig }}>
      {children}
    </VideoRecordingContext.Provider>
  );
};

export const useVideoRecordingContext = () => {
  return useContext(VideoRecordingContext);
};

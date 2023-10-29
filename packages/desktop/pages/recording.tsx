/* eslint-disable no-console */
import { ConfigurationSchema } from '@wowarenalogs/recorder';
import { useEffect, useState } from 'react';

import { useAppConfig } from '../hooks/AppConfigContext';

type IAudioDevice = {
  description: string;
  id: string;
};

const RecordingConfig = () => {
  const [outputAudioOptions, setOutputAudioOptions] = useState<IAudioDevice[]>();
  const [configStore, setConfigStore] = useState<ConfigurationSchema | undefined | null>(null);

  const platform = typeof window !== 'undefined' ? window.wowarenalogs.platform : '';

  const { wowInstallations } = useAppConfig();

  useEffect(() => {
    async function checkAudioDevices() {
      if (window.wowarenalogs.obs.getAudioDevices) {
        const devices = await window.wowarenalogs.obs.getAudioDevices();
        setOutputAudioOptions(devices?.output || []);
      }
      if (window.wowarenalogs.obs.getConfiguration) {
        const config = await window.wowarenalogs.obs.getConfiguration();
        setConfigStore(config);
      }
    }
    checkAudioDevices();
  }, []);

  useEffect(() => {
    if (window.wowarenalogs.obs.configUpdated) {
      window.wowarenalogs.obs.configUpdated((_e, newConf) => {
        console.log('new config', newConf);
        setConfigStore(newConf);
      });
    }
    return () =>
      window.wowarenalogs.obs.removeAll_configUpdated_listeners &&
      window.wowarenalogs.obs.removeAll_configUpdated_listeners();
  }, []);

  return (
    <div className="mt-8 text-base-content">
      <div className="flex flex-row justify-between">
        <div className="flex flex-col">
          <div>Platform: {platform}</div>
          <div>
            {wowInstallations.size} Installations
            {Array.from(wowInstallations).map((v) => (
              <div key={v[0]}>{v.join(': ')}</div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div>
            <div className="font-bold">Audio Output Device Options:</div>
            {outputAudioOptions?.map((a) => (
              <div
                key={a.id}
                onClick={() => {
                  window.wowarenalogs.obs.setConfig && window.wowarenalogs.obs.setConfig('audioOutputDevices', a.id);
                }}
              >
                {a.description}
              </div>
            ))}
          </div>
          <div>
            <div className="font-bold">Resolution:</div>
            {configStore?.obsOutputResolution}
          </div>
          <div>
            <div className="font-bold">Capture Mode:</div>
            {configStore?.obsCaptureMode}
          </div>
          <div>
            <div className="font-bold">VOD Storage Directory:</div>
            {configStore?.storagePath}
          </div>
          <div>
            <div className="font-bold">Audio Output Devices:</div>
            {configStore?.audioOutputDevices}
          </div>
        </div>
        <div>
          <pre>{JSON.stringify(configStore, null, 2)}</pre>
        </div>
        <div className="flex flex-col">
          <button
            className="btn"
            onClick={() => {
              window.wowarenalogs.obs?.startRecording && window.wowarenalogs.obs.startRecording();
            }}
          >
            Test Start Recording
          </button>
          <button
            className="btn"
            onClick={() => {
              window.wowarenalogs.obs?.stopRecording &&
                window.wowarenalogs.obs.stopRecording({
                  startDate: new Date(),
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
            onClick={async () => {
              window.wowarenalogs.obs?.getAudioDevices && console.log(await window.wowarenalogs.obs.getAudioDevices());
            }}
          >
            Preview Audio Devices
          </button>
          <button
            className="btn"
            onClick={() => {
              window.wowarenalogs.obs?.setConfig &&
                window.wowarenalogs.obs.setConfig('obsOutputResolution', '1680x1050');
            }}
          >
            test 1680
          </button>
          <button
            className="btn"
            onClick={() => {
              window.wowarenalogs.obs?.setConfig &&
                window.wowarenalogs.obs.setConfig('obsOutputResolution', '1920x1080');
            }}
          >
            test 1920
          </button>
          <button
            className="btn"
            onClick={() => {
              window.wowarenalogs.obs?.setConfig &&
                window.wowarenalogs.obs.setConfig('obsOutputResolution', '2560x1080');
            }}
          >
            test 2560
          </button>
          <button
            className="btn"
            onClick={() => {
              window.wowarenalogs.obs?.setConfig && window.wowarenalogs.obs.setConfig('obsCaptureMode', 'game_capture');
            }}
          >
            set game_capture
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecordingConfig;

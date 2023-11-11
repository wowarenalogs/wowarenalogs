import { LoadingScreen, useClientContext } from '@wowarenalogs/shared';
import { useEffect, useState } from 'react';
import { FaDiscord, FaPatreon } from 'react-icons/fa';

import RecordingSettings from '../components/Settings/RecordingSettings';
import { useAppConfig } from '../hooks/AppConfigContext';

const Page = () => {
  const { isLoading, appConfig, updateAppConfig } = useAppConfig();
  const clientContext = useClientContext();
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    if (window.wowarenalogs.app?.getVersion) {
      window.wowarenalogs.app.getVersion().then((version) => {
        setAppVersion(version);
      });
    }
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="flex flex-col m-2 gap-4">
      <div className="flex gap-2 items-center fixed bottom-4 right-4">
        <button
          className="btn btn-sm btn-info gap-2"
          onClick={() => {
            clientContext.openExternalURL('https://discord.gg/NFTPK9tmJK');
          }}
        >
          <FaDiscord />
          Join our Discord
        </button>
        <button
          className="btn btn-sm btn-success gap-2"
          onClick={() => {
            clientContext.openExternalURL('https://www.patreon.com/armsperson');
          }}
        >
          <FaPatreon />
          Support us on Patreon
        </button>
        {appVersion ? (
          <table className="rounded-box table table-compact">
            <thead>
              <tr>
                <th className="bg-base-300">Version</th>
                <td className="bg-base-200">{appVersion}</td>
              </tr>
            </thead>
          </table>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-2xl font-bold">Basics</div>
        <div className="flex flex-row form-control">
          <label className="label">
            <input
              type="checkbox"
              className="checkbox mr-2"
              checked={appConfig.launchAtStartup}
              onChange={(e) => {
                updateAppConfig((prev) => {
                  return {
                    ...prev,
                    launchAtStartup: e.target.checked,
                  };
                });
              }}
            />
            <span className="label-text">Launch WoW Arena Logs when computer starts.</span>
          </label>
        </div>
        <div className="flex flex-row-reverse gap-2">
          <input
            type="text"
            placeholder={`Please locate your ${
              window.wowarenalogs.platform === 'win32' ? 'WoW.exe' : 'World of Warcraft.app'
            }`}
            readOnly
            className={`input input-sm input-bordered flex-1 ${appConfig.wowDirectory ? '' : 'input-error'}`}
            value={appConfig.wowDirectory}
          />
          <button
            className="btn btn-sm gap-2"
            onClick={() => {
              window.wowarenalogs.fs
                ?.selectFolder()
                .then((folder) => {
                  updateAppConfig((prev) => {
                    return { ...prev, wowDirectory: folder };
                  });
                })
                .catch(() => {
                  return;
                });
            }}
          >
            Set WoW Path
          </button>
        </div>
      </div>
      <div className="divider" />
      {window.wowarenalogs.platform === 'win32' && window.wowarenalogs.obs && <RecordingSettings />}
    </div>
  );
};

export default Page;

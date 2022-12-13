import { LoadingScreen, useClientContext } from '@wowarenalogs/shared';
import { FaDiscord } from 'react-icons/fa';

import { useAppConfig } from '../hooks/AppConfigContext';

const Page = () => {
  const { isLoading, appConfig, updateAppConfig } = useAppConfig();
  const clientContext = useClientContext();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="flex flex-col m-2">
      <div className="text-2xl font-bold mb-2">Settings</div>
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
      <div className="text-2xl font-bold my-2">Support</div>
      <div className="flex flex-row">
        <button
          className="btn gap-2"
          onClick={() => {
            clientContext.openExternalURL('https://discord.gg/NFTPK9tmJK');
          }}
        >
          <FaDiscord />
          Join our Discord
        </button>
      </div>
    </div>
  );
};

export default Page;

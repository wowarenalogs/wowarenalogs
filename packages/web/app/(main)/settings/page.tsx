'use client';

import { features, getAnalyticsDeviceId, LoadingScreen, useClientContext } from '@wowarenalogs/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FaDiscord, FaPatreon } from 'react-icons/fa';

import RecordingSettings from '../../../components/Settings/RecordingSettings';
import { useAppConfig } from '../../../hooks/AppConfigContext';

export default function SettingsPage() {
  const { isLoading, appConfig, updateAppConfig } = useAppConfig();
  const clientContext = useClientContext();
  const [appVersion, setAppVersion] = useState('');
  const [featureCode, setFeatureCode] = useState('');
  const [sentryId, setSentryId] = useState('');

  const validFlags = useMemo(() => new Set(Object.values(features)), []);

  const activeFlags = useMemo(
    () => (appConfig.flags || []).filter((f) => validFlags.has(f)),
    [appConfig.flags, validFlags],
  );

  const parseCode = useCallback(() => {
    if (featureCode.startsWith('add:')) {
      updateAppConfig((prev) => {
        return {
          ...prev,
          flags: [featureCode.slice(4), ...(appConfig.flags || [])],
        };
      });
    } else if (featureCode.startsWith('drop:')) {
      updateAppConfig((prev) => {
        return {
          ...prev,
          flags: (appConfig.flags || []).filter((a) => a !== featureCode.slice(5)),
        };
      });
    }
  }, [appConfig.flags, featureCode, updateAppConfig]);

  // Intentionally leaving console log here so I can debug some in prod
  // eslint-disable-next-line no-console
  console.log(appConfig.flags);

  useEffect(() => {
    if (window.wowarenalogs.app?.getVersion) {
      window.wowarenalogs.app.getVersion().then((version) => {
        setAppVersion(version);
      });
    }
    setSentryId(getAnalyticsDeviceId() || '');
  }, []);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="flex flex-col p-4 gap-6 max-w-4xl">
      <div className="text-3xl font-bold">Settings</div>

      <div className="card bg-base-200 shadow-sm">
        <div className="card-body gap-4">
          <h2 className="card-title">Basics</h2>
          <div className="form-control">
            <label className="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                className="checkbox"
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
          <div className="flex flex-row gap-2 items-center">
            <button
              className="btn btn-sm btn-outline"
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
            <input
              type="text"
              placeholder={`Please locate your ${
                window.wowarenalogs.platform === 'win32' ? 'WoW.exe' : 'World of Warcraft.app'
              }`}
              readOnly
              className={`input input-sm input-bordered flex-1 ${appConfig.wowDirectory ? '' : 'input-error'}`}
              value={appConfig.wowDirectory}
            />
          </div>
        </div>
      </div>

      <div className="card bg-base-200 shadow-sm">
        <div className="card-body gap-4">
          <h2 className="card-title">Feature Codes</h2>
          <div className="flex flex-row gap-2 items-center">
            <button
              className="btn btn-sm btn-outline"
              onClick={() => {
                parseCode();
              }}
            >
              Use feature code
            </button>
            <input
              type="text"
              placeholder="Enter feature code here"
              className="input input-sm input-bordered flex-1"
              value={featureCode}
              onChange={(e) => setFeatureCode(e.target.value)}
            />
          </div>
          {activeFlags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeFlags.map((flag) => (
                <span key={flag} className="badge badge-outline gap-1">
                  {flag}
                  <button
                    className="text-xs opacity-60 hover:opacity-100"
                    onClick={() => {
                      updateAppConfig((prev) => ({
                        ...prev,
                        flags: (prev.flags || []).filter((f) => f !== flag),
                      }));
                    }}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {window.wowarenalogs.platform === 'win32' && window.wowarenalogs.obs && <RecordingSettings />}

      <div className="card bg-base-200 shadow-sm">
        <div className="card-body gap-3">
          <h2 className="card-title">About</h2>
          <div className="flex flex-col gap-2 text-sm">
            {appVersion && (
              <div className="flex items-center gap-2">
                <span className="font-semibold opacity-70">Version</span>
                <span>{appVersion}</span>
              </div>
            )}
            {sentryId && (
              <div className="flex items-center gap-2">
                <span className="font-semibold opacity-70">Session ID</span>
                <span className="font-mono text-xs">{sentryId}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-2">
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
          </div>
        </div>
      </div>
    </div>
  );
}

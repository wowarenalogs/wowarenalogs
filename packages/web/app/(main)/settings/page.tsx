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
    <div className="mt-2 overflow-visible overflow-y-auto px-2 pb-20 sm:mt-4 sm:px-4">
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-base-300 p-4">
          <div className="text-2xl font-bold mb-3">Basics</div>
          <div className="flex flex-col gap-3">
            <div className="form-control">
              <label className="label gap-2 justify-start items-center cursor-pointer">
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
                <span className="label-text">Launch WoW Arena Logs when computer starts</span>
              </label>
            </div>
            <div>
              <div className="text-sm font-semibold mb-1 opacity-70">WoW Installation Path</div>
              <div className="flex flex-row gap-2">
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
                  className="btn btn-sm btn-primary"
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
                  Browse
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-base-300 p-4">
          <div className="text-2xl font-bold mb-3">Feature Codes</div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-row gap-2">
              <input
                type="text"
                placeholder="Enter feature code here"
                className="input input-sm input-bordered flex-1"
                value={featureCode}
                onChange={(e) => setFeatureCode(e.target.value)}
              />
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  parseCode();
                }}
              >
                Apply
              </button>
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

        <div className="rounded-lg bg-base-300 p-4">
          <div className="text-2xl font-bold mb-3">About</div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-row gap-4 flex-wrap">
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
            {(appVersion || sentryId) && (
              <div className="flex flex-col gap-1 text-sm opacity-70">
                {appVersion && (
                  <div>
                    <span className="font-semibold">Version:</span> {appVersion}
                  </div>
                )}
                {sentryId && (
                  <div>
                    <span className="font-semibold">Session:</span> {sentryId}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [anthropicKey, setAnthropicKey] = useState('');
  const [blizzardClientId, setBlizzardClientId] = useState('');
  const [blizzardClientSecret, setBlizzardClientSecret] = useState('');
  const [keySaved, setKeySaved] = useState(false);

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
    window.wowarenalogs.settings?.getSettings?.().then((s) => {
      if (s?.anthropicApiKey) setAnthropicKey(s.anthropicApiKey);
      if (s?.blizzardClientId) setBlizzardClientId(s.blizzardClientId);
      if (s?.blizzardClientSecret) setBlizzardClientSecret(s.blizzardClientSecret);
    });
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
                <td>{sentryId}</td>
              </tr>
            </thead>
          </table>
        ) : null}
        {sentryId ? (
          <table className="rounded-box table table-compact">
            <thead>
              <tr>
                <th className="bg-base-300">Session</th>
                <td className="bg-base-200">{sentryId}</td>
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
      <div className="flex flex-col gap-2">
        <div className="flex flex-row-reverse gap-2">
          <input
            type="text"
            placeholder={`enter feature code here`}
            className={`input input-sm input-bordered flex-1`}
            value={featureCode}
            onChange={(e) => setFeatureCode(e.target.value)}
          />
          <button
            className="btn btn-sm gap-2"
            onClick={() => {
              parseCode();
            }}
          >
            Use feature code
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
      <div className="divider" />
      <div className="flex flex-col gap-2">
        <div className="text-2xl font-bold">AI Analysis</div>
        <div className="text-sm opacity-60">Required for AI match analysis. Get a key at console.anthropic.com.</div>
        <div className="flex flex-row gap-2">
          <input
            type="password"
            placeholder="sk-ant-..."
            className="input input-sm input-bordered flex-1 font-mono"
            value={anthropicKey}
            onChange={(e) => {
              setAnthropicKey(e.target.value);
              setKeySaved(false);
            }}
          />
          <button
            className="btn btn-sm btn-primary"
            disabled={!anthropicKey.trim()}
            onClick={() => {
              window.wowarenalogs.settings
                ?.saveSettings?.({ anthropicApiKey: anthropicKey.trim(), blizzardClientId, blizzardClientSecret })
                .then(() => {
                  setKeySaved(true);
                  setTimeout(() => setKeySaved(false), 2000);
                });
            }}
          >
            {keySaved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
      <div className="divider" />
      <div className="flex flex-col gap-2">
        <div className="text-2xl font-bold">Battle.net Login</div>
        <div className="text-sm opacity-60 mb-1">
          Register an OAuth app at <span className="font-mono">develop.battle.net</span> with redirect URI{' '}
          <span className="font-mono">http://127.0.0.1:3088/api/auth/callback/battlenet</span>. Restart the app after
          saving.
        </div>
        <label className="block text-sm font-semibold mb-1">Client ID</label>
        <input
          type="text"
          className="input input-sm input-bordered w-full font-mono"
          value={blizzardClientId}
          onChange={(e) => {
            setBlizzardClientId(e.target.value);
            setKeySaved(false);
          }}
        />
        <label className="block text-sm font-semibold mb-1">Client Secret</label>
        <input
          type="password"
          className="input input-sm input-bordered w-full font-mono"
          value={blizzardClientSecret}
          onChange={(e) => {
            setBlizzardClientSecret(e.target.value);
            setKeySaved(false);
          }}
        />
        <button
          className="btn btn-sm btn-primary w-24"
          disabled={!blizzardClientId.trim() || !blizzardClientSecret.trim()}
          onClick={() => {
            window.wowarenalogs.settings
              ?.saveSettings?.({
                anthropicApiKey: anthropicKey,
                blizzardClientId: blizzardClientId.trim(),
                blizzardClientSecret: blizzardClientSecret.trim(),
              })
              .then(() => {
                setKeySaved(true);
                setTimeout(() => setKeySaved(false), 2000);
              });
          }}
        >
          {keySaved ? 'Saved!' : 'Save'}
        </button>
      </div>
      <div className="divider" />
      {window.wowarenalogs.platform === 'win32' && window.wowarenalogs.obs && <RecordingSettings />}
    </div>
  );
}

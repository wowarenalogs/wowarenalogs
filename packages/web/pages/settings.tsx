import React, { useEffect, useState } from 'react';

import { MainLayout } from '@wowarenalogs/shared';

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    window.wowarenalogs?.settings?.getAnthropicApiKey?.().then((key: string | null) => {
      if (key) setApiKey(key);
      setLoaded(true);
    });
  }, []);

  const handleSave = async () => {
    await window.wowarenalogs?.settings?.setAnthropicApiKey?.(apiKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!loaded) return null;

  return (
    <MainLayout>
      <div className="p-6 max-w-lg">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>
        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">Anthropic API Key</label>
          <p className="text-xs opacity-60 mb-2">Required for AI match analysis. Get one at console.anthropic.com.</p>
          <input
            type="password"
            className="input input-bordered w-full font-mono text-sm"
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setSaved(false);
            }}
          />
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={!apiKey.trim()}>
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>
    </MainLayout>
  );
}

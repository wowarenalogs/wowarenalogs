'use client';

import { AtomicArenaCombat, CombatUnitReaction, CombatUnitType, WoWCombatLogParser } from '@wowarenalogs/parser';
import { buildMatchContext } from '@wowarenalogs/shared/src/components/CombatReport/CombatAIAnalysis';
import { useCallback, useRef, useState } from 'react';

interface DebugInfo {
  model: string;
  systemPrompt: string;
  userMessage: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

type Tab = 'context' | 'system' | 'response';

export default function AITestPage() {
  const [matches, setMatches] = useState<AtomicArenaCombat[]>([]);
  const [selected, setSelected] = useState<AtomicArenaCombat | null>(null);
  const [fileName, setFileName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [tab, setTab] = useState<Tab>('context');
  const inputRef = useRef<HTMLInputElement>(null);

  const parseFile = useCallback((file: File) => {
    setMatches([]);
    setSelected(null);
    setAnalysis('');
    setDebugInfo(null);
    setError('');
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parser = new WoWCombatLogParser(null, Intl.DateTimeFormat().resolvedOptions().timeZone);
      const found: AtomicArenaCombat[] = [];
      parser.on('arena_match_ended', (c) => found.push(c));
      parser.on('solo_shuffle_round_ended', (c) => found.push(c));
      for (const line of text.split('\n')) parser.parseLine(line);
      parser.flush();
      setMatches(found);
      if (found.length > 0) setSelected(found[0]);
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) parseFile(file);
    },
    [parseFile],
  );

  const getContext = () => {
    if (!selected) return '';
    const units = Object.values(selected.units);
    const friends = units.filter((u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Friendly);
    const enemies = units.filter((u) => u.type === CombatUnitType.Player && u.reaction === CombatUnitReaction.Hostile);
    return buildMatchContext(selected, friends, enemies);
  };

  const handleSend = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');
    setAnalysis('');
    setDebugInfo(null);
    try {
      const matchContext = getContext();
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchContext, apiKey: apiKey || undefined, debug: true }),
      });
      const data = (await res.json()) as { analysis?: string; error?: string; debug?: DebugInfo };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Request failed');
      setAnalysis(data.analysis ?? '');
      if (data.debug) setDebugInfo(data.debug);
      setTab('response');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const context = selected ? getContext() : '';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-base-200 border-b border-base-300 shrink-0">
        <span className="font-semibold text-sm">AI Test</span>

        {matches.length > 0 && (
          <>
            <span className="text-xs opacity-40">{fileName}</span>
            <div className="flex gap-1">
              {matches.map((m, i) => (
                <button
                  key={m.id}
                  className={`btn btn-xs ${selected?.id === m.id ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => {
                    setSelected(m);
                    setAnalysis('');
                    setDebugInfo(null);
                    setTab('context');
                  }}
                >
                  {m.startInfo?.bracket ?? '?'} #{i + 1}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex-1" />

        <input
          type="password"
          placeholder="sk-ant-... (API key)"
          className="input input-xs input-bordered font-mono w-56"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <button className="btn btn-xs btn-primary" disabled={!selected || loading} onClick={handleSend}>
          {loading ? <span className="loading loading-spinner loading-xs" /> : 'Send to Claude'}
        </button>
        <button className="btn btn-xs btn-ghost" onClick={() => inputRef.current?.click()}>
          Load file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) parseFile(file);
          }}
        />
      </div>

      {/* Metadata bar when debug info available */}
      {debugInfo && (
        <div className="flex items-center gap-4 px-4 py-1 bg-base-300 text-xs opacity-60 shrink-0">
          <span>
            Model: <strong>{debugInfo.model}</strong>
          </span>
          <span>
            Input tokens: <strong>{debugInfo.inputTokens.toLocaleString()}</strong>
          </span>
          <span>
            Output tokens: <strong>{debugInfo.outputTokens.toLocaleString()}</strong>
          </span>
          <span>
            Duration: <strong>{(debugInfo.durationMs / 1000).toFixed(1)}s</strong>
          </span>
        </div>
      )}

      {error && <div className="alert alert-error alert-sm rounded-none text-sm px-4 py-2 shrink-0">{error}</div>}

      {/* Drop zone when no file */}
      {matches.length === 0 && (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-4 border-2 border-dashed border-base-300 m-4 rounded-xl cursor-pointer"
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
        >
          <p className="font-medium opacity-60">Drop a WoW combat log file here or click to browse</p>
        </div>
      )}

      {/* Tabs + content */}
      {selected && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="tabs tabs-bordered px-4 shrink-0">
            <button className={`tab tab-sm ${tab === 'context' ? 'tab-active' : ''}`} onClick={() => setTab('context')}>
              User message ({context.split('\n').length} lines)
            </button>
            <button className={`tab tab-sm ${tab === 'system' ? 'tab-active' : ''}`} onClick={() => setTab('system')}>
              System prompt
            </button>
            <button
              className={`tab tab-sm ${tab === 'response' ? 'tab-active' : ''} ${analysis ? 'text-success' : ''}`}
              onClick={() => setTab('response')}
            >
              Response {analysis ? '✓' : ''}
            </button>
          </div>

          <div className="flex-1 overflow-auto p-4">
            {tab === 'context' && (
              <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                {context || 'No context — select a match'}
              </pre>
            )}
            {tab === 'system' && (
              <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                {debugInfo?.systemPrompt ?? '(send a request first to see the exact system prompt used)'}
              </pre>
            )}
            {tab === 'response' && (
              <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                {loading ? 'Waiting for response…' : analysis || '(no response yet — click Send to Claude)'}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

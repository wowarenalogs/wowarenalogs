'use client';

import { AtomicArenaCombat, WoWCombatLogParser } from '@wowarenalogs/parser';
import { CombatReport } from '@wowarenalogs/shared';
import { useCallback, useRef, useState } from 'react';

type ParseState = 'idle' | 'parsing' | 'done' | 'error';

export default function LocalLogPage() {
  const [matches, setMatches] = useState<AtomicArenaCombat[]>([]);
  const [selected, setSelected] = useState<AtomicArenaCombat | null>(null);
  const [state, setState] = useState<ParseState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const parseFile = useCallback((file: File) => {
    setState('parsing');
    setMatches([]);
    setSelected(null);
    setErrorMsg('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parser = new WoWCombatLogParser(null, Intl.DateTimeFormat().resolvedOptions().timeZone);
        const found: AtomicArenaCombat[] = [];

        parser.on('arena_match_ended', (combat) => found.push(combat));
        parser.on('solo_shuffle_round_ended', (combat) => found.push(combat));

        for (const line of text.split('\n')) {
          parser.parseLine(line);
        }
        parser.flush();

        if (found.length === 0) {
          setErrorMsg('No completed arena matches found in this log file.');
          setState('error');
        } else {
          setMatches(found);
          setSelected(found[0]);
          setState('done');
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to parse log file.');
        setState('error');
      }
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read file.');
      setState('error');
    };
    reader.readAsText(file);
  }, []);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) parseFile(file);
    },
    [parseFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) parseFile(file);
    },
    [parseFile],
  );

  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  if (selected) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-2 bg-base-200 border-b border-base-300">
          <span className="text-sm opacity-60">{fileName}</span>
          <div className="flex gap-1">
            {matches.map((m, i) => (
              <button
                key={m.id}
                className={`btn btn-xs ${selected.id === m.id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSelected(m)}
              >
                {m.startInfo.bracket} #{i + 1}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button className="btn btn-ghost btn-xs" onClick={() => { setSelected(null); setState('idle'); setMatches([]); setFileName(''); }}>
            Load another file
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <CombatReport combat={selected} matchId={selected.id} viewerIsOwner={true} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-1">Local Log Viewer</h2>
        <p className="text-sm opacity-60">Load a WoW combat log file to view arena match reports</p>
      </div>

      <div
        className="border-2 border-dashed border-base-300 rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer hover:border-primary transition-colors w-full max-w-md"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".txt" className="hidden" onChange={onFileChange} />
        {state === 'parsing' ? (
          <>
            <span className="loading loading-spinner loading-lg text-primary" />
            <span className="text-sm opacity-60">Parsing {fileName}…</span>
          </>
        ) : (
          <>
            <svg className="w-12 h-12 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="text-center">
              <p className="font-medium">Drop a log file here</p>
              <p className="text-sm opacity-60">or click to browse</p>
            </div>
            <p className="text-xs opacity-40">WoWCombatLog.txt or any arena log export</p>
          </>
        )}
      </div>

      {state === 'error' && (
        <div className="alert alert-error max-w-md">
          <span>{errorMsg}</span>
        </div>
      )}

      <p className="text-xs opacity-40">
        Test logs are in <code>packages/parser/test/testlogs/</code>
      </p>
    </div>
  );
}

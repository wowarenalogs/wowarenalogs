import { useEffect, useRef, useState } from 'react';

function MeterBar({ volume }: { volume: number }) {
  const pct = Math.min(100, Math.max(0, volume * 100));
  const barColor = volume < 0.3 ? 'bg-gray-400' : volume < 0.85 ? 'bg-success' : 'bg-error';

  return (
    <div className="relative w-full h-3 bg-base-300 rounded overflow-hidden">
      <div className={`h-full transition-all duration-75 ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Displays real-time audio level meter bars for input and output audio sources.
 * Listens for volmeter IPC events from the recorder's OBS integration and shows
 * the peak level across all sources of each type.
 */
const AudioLevelMeters = () => {
  const [inputVolume, setInputVolume] = useState(0);
  const [outputVolume, setOutputVolume] = useState(0);
  const lastInputUpdate = useRef(0);
  const lastOutputUpdate = useRef(0);

  useEffect(() => {
    if (!window.wowarenalogs.obs?.audioVolumeChanged) return;

    const handler = (_evt: unknown, sourceType: 'input' | 'output', _sourceName: string, vol: number) => {
      const now = Date.now();
      if (sourceType === 'input') {
        if (now - lastInputUpdate.current >= 100) {
          lastInputUpdate.current = now;
          setInputVolume(vol);
        }
      } else {
        if (now - lastOutputUpdate.current >= 100) {
          lastOutputUpdate.current = now;
          setOutputVolume(vol);
        }
      }
    };

    window.wowarenalogs.obs.audioVolumeChanged(
      handler as Parameters<NonNullable<typeof window.wowarenalogs.obs.audioVolumeChanged>>[0],
    );

    return () => {
      window.wowarenalogs.obs?.removeAll_audioVolumeChanged_listeners?.();
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <div className="text-xs font-semibold">Input Level</div>
        <MeterBar volume={inputVolume} />
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-xs font-semibold">Output Level</div>
        <MeterBar volume={outputVolume} />
      </div>
    </div>
  );
};

export default AudioLevelMeters;

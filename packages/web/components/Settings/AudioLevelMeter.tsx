import { useEffect, useRef, useState } from 'react';

const SMOOTHING_ALPHA = 0.3;
const DECAY_DELAY_MS = 200;
const DECAY_RATE = 0.92;
const NOISE_GATE = 0.02;

interface SourceState {
  type: 'input' | 'output';
  rawVolume: number;
  displayVolume: number;
  lastSignalTime: number;
}

/**
 * Convert linear amplitude (0-1) to a perceptual 0-100 scale.
 * Maps -60dB..0dB to 0..100 so moderate volumes fill a reasonable portion of the bar.
 */
function linearToMeterPct(linear: number): number {
  if (linear <= 0.01) return 0;
  const db = 20 * Math.log10(linear); // 0dB = max, -40dB = silence
  const clamped = Math.max(-40, Math.min(0, db));
  return ((clamped + 40) / 40) * 100;
}

export function AudioMeterBar({ volume }: { volume: number }) {
  const pct = linearToMeterPct(volume);
  const barColor = pct < 1 ? 'bg-base-content/20' : pct < 75 ? 'bg-success' : pct < 90 ? 'bg-warning' : 'bg-error';

  return (
    <div className="relative w-full h-2.5 bg-base-300 rounded overflow-hidden">
      <div className={`h-full rounded ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Match a device ID to a volmeter source name.
 * Recorder creates sources as `mic-${id.slice(0, 20)}` / `desktop-${id.slice(0, 20)}`.
 */
export function sourceNameForDevice(deviceId: string, type: 'input' | 'output'): string {
  const prefix = type === 'input' ? 'mic-' : 'desktop-';
  return `${prefix}${deviceId.slice(0, 20)}`;
}

/**
 * Hook that subscribes to volmeter IPC events and returns smoothed per-source
 * volume levels, updated via requestAnimationFrame.
 */
export function useAudioLevels(): Map<string, number> {
  const sourcesRef = useRef<Map<string, SourceState>>(new Map());
  const rafRef = useRef<number>(0);
  const [volumes, setVolumes] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!window.wowarenalogs.obs?.audioVolumeChanged) return;

    const handler = (_evt: unknown, sourceType: 'input' | 'output', sourceName: string, vol: number) => {
      const gated = vol < NOISE_GATE ? 0 : vol;
      const sources = sourcesRef.current;
      const existing = sources.get(sourceName);
      if (existing) {
        existing.rawVolume = gated;
        existing.lastSignalTime = Date.now();
      } else {
        sources.set(sourceName, {
          type: sourceType,
          rawVolume: gated,
          displayVolume: 0,
          lastSignalTime: Date.now(),
        });
      }
    };

    window.wowarenalogs.obs.audioVolumeChanged(
      handler as Parameters<NonNullable<typeof window.wowarenalogs.obs.audioVolumeChanged>>[0],
    );

    let lastFrame = 0;
    const animate = (time: number) => {
      rafRef.current = requestAnimationFrame(animate);

      if (time - lastFrame < 33) return;
      lastFrame = time;

      const sources = sourcesRef.current;
      const now = Date.now();
      let changed = false;

      for (const state of sources.values()) {
        const timeSinceSignal = now - state.lastSignalTime;
        const target = timeSinceSignal > DECAY_DELAY_MS ? 0 : state.rawVolume;

        let next: number;
        if (target === 0 && state.displayVolume > 0) {
          next = state.displayVolume * DECAY_RATE;
          if (next < NOISE_GATE) next = 0;
        } else {
          next = state.displayVolume + SMOOTHING_ALPHA * (target - state.displayVolume);
        }

        if (Math.abs(next - state.displayVolume) > 0.001) {
          state.displayVolume = next;
          changed = true;
        }
      }

      if (changed) {
        const snapshot = new Map<string, number>();
        for (const [id, state] of sources) {
          snapshot.set(id, state.displayVolume);
        }
        setVolumes(snapshot);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.wowarenalogs.obs?.removeAll_audioVolumeChanged_listeners?.();
    };
  }, []);

  return volumes;
}

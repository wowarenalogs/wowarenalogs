import { useMemo } from 'react';

import { fmtTime } from '../../../utils/cooldowns';
import {
  type DispelPriority,
  type IDispelEvent,
  type IMissedCleanseWindow,
  reconstructDispelSummary,
} from '../../../utils/dispelAnalysis';
import { useCombatReportContext } from '../CombatReportContext';

const PRIORITY_BADGE: Record<DispelPriority, string> = {
  Critical: 'badge-error',
  High: 'badge-warning',
  Medium: 'badge-info',
  Low: 'badge-ghost',
};

function PriorityBadge({ priority }: { priority: DispelPriority }) {
  return <span className={`badge badge-sm ${PRIORITY_BADGE[priority]}`}>{priority}</span>;
}

function DispelRow({ event }: { event: IDispelEvent }) {
  const isHostile = event.direction === 'hostile';
  return (
    <div className={`flex items-center gap-3 py-1.5 px-3 rounded ${isHostile ? 'bg-error/10' : 'bg-success/10'}`}>
      <span className="text-xs font-mono opacity-60 w-10 shrink-0">{fmtTime(event.timeSeconds)}</span>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isHostile ? 'bg-error' : 'bg-success'}`} />
      <span className="text-sm flex-1">
        <span className="font-semibold">{event.sourceName}</span>
        {isHostile ? ' stripped ' : ' removed '}
        <span className="font-semibold">{event.removedSpellName}</span>
        {' from '}
        <span className="font-semibold">{event.targetName}</span>
      </span>
      <PriorityBadge priority={event.priority} />
    </div>
  );
}

function MissedCleanseRow({ window: w }: { window: IMissedCleanseWindow }) {
  return (
    <div className="flex items-center gap-3 py-1.5 px-3 rounded bg-warning/10">
      <span className="text-xs font-mono opacity-60 w-10 shrink-0">{fmtTime(w.timeSeconds)}</span>
      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-warning" />
      <span className="text-sm flex-1">
        <span className="font-semibold">{w.targetName}</span>
        {' was in '}
        <span className="font-semibold">{w.spellName}</span>
        {` for ${Math.round(w.durationSeconds)}s — no cleanse`}
        <span className="ml-2 text-xs opacity-50">[{w.dispelType}]</span>
      </span>
      <PriorityBadge priority={w.priority} />
    </div>
  );
}

export function CombatDispels() {
  const { combat, friends, enemies } = useCombatReportContext();

  const summary = useMemo(() => {
    if (!combat) return null;
    return reconstructDispelSummary(friends, enemies, combat);
  }, [combat, friends, enemies]);

  if (!combat || !summary) return null;

  const { friendlyDispels, hostileDispels, missedCleanseWindows } = summary;
  const criticalMissed = missedCleanseWindows.filter((w) => w.priority === 'Critical');
  const totalEvents = friendlyDispels.length + hostileDispels.length;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Summary stats */}
      <div className="flex gap-4 flex-wrap">
        <div className="stat bg-base-200 rounded-box p-4 min-w-[130px]">
          <div className="stat-title text-xs">Your team dispels</div>
          <div className="stat-value text-2xl text-success">{friendlyDispels.length}</div>
        </div>
        <div className="stat bg-base-200 rounded-box p-4 min-w-[130px]">
          <div className="stat-title text-xs">Enemy purges</div>
          <div className="stat-value text-2xl text-error">{hostileDispels.length}</div>
        </div>
        <div className="stat bg-base-200 rounded-box p-4 min-w-[130px]">
          <div className="stat-title text-xs">Missed cleanses</div>
          <div className="stat-value text-2xl text-warning">{criticalMissed.length}</div>
          <div className="stat-desc">Critical CC &gt;3s uncleansed</div>
        </div>
      </div>

      {totalEvents === 0 && criticalMissed.length === 0 && (
        <div className="opacity-60 text-sm">No dispel events recorded in this match.</div>
      )}

      {/* Missed cleanses */}
      {criticalMissed.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="font-semibold text-warning">Missed Cleanse Opportunities</h4>
          <div className="flex flex-col gap-1">
            {criticalMissed.map((w, i) => (
              <MissedCleanseRow key={i} window={w} />
            ))}
          </div>
        </div>
      )}

      {/* Friendly dispels */}
      {friendlyDispels.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="font-semibold text-success">Your Team&apos;s Dispels</h4>
          <div className="flex flex-col gap-1">
            {friendlyDispels.map((e, i) => (
              <DispelRow key={i} event={e} />
            ))}
          </div>
        </div>
      )}

      {/* Hostile purges */}
      {hostileDispels.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="font-semibold text-error">Enemy Purges on Your Team</h4>
          <div className="flex flex-col gap-1">
            {hostileDispels.map((e, i) => (
              <DispelRow key={i} event={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

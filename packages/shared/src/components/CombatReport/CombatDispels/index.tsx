import { useMemo } from 'react';

import { fmtTime } from '../../../utils/cooldowns';
import {
  type DispelPriority,
  type ICCEfficiencyStat,
  type IDispelEvent,
  type IMissedCleanseWindow,
  type IMissedPurgeWindow,
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

function DispelRow({ event, verb }: { event: IDispelEvent; verb: string }) {
  return (
    <div className="flex items-start gap-3 py-1.5 px-3 rounded bg-base-200">
      <span className="text-xs font-mono opacity-60 w-10 shrink-0 pt-0.5">{fmtTime(event.timeSeconds)}</span>
      <span className="text-sm flex-1">
        <span className="font-semibold">{event.sourceName}</span>
        {` ${verb} `}
        <span className="font-semibold">{event.removedSpellName}</span>
        {' from '}
        <span className="font-semibold">{event.targetName}</span>
        {event.hasDispelPenalty && (
          <span className="ml-2 text-xs text-warning opacity-80" title={event.penaltyDescription}>
            ⚠ dispel penalty
          </span>
        )}
      </span>
      <PriorityBadge priority={event.priority} />
    </div>
  );
}

function MissedCleanseRow({ window: w }: { window: IMissedCleanseWindow }) {
  const dmgStr = w.postCcDamage > 0 ? `${Math.round(w.postCcDamage / 1000)}k dmg in 5s` : null;
  return (
    <div className="flex items-start gap-3 py-1.5 px-3 rounded bg-warning/10">
      <span className="text-xs font-mono opacity-60 w-10 shrink-0 pt-0.5">{fmtTime(w.timeSeconds)}</span>
      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-warning mt-1.5" />
      <span className="text-sm flex-1">
        <span className="font-semibold">{w.targetName}</span>
        {' was in '}
        <span className="font-semibold">{w.spellName}</span>
        {` for ${Math.round(w.durationSeconds)}s — no cleanse`}
        <span className="ml-2 text-xs opacity-50">[{w.dispelType}]</span>
        {dmgStr && <span className="ml-2 text-xs text-error font-semibold">{dmgStr}</span>}
      </span>
      <PriorityBadge priority={w.priority} />
    </div>
  );
}

function MissedPurgeRow({ window: w }: { window: IMissedPurgeWindow }) {
  return (
    <div className="flex items-start gap-3 py-1.5 px-3 rounded bg-error/10">
      <span className="text-xs font-mono opacity-60 w-10 shrink-0 pt-0.5">{fmtTime(w.timeSeconds)}</span>
      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-error mt-1.5" />
      <span className="text-sm flex-1">
        <span className="font-semibold">{w.enemyName}</span>
        {' had '}
        <span className="font-semibold">{w.spellName}</span>
        {` for ${Math.round(w.durationSeconds)}s — unpurged`}
      </span>
      <PriorityBadge priority={w.priority} />
    </div>
  );
}

function CCEfficiencyTable({ stats }: { stats: ICCEfficiencyStat[] }) {
  if (stats.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-semibold">CC Cleanse Efficiency</h4>
      <div className="overflow-x-auto">
        <table className="table table-sm w-full">
          <thead>
            <tr>
              <th>Player</th>
              <th className="text-center">CC Windows</th>
              <th className="text-center">Cleansed</th>
              <th className="text-center">Missed</th>
              <th className="text-center opacity-50">Broke</th>
              <th className="text-center">Rate</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((e, i) => {
              const pct = Math.round(e.cleanseRate * 100);
              const color = pct >= 80 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-error';
              const dispelableWindows = e.cleanseCount + e.missedCount;
              return (
                <tr key={i}>
                  <td>
                    <div className="font-semibold">{e.targetName}</div>
                    <div className="text-xs opacity-50">{e.targetSpec}</div>
                  </td>
                  <td className="text-center">{e.totalCCWindows}</td>
                  <td className="text-center text-success">{e.cleanseCount}</td>
                  <td className="text-center text-error">{e.missedCount}</td>
                  {e.brokenCount > 0 ? (
                    <td className="text-center opacity-50">{e.brokenCount}</td>
                  ) : (
                    <td className="text-center opacity-30">—</td>
                  )}
                  <td className={`text-center font-bold ${color}`}>{dispelableWindows > 0 ? `${pct}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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

  const { allyCleanse, ourPurges, hostilePurges, missedCleanseWindows, missedPurgeWindows, ccEfficiency } = summary;
  const significantMissed = missedCleanseWindows.filter(
    (w) => w.priority === 'Critical' || (w.priority === 'High' && (w.durationSeconds > 5 || w.postCcDamage > 50_000)),
  );
  const penaltyDispels = allyCleanse.filter((d) => d.hasDispelPenalty);
  const spellSteals = ourPurges.filter((d) => d.isSpellSteal);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Summary stats */}
      <div className="flex gap-4 flex-wrap">
        <div className="stat bg-base-200 rounded-box p-4 min-w-[130px]">
          <div className="stat-title text-xs">Cleanses</div>
          <div className="stat-value text-2xl text-success">{allyCleanse.length}</div>
          <div className="stat-desc">debuffs off allies</div>
        </div>
        <div className="stat bg-base-200 rounded-box p-4 min-w-[130px]">
          <div className="stat-title text-xs">Our Purges</div>
          <div className="stat-value text-2xl text-info">{ourPurges.length}</div>
          {spellSteals.length > 0 && <div className="stat-desc">{spellSteals.length} spell steals</div>}
        </div>
        <div className="stat bg-base-200 rounded-box p-4 min-w-[130px]">
          <div className="stat-title text-xs">Enemy Purges</div>
          <div className="stat-value text-2xl text-error">{hostilePurges.length}</div>
          <div className="stat-desc">our buffs stripped</div>
        </div>
        <div className="stat bg-base-200 rounded-box p-4 min-w-[130px]">
          <div className="stat-title text-xs">Missed Cleanses</div>
          <div className="stat-value text-2xl text-warning">{significantMissed.length}</div>
          <div className="stat-desc">Critical/High CC</div>
        </div>
        {missedPurgeWindows.length > 0 && (
          <div className="stat bg-base-200 rounded-box p-4 min-w-[130px]">
            <div className="stat-title text-xs">Missed Purges</div>
            <div className="stat-value text-2xl text-error">{missedPurgeWindows.length}</div>
            <div className="stat-desc">enemy buffs left up</div>
          </div>
        )}
        {penaltyDispels.length > 0 && (
          <div className="stat bg-base-200 rounded-box p-4 min-w-[130px]">
            <div className="stat-title text-xs">Penalty Dispels</div>
            <div className="stat-value text-2xl text-warning">{penaltyDispels.length}</div>
            <div className="stat-desc">dispeller took damage</div>
          </div>
        )}
      </div>

      {allyCleanse.length === 0 &&
        ourPurges.length === 0 &&
        hostilePurges.length === 0 &&
        significantMissed.length === 0 && (
          <div className="opacity-60 text-sm">No dispel events recorded in this match.</div>
        )}

      {/* CC efficiency table */}
      <CCEfficiencyTable stats={ccEfficiency} />

      {/* Missed cleanses */}
      {significantMissed.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="font-semibold text-warning">
            Missed Cleanse Opportunities
            <span className="ml-2 text-xs font-normal opacity-60">Critical CC &gt;3s, not broken by damage</span>
          </h4>
          <div className="flex flex-col gap-1">
            {significantMissed.map((w, i) => (
              <MissedCleanseRow key={i} window={w} />
            ))}
          </div>
        </div>
      )}

      {/* Friendly cleanses */}
      {allyCleanse.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="font-semibold text-success">Cleanses — Debuffs Removed from Allies</h4>
          <div className="flex flex-col gap-1">
            {allyCleanse.map((e, i) => (
              <DispelRow key={i} event={e} verb="cleansed" />
            ))}
          </div>
        </div>
      )}

      {/* Our purges */}
      {ourPurges.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="font-semibold text-info">Our Purges — Buffs Removed from Enemies</h4>
          <div className="flex flex-col gap-1">
            {ourPurges.map((e, i) => (
              <DispelRow key={i} event={e} verb={e.isSpellSteal ? 'spell-stole' : 'purged'} />
            ))}
          </div>
        </div>
      )}

      {/* Enemy purges on us */}
      {hostilePurges.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="font-semibold text-error">Enemy Purges — Our Buffs Stripped</h4>
          <div className="flex flex-col gap-1">
            {hostilePurges.map((e, i) => (
              <DispelRow key={i} event={e} verb="stripped" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { CombatResult, ICombatUnit } from '@wowarenalogs/parser';
import _ from 'lodash';
import moment from 'moment';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { FaShare } from 'react-icons/fa';
import { TbBolt, TbChevronLeft, TbCopy, TbHeart, TbShield, TbSkull, TbSwords } from 'react-icons/tb';

import { ccSpellIds, spells } from '../../data/spellTags';
import { zoneMetadata } from '../../data/zoneMetadata';
import { getDampeningPercentage } from '../../utils/dampening';
import { healerSpecs, Utils } from '../../utils/utils';
import { useCombatReportContext } from './CombatReportContext';
import { CombatUnitName } from './CombatUnitName';
import { SpellIcon } from './SpellIcon';

type MobileSection = 'summary' | 'deaths';
type CombatActionLike = {
  srcUnitId: string;
  srcUnitName: string;
  spellId: string | null;
  spellName: string | null;
  timestamp: number;
  effectiveAmount: number;
};
type AuraSummary = {
  key: string;
  spellId: string;
  spellName: string;
  srcUnitName: string;
  timestamp: number;
};
type CcWindowSummary = AuraSummary & {
  durationMs: number;
};

function MobileHeroPlayerCard({
  player,
  isTopDamage,
  isTopHealing,
  isTopInterrupts,
  deathCount = 0,
  tone = 'neutral',
}: {
  player: ICombatUnit;
  isTopDamage?: boolean;
  isTopHealing?: boolean;
  isTopInterrupts?: boolean;
  deathCount?: number;
  tone?: 'friendly' | 'enemy' | 'neutral';
}) {
  const { maxOutputNumber, playerTotalDamageOut, playerTotalHealOut } = useCombatReportContext();
  const damage = playerTotalDamageOut.get(player.id) || 0;
  const healing = playerTotalHealOut.get(player.id) || 0;
  const primaryValue = Math.max(damage, healing);
  const primaryType = damage >= healing ? 'damage' : 'healing';
  const primaryWidth =
    maxOutputNumber > 0 ? Math.min(100, Math.max(8, Math.round((primaryValue * 100) / maxOutputNumber))) : 0;
  const teamToneClass =
    tone === 'friendly'
      ? 'border-success/20 bg-success/5'
      : tone === 'enemy'
        ? 'border-error/20 bg-error/5'
        : 'border-base-content/10 bg-base-100/70';
  const barToneClass =
    primaryType === 'damage'
      ? tone === 'enemy'
        ? 'bg-error'
        : 'bg-error/90'
      : tone === 'friendly'
        ? 'bg-success'
        : 'bg-success/90';

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${teamToneClass}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <CombatUnitName unit={player} noEllipsis showSpec specSpacing="tight" />
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-65">
            <span>{Utils.getAverageItemLevel(player)} ilvl</span>
            {isTopDamage ? (
              <span className="inline-flex items-center justify-center gap-1 rounded-full border border-error/80 bg-error px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm">
                <TbBolt size={10} />
                DMG
              </span>
            ) : null}
            {isTopHealing ? (
              <span className="inline-flex items-center justify-center gap-1 rounded-full border border-success/80 bg-success px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm">
                <TbHeart size={10} />
                HEAL
              </span>
            ) : null}
            {isTopInterrupts ? (
              <span className="inline-flex items-center justify-center gap-1 rounded-full border border-info/80 bg-info px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm">
                <TbSwords size={10} />
                KICKS
              </span>
            ) : null}
            {deathCount > 0 ? (
              <span className="inline-flex items-center justify-center gap-1 rounded-full border border-error/80 bg-error px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm">
                <TbSkull size={10} />
                {deathCount === 1 ? 'Died' : `${deathCount} Deaths`}
              </span>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold">{Utils.printCombatNumber(primaryValue)}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
            {primaryType === 'damage' ? 'Damage' : 'Healing'}
          </div>
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-base-content/10">
        <div className={`h-1.5 rounded-full ${barToneClass}`} style={{ width: `${primaryWidth}%` }} />
      </div>
    </div>
  );
}

function MobilePanel({
  title,
  headerRight,
  children,
  className = '',
}: {
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-box border border-base-content/10 bg-base-300 ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-base-content/10 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide">{title}</div>
        {headerRight ? <div className="flex items-center">{headerRight}</div> : null}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function summarizeActions(actions: CombatActionLike[], limit: number) {
  return Object.values(
    actions.reduce(
      (acc, action) => {
        const key = `${action.srcUnitId}-${action.spellId || '0'}-${action.spellName || 'Auto Attack'}`;
        const current = acc[key] || {
          key,
          srcUnitId: action.srcUnitId,
          srcUnitName: action.srcUnitName,
          spellId: action.spellId || '0',
          spellName: action.spellName || 'Auto Attack',
          total: 0,
          hits: 0,
        };
        current.total += Math.abs(action.effectiveAmount);
        current.hits += 1;
        acc[key] = current;
        return acc;
      },
      {} as Record<
        string,
        {
          key: string;
          srcUnitId: string;
          srcUnitName: string;
          spellId: string;
          spellName: string;
          total: number;
          hits: number;
        }
      >,
    ),
  )
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

function getShortUnitName(name: string) {
  return name.split('-')[0];
}

function formatElapsedTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatShortDuration(milliseconds: number) {
  return `${Math.max(1, Math.round(milliseconds / 1000))}s`;
}

function formatTenthsDuration(milliseconds: number) {
  return `${(Math.max(0, milliseconds) / 1000).toFixed(1)}s`;
}

function summarizeAuraApplications(
  events: ICombatUnit['auraEvents'],
  startTime: number,
  endTime: number,
  predicate: (spellId: string) => boolean,
  limit: number,
): AuraSummary[] {
  return events
    .filter((event) => {
      const spellId = event.spellId || '';
      return (
        event.timestamp >= startTime &&
        event.timestamp <= endTime &&
        event.logLine.event === 'SPELL_AURA_APPLIED' &&
        !!spellId &&
        predicate(spellId)
      );
    })
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((event) => ({
      key: `${event.spellId || '0'}-${event.srcUnitId}-${event.timestamp}`,
      spellId: event.spellId || '0',
      spellName: event.spellName || 'Unknown Spell',
      srcUnitName: getShortUnitName(event.srcUnitName),
      timestamp: event.timestamp,
    }))
    .slice(0, limit);
}

function summarizeCcWindows(
  events: ICombatUnit['auraEvents'],
  startTime: number,
  endTime: number,
  limit: number,
): CcWindowSummary[] {
  const activeStarts = new Map<string, Array<{ timestamp: number; spellName: string; srcUnitName: string }>>();
  const windows: Array<{
    key: string;
    spellId: string;
    spellName: string;
    srcUnitName: string;
    startTime: number;
    endTime: number;
    durationMs: number;
  }> = [];

  events
    .filter((event) => event.timestamp <= endTime && ccSpellIds.has(event.spellId || ''))
    .forEach((event) => {
      const spellId = event.spellId || '0';
      const stackKey = `${spellId}-${event.srcUnitId}`;
      const existing = activeStarts.get(stackKey) || [];

      if (event.logLine.event === 'SPELL_AURA_APPLIED') {
        existing.push({
          timestamp: event.timestamp,
          spellName: event.spellName || 'Crowd Control',
          srcUnitName: getShortUnitName(event.srcUnitName),
        });
        activeStarts.set(stackKey, existing);
        return;
      }

      if (event.logLine.event === 'SPELL_AURA_REMOVED') {
        const activeEntry = existing.pop();
        if (activeEntry === undefined) {
          return;
        }

        if (existing.length === 0) {
          activeStarts.delete(stackKey);
        } else {
          activeStarts.set(stackKey, existing);
        }

        const clippedStart = Math.max(activeEntry.timestamp, startTime);
        const clippedEnd = Math.min(event.timestamp, endTime);
        if (clippedEnd > clippedStart) {
          windows.push({
            key: `${spellId}-${event.srcUnitId}-${activeEntry.timestamp}`,
            spellId,
            spellName: activeEntry.spellName,
            srcUnitName: activeEntry.srcUnitName,
            startTime: clippedStart,
            endTime: clippedEnd,
            durationMs: 0,
          });
        }
      }
    });

  activeStarts.forEach((starts, stackKey) => {
    starts.forEach((activeEntry, index) => {
      const [spellId] = stackKey.split('-');
      const clippedStart = Math.max(activeEntry.timestamp, startTime);
      if (endTime > clippedStart) {
        windows.push({
          key: `${stackKey}-${activeEntry.timestamp}-${index}`,
          spellId,
          spellName: activeEntry.spellName,
          srcUnitName: activeEntry.srcUnitName,
          startTime: clippedStart,
          endTime,
          durationMs: 0,
        });
      }
    });
  });

  const boundaries = Array.from(new Set(windows.flatMap((window) => [window.startTime, window.endTime]))).sort(
    (a, b) => a - b,
  );
  for (let i = 0; i < boundaries.length - 1; i++) {
    const sliceStart = boundaries[i];
    const sliceEnd = boundaries[i + 1];
    const overlapping = windows.filter((window) => window.startTime < sliceEnd && window.endTime > sliceStart);

    if (overlapping.length === 0) {
      continue;
    }

    const activeWindow = overlapping.sort((a, b) => b.startTime - a.startTime)[0];
    activeWindow.durationMs += sliceEnd - sliceStart;
  }

  return windows
    .filter((window) => window.durationMs > 0)
    .sort((a, b) => b.startTime - a.startTime)
    .map((window) => ({
      key: window.key,
      spellId: window.spellId,
      spellName: window.spellName,
      srcUnitName: window.srcUnitName,
      timestamp: window.startTime,
      durationMs: window.durationMs,
    }))
    .slice(0, limit);
}

function isDefensiveSpell(spellId: string) {
  const spell = spells[spellId];
  return spell?.type === 'buffs_defensive' || spell?.type === 'immunities';
}

function MobileDeathEntryCard({
  player,
  teamHealer,
  deathTime,
  combatStartTime,
  recapWindowMs,
  onlyShowCC,
}: {
  player: ICombatUnit;
  teamHealer?: ICombatUnit;
  deathTime: number;
  combatStartTime: number;
  recapWindowMs: number;
  onlyShowCC: boolean;
}) {
  const effectiveRecapWindowMs = Math.min(recapWindowMs, Math.max(1000, deathTime - combatStartTime));
  const startTime = deathTime - effectiveRecapWindowMs;
  const recentDamage = player.damageIn.filter(
    (action) => action.timestamp >= startTime && action.timestamp <= deathTime,
  );
  const recentHealing = player.healIn.filter(
    (action) => action.timestamp >= startTime && action.timestamp <= deathTime,
  );
  const recentInterrupts = player.actionIn.filter(
    (action) =>
      action.logLine.event === 'SPELL_INTERRUPT' && action.timestamp >= startTime && action.timestamp <= deathTime,
  );
  const recentCC = player.auraEvents.filter(
    (event) =>
      event.timestamp >= startTime &&
      event.timestamp <= deathTime &&
      event.logLine.event === 'SPELL_AURA_APPLIED' &&
      ccSpellIds.has(event.spellId || ''),
  );
  const topDamageSources = summarizeActions(recentDamage, 4);
  const topHealingSources = summarizeActions(recentHealing, 3);
  const totalDamage = _.sumBy(recentDamage, (action) => Math.abs(action.effectiveAmount));
  const totalHealing = _.sumBy(recentHealing, (action) => Math.abs(action.effectiveAmount));
  const burstWindowMs = Math.min(3000, Math.max(1000, deathTime - combatStartTime));
  const burstDamage = _.sumBy(
    recentDamage.filter((action) => action.timestamp >= deathTime - burstWindowMs),
    (action) => Math.abs(action.effectiveAmount),
  );
  const recentDefensives = summarizeAuraApplications(player.auraEvents, startTime, deathTime, isDefensiveSpell, 4);
  const allHealerRecentCC = teamHealer ? summarizeCcWindows(teamHealer.auraEvents, startTime, deathTime, 99) : [];
  const healerRecentCC = allHealerRecentCC.slice(0, 4);
  const totalHealerCcMs = _.sumBy(allHealerRecentCC, (event) => event.durationMs);
  const healerLabel = teamHealer
    ? teamHealer.id === player.id
      ? 'Healer CC (Self)'
      : `Healer CC (${getShortUnitName(teamHealer.name)})`
    : null;

  return (
    <div className="rounded-lg bg-base-200 px-3 py-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-60">
            Final {formatShortDuration(effectiveRecapWindowMs)} Death Recap
          </div>
          <CombatUnitName unit={player} noEllipsis />
          <div className="mt-1 text-xs opacity-70">Died at {formatElapsedTime(deathTime - combatStartTime)}</div>
        </div>
      </div>
      <div className="mb-2 rounded-lg bg-base-100 px-3 py-2">
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-60">
          <TbBolt size={13} className="text-error" />
          <span>Burst Damage</span>
        </div>
        <div className="mt-1 text-lg font-bold text-error">
          {Utils.printCombatNumber(burstDamage)} damage in {formatShortDuration(burstWindowMs)}
        </div>
      </div>
      {healerLabel ? (
        <div className="mb-2 rounded-lg bg-base-100 px-3 py-2">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-60">
            <TbShield size={13} className="text-info" />
            <span>Healer CC</span>
          </div>
          <div className="mt-1 text-lg font-bold text-info">
            Healer CC&apos;d {formatTenthsDuration(totalHealerCcMs)} of last{' '}
            {formatShortDuration(effectiveRecapWindowMs)}
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-base-100 px-3 py-2">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-60">
            <TbBolt size={13} className="text-error" />
            <span>Damage In</span>
          </div>
          <div className="mt-1 text-lg font-bold text-error">{Utils.printCombatNumber(totalDamage)}</div>
        </div>
        <div className="rounded-lg bg-base-100 px-3 py-2">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-60">
            <TbHeart size={13} className="text-success" />
            <span>Healing In</span>
          </div>
          <div className="mt-1 text-lg font-bold text-success">{Utils.printCombatNumber(totalHealing)}</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-base-100 px-3 py-2">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-60">
            <TbSwords size={13} />
            <span>Kicks Taken</span>
          </div>
          <div className="mt-1 text-base font-semibold">{recentInterrupts.length}</div>
        </div>
        <div className="rounded-lg bg-base-100 px-3 py-2">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide opacity-60">
            <TbShield size={13} />
            <span>CC Applied</span>
          </div>
          <div className="mt-1 text-base font-semibold">{recentCC.length}</div>
        </div>
      </div>
      {onlyShowCC ? (
        <div className="mt-3 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-60">Control Effects</div>
          {recentCC.length > 0 ? (
            recentCC.slice(0, 5).map((event, index) => (
              <div key={`${event.spellId}-${event.timestamp}-${index}`} className="rounded-lg bg-base-100 px-3 py-2">
                <div className="flex items-center gap-2">
                  <SpellIcon spellId={event.spellId || '0'} size={20} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{event.spellName || 'Crowd Control'}</div>
                    <div className="text-xs opacity-70">
                      {getShortUnitName(event.srcUnitName)} • -{((deathTime - event.timestamp) / 1000).toFixed(1)}s
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-lg bg-base-100 px-3 py-2 text-sm opacity-70">
              No CC effects applied in the final 15 seconds.
            </div>
          )}
          {healerLabel ? (
            <div className="pt-1">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide opacity-60">{healerLabel}</div>
              <div className="space-y-2">
                {healerRecentCC.length > 0 ? (
                  healerRecentCC.map((event) => (
                    <div key={event.key} className="rounded-lg bg-base-100 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <SpellIcon spellId={event.spellId} size={20} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{event.spellName}</div>
                          <div className="text-xs opacity-70">
                            {event.srcUnitName} • {Math.max(0.1, event.durationMs / 1000).toFixed(1)}s
                          </div>
                        </div>
                        <div className="text-xs font-semibold opacity-70">
                          -{((deathTime - event.timestamp) / 1000).toFixed(1)}s
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg bg-base-100 px-3 py-2 text-sm opacity-70">
                    No healer CC was applied in the final 15 seconds.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide opacity-60">Defensives Used</div>
            <div className="space-y-2">
              {recentDefensives.length > 0 ? (
                recentDefensives.map((event) => (
                  <div key={event.key} className="rounded-lg bg-base-100 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <SpellIcon spellId={event.spellId} size={22} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{event.spellName}</div>
                        <div className="truncate text-xs opacity-70">
                          {event.srcUnitName} • -{((deathTime - event.timestamp) / 1000).toFixed(1)}s
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg bg-base-100 px-3 py-2 text-sm opacity-70">
                  No major defensives were used in the final 15 seconds.
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide opacity-60">Top Damage Sources</div>
            <div className="space-y-2">
              {topDamageSources.length > 0 ? (
                topDamageSources.map((source) => (
                  <div key={source.key} className="rounded-lg bg-base-100 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <SpellIcon spellId={source.spellId} size={22} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{source.spellName}</div>
                        <div className="truncate text-xs opacity-70">{getShortUnitName(source.srcUnitName)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-error">{Utils.printCombatNumber(source.total)}</div>
                        <div className="text-[11px] opacity-60">{source.hits} hits</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg bg-base-100 px-3 py-2 text-sm opacity-70">
                  No incoming damage recorded in the final 15 seconds.
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide opacity-60">
              Top Healing Received
            </div>
            <div className="space-y-2">
              {topHealingSources.length > 0 ? (
                topHealingSources.map((source) => (
                  <div key={source.key} className="rounded-lg bg-base-100 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <SpellIcon spellId={source.spellId} size={22} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{source.spellName}</div>
                        <div className="truncate text-xs opacity-70">{getShortUnitName(source.srcUnitName)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-success">
                          {Utils.printCombatNumber(source.total)}
                        </div>
                        <div className="text-[11px] opacity-60">{source.hits} hits</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg bg-base-100 px-3 py-2 text-sm opacity-70">
                  No meaningful healing was received in the final 15 seconds.
                </div>
              )}
            </div>
          </div>
          {healerLabel ? (
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide opacity-60">{healerLabel}</div>
              <div className="space-y-2">
                {healerRecentCC.length > 0 ? (
                  healerRecentCC.map((event) => (
                    <div key={event.key} className="rounded-lg bg-base-100 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <SpellIcon spellId={event.spellId} size={22} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{event.spellName}</div>
                          <div className="truncate text-xs opacity-70">
                            {event.srcUnitName} • {Math.max(0.1, event.durationMs / 1000).toFixed(1)}s
                          </div>
                        </div>
                        <div className="text-xs font-semibold opacity-70">
                          -{((deathTime - event.timestamp) / 1000).toFixed(1)}s
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg bg-base-100 px-3 py-2 text-sm opacity-70">
                    No healer CC was applied in the final 15 seconds.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MobileStatsTable() {
  const { combat, viewerIsOwner, players, enemies, friends } = useCombatReportContext();

  if (!combat) {
    return null;
  }

  const enemyAvgItemLevel = enemies.length
    ? _.sumBy(enemies, (unit) => Utils.getAverageItemLevel(unit)) / enemies.length
    : 0;
  const friendsAvgItemLevel = friends.length
    ? _.sumBy(friends, (unit) => Utils.getAverageItemLevel(unit)) / friends.length
    : 0;
  const itemLevelDelta = friendsAvgItemLevel - enemyAvgItemLevel;
  const dampening = getDampeningPercentage(combat.startInfo.bracket, players, combat.endTime);

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="opacity-70">Start Time</span>
        <span className="font-semibold">{moment(combat.startTime).format('MMM D, h:mm A')}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="opacity-70">Duration</span>
        <span className="font-semibold">{moment.utc(combat.endTime - combat.startTime).format('mm:ss')}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="opacity-70">Dampening</span>
        <span className="font-semibold">{dampening.toFixed()}%</span>
      </div>
      {combat.playerTeamRating ? (
        <div className="flex items-center justify-between gap-3">
          <span className="opacity-70">Team MMR</span>
          <span className="font-semibold">{combat.playerTeamRating.toFixed()}</span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="opacity-70">{viewerIsOwner ? 'Item Level Advantage' : 'Item Level Difference'}</span>
          <span
            className={`font-semibold ${viewerIsOwner ? (itemLevelDelta >= 0 ? 'text-success' : 'text-error') : ''}`}
          >
            {viewerIsOwner ? itemLevelDelta.toFixed(1) : Math.abs(itemLevelDelta).toFixed(1)}
          </span>
        </div>
      )}
    </div>
  );
}

function MobileMeterSection({
  title,
  playersByValue,
  maxValue,
  getValue,
  colorClass,
  suffix,
}: {
  title: string;
  playersByValue: ICombatUnit[];
  maxValue: number;
  getValue: (player: ICombatUnit) => number;
  colorClass: string;
  suffix: string;
}) {
  const { combat } = useCombatReportContext();

  if (!combat) {
    return null;
  }

  const effectiveDuration = Math.max((combat.endTime - combat.startTime) / 1000, 1);

  return (
    <MobilePanel title={title}>
      <div className="space-y-3">
        {playersByValue.map((player) => {
          const value = getValue(player);
          const width = maxValue > 0 ? Math.max(6, Math.round((value * 100) / maxValue)) : 0;
          return (
            <div key={player.id}>
              <div className="mb-1 flex items-center gap-2">
                <CombatUnitName unit={player} noEllipsis />
                <div className="text-xs font-semibold opacity-80">{Utils.printCombatNumber(value)}</div>
                <div className="text-[11px] opacity-60">
                  {Utils.printCombatNumber(value / effectiveDuration)}
                  {suffix}
                </div>
              </div>
              <div className="h-2 rounded-full bg-base-content/10">
                <div className={`h-2 rounded-full ${colorClass}`} style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </MobilePanel>
  );
}

function MobileSummarySection() {
  const {
    combat,
    viewerIsOwner,
    players,
    enemies,
    friends,
    playerInterruptsDone,
    playerTotalDamageOut,
    playerTotalHealOut,
  } = useCombatReportContext();

  if (!combat) {
    return null;
  }

  const isShuffle = combat.dataType === 'ShuffleRound';
  const playersSortedByDamage = players
    .slice()
    .sort((a, b) => (playerTotalDamageOut.get(b.id) || 0) - (playerTotalDamageOut.get(a.id) || 0));
  const playersSortedByHealing = players
    .slice()
    .sort((a, b) => (playerTotalHealOut.get(b.id) || 0) - (playerTotalHealOut.get(a.id) || 0));
  const maxDamage = Math.max(...playersSortedByDamage.map((player) => playerTotalDamageOut.get(player.id) || 0), 0);
  const maxHealing = Math.max(...playersSortedByHealing.map((player) => playerTotalHealOut.get(player.id) || 0), 0);
  const topDamage = playersSortedByDamage[0];
  const topHealing = playersSortedByHealing[0];
  const topInterrupts = players
    .slice()
    .sort((a, b) => (playerInterruptsDone.get(b.id) || 0) - (playerInterruptsDone.get(a.id) || 0))[0];
  const deathCounts = new Map(players.map((player) => [player.id, player.deathRecords.length]));
  const friendlyWon = combat.result === CombatResult.Win;
  const enemyWon = combat.result === CombatResult.Lose;

  return (
    <div className="space-y-3">
      <div className="rounded-box border border-base-content/10 bg-gradient-to-br from-base-300 to-base-200 p-3 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold opacity-80">
          <TbSwords />
          <span>Matchup Overview</span>
          <span className="text-xs opacity-55">•</span>
          <span>{moment.utc(combat.endTime - combat.startTime).format('mm:ss')}</span>
          {combat.playerTeamRating ? (
            <>
              <span className="text-xs opacity-55">•</span>
              <span>{combat.playerTeamRating.toFixed()} MMR</span>
            </>
          ) : null}
        </div>
        <div className="space-y-2">
          <div
            className={`rounded-xl border p-2.5 shadow-sm ${
              enemyWon
                ? 'border-warning/60 bg-warning/10 shadow-[0_0_0_1px_rgba(234,179,8,0.18)]'
                : 'border-base-content/10 bg-base-100/50 opacity-80'
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-60">
              <span>Enemy Team</span>
              <div className="flex items-center gap-2">
                {enemyWon ? (
                  <span className="rounded-full border border-warning/50 bg-warning/15 px-2 py-0.5 text-warning opacity-100">
                    Winner
                  </span>
                ) : null}
                <span>{enemies.length} players</span>
              </div>
            </div>
            <div className="space-y-1.5">
              {enemies.map((player) => (
                <MobileHeroPlayerCard
                  key={player.id}
                  player={player}
                  isTopDamage={topDamage?.id === player.id}
                  isTopHealing={topHealing?.id === player.id}
                  isTopInterrupts={
                    !!topInterrupts &&
                    (playerInterruptsDone.get(topInterrupts.id) || 0) > 0 &&
                    topInterrupts.id === player.id
                  }
                  deathCount={deathCounts.get(player.id) || 0}
                  tone="enemy"
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 px-1">
            <div className="h-px flex-1 bg-base-content/10" />
            <div className="rounded-full border border-base-content/10 bg-base-100/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-65">
              {friendlyWon ? 'Friendly Win' : enemyWon ? 'Enemy Win' : 'VS'}
            </div>
            <div className="h-px flex-1 bg-base-content/10" />
          </div>
          <div
            className={`rounded-xl border p-2.5 shadow-sm ${
              friendlyWon
                ? 'border-success/60 bg-success/10 shadow-[0_0_0_1px_rgba(34,197,94,0.18)]'
                : 'border-base-content/10 bg-base-100/50 opacity-80'
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-60">
              <span>{viewerIsOwner ? 'Your Team' : 'Friendly Team'}</span>
              <div className="flex items-center gap-2">
                {friendlyWon ? (
                  <span className="rounded-full border border-success/50 bg-success/15 px-2 py-0.5 text-success opacity-100">
                    Winner
                  </span>
                ) : null}
                <span>{friends.length} players</span>
              </div>
            </div>
            <div className="space-y-1.5">
              {friends.map((player) => (
                <MobileHeroPlayerCard
                  key={player.id}
                  player={player}
                  isTopDamage={topDamage?.id === player.id}
                  isTopHealing={topHealing?.id === player.id}
                  isTopInterrupts={
                    !!topInterrupts &&
                    (playerInterruptsDone.get(topInterrupts.id) || 0) > 0 &&
                    topInterrupts.id === player.id
                  }
                  deathCount={deathCounts.get(player.id) || 0}
                  tone="friendly"
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <MobilePanel title="Stats">
          <MobileStatsTable />
        </MobilePanel>
      </div>

      <MobileMeterSection
        title="Damage"
        playersByValue={playersSortedByDamage}
        maxValue={maxDamage}
        getValue={(player) => playerTotalDamageOut.get(player.id) || 0}
        colorClass="bg-error"
        suffix="/s"
      />

      <MobileMeterSection
        title="Healing"
        playersByValue={playersSortedByHealing}
        maxValue={maxHealing}
        getValue={(player) => playerTotalHealOut.get(player.id) || 0}
        colorClass="bg-success"
        suffix="/s"
      />

      {isShuffle && (
        <MobilePanel title="Shuffle Scoreboard">
          <div className="space-y-2">
            {combat.scoreboard
              .slice()
              .sort((a, b) => b.wins - a.wins)
              .map((entry) => {
                const unit = combat.units[entry.unitId];
                return (
                  <div key={unit.id} className="rounded-lg bg-base-200 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <CombatUnitName unit={unit} noEllipsis />
                      <div className="text-sm font-semibold">{entry.wins}</div>
                    </div>
                    <progress
                      className={`progress mt-2 w-full ${entry.wins >= 3 ? 'progress-success' : 'progress-warning'}`}
                      value={entry.wins}
                      max={6}
                    />
                  </div>
                );
              })}
          </div>
        </MobilePanel>
      )}
    </div>
  );
}

function MobileDeathLogSection() {
  const { combat, players } = useCombatReportContext();
  const onlyShowCC = false;
  const [recapWindowMs, setRecapWindowMs] = useState(10000);

  if (!combat) {
    return null;
  }

  const deaths = players
    .flatMap((player) =>
      player.deathRecords.map((deathRecord) => ({
        player,
        deathRecord,
      })),
    )
    .sort((a, b) => a.deathRecord.timestamp - b.deathRecord.timestamp);

  return (
    <div className="space-y-3">
      <MobilePanel
        title="Deaths"
        headerRight={
          <div className="join">
            {[5000, 10000, 15000].map((windowMs) => (
              <button
                key={windowMs}
                type="button"
                className={`join-item btn btn-xs min-h-0 h-6 px-2 normal-case ${
                  recapWindowMs === windowMs ? 'btn-primary' : 'btn-ghost'
                }`}
                onClick={() => setRecapWindowMs(windowMs)}
              >
                {formatShortDuration(windowMs)}
              </button>
            ))}
          </div>
        }
      >
        <div className="space-y-2">
          {deaths.map((entry) => (
            <MobileDeathEntryCard
              key={`${entry.player.id}-${entry.deathRecord.timestamp}`}
              player={entry.player}
              teamHealer={players.find(
                (candidate) =>
                  candidate.info?.teamId === entry.player.info?.teamId && healerSpecs.includes(candidate.spec),
              )}
              deathTime={entry.deathRecord.timestamp}
              combatStartTime={combat.startTime}
              recapWindowMs={recapWindowMs}
              onlyShowCC={onlyShowCC}
            />
          ))}
          {deaths.length === 0 && (
            <div className="rounded-lg bg-base-200 px-3 py-3 text-sm opacity-75">
              No player deaths recorded in this match.
            </div>
          )}
        </div>
      </MobilePanel>
    </div>
  );
}

export const CombatReportMobile = ({ matchId, roundId }: { matchId: string; roundId?: string }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { combat } = useCombatReportContext();
  const [activeSection, setActiveSection] = useState<MobileSection>('summary');
  const [urlCopied, setUrlCopied] = useState(false);

  const reportUrl = useMemo(() => {
    return `https://wowarenalogs.com/match?id=${matchId}&roundId=${roundId}`;
  }, [matchId, roundId]);

  if (!combat) {
    return null;
  }

  const sequence = combat.dataType === 'ShuffleRound' ? combat.sequenceNumber + 1 : null;

  return (
    <div className="flex h-full w-full flex-col p-2 animate-fadein">
      <div className="flex items-start gap-2 px-1">
        {searchParams.get('source') ? (
          <button className="btn btn-ghost btn-sm px-2" onClick={() => router.back()}>
            <TbChevronLeft className="text-xl" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-tight">
            {sequence ? `Round ${sequence} of ` : ''}
            {combat.startInfo.bracket}
          </h2>
          <div className="text-sm opacity-70">{zoneMetadata[combat.startInfo.zoneId ?? '0'].name}</div>
        </div>
        <label htmlFor="toggle-share-mobile" className="btn btn-ghost btn-sm">
          <FaShare />
        </label>
      </div>
      <div className="mt-3 overflow-x-auto px-1">
        <div className="tabs tabs-boxed inline-flex min-w-full md:hidden">
          <a
            className={`tab ${activeSection === 'summary' ? 'tab-active' : ''}`}
            onClick={() => {
              setActiveSection('summary');
            }}
          >
            Summary
          </a>
          <a
            className={`tab ${activeSection === 'deaths' ? 'tab-active' : ''}`}
            onClick={() => {
              setActiveSection('deaths');
            }}
          >
            Death Log
          </a>
        </div>
      </div>
      <div className="mt-3 flex-1 overflow-y-auto px-1 pb-3">
        {activeSection === 'summary' && <MobileSummarySection />}
        {activeSection === 'deaths' && <MobileDeathLogSection />}
      </div>
      <input type="checkbox" id="toggle-share-mobile" className="modal-toggle" />
      <label htmlFor="toggle-share-mobile" className="modal">
        <label className="modal-box relative" htmlFor="">
          <div className="flex flex-row">
            <input
              type="text"
              className="input input-bordered mr-2 flex-1"
              readOnly
              value={reportUrl}
              onFocus={(e) => {
                e.target.select();
              }}
            />
            <button
              className={`btn ${urlCopied ? 'btn-success' : 'btn-primary'}`}
              onClick={() => {
                navigator.clipboard.writeText(reportUrl).then(() => {
                  setUrlCopied(true);
                  setTimeout(() => {
                    setUrlCopied(false);
                  }, 3000);
                });
              }}
            >
              <TbCopy className="mr-2 text-lg" />
              {urlCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </label>
      </label>
    </div>
  );
};

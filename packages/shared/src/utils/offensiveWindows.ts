import { AtomicArenaCombat, ICombatUnit, LogEvent, SpellTag } from '@wowarenalogs/parser';

import { spellEffectData } from '../data/spellEffectData';
import spellIdListsData from '../data/spellIdLists.json';
import spellsData from '../data/spells.json';
import { extractMajorCooldowns, fmtTime, specToString } from './cooldowns';

const EXTERNAL_BIG_DEF_IDS = new Set<string>(spellIdListsData.externalOrBigDefensiveSpellIds as string[]);

type SpellEntry = { type: string };
const SPELLS = spellsData as Record<string, SpellEntry>;

/** Minimum vulnerability window duration to surface (seconds) */
const MIN_VULN_SECONDS = 5;
/** Fallback buff duration when spellEffectData has no durationSeconds */
const DEFAULT_BUFF_DURATION_S = 8;
/** damageRatio at or above which we consider the team to have capitalised */
const CAPITALIZE_RATIO = 1.2;

// ── Event-driven state machine types ─────────────────────────────────────────

type EventKind = 'CD_READY' | 'CD_USED' | 'BUFF_EXPIRED';

interface IStateEvent {
  time: number;
  kind: EventKind;
  spellId: string;
  spellName: string;
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface IFriendlyOffensiveState {
  playerName: string;
  playerSpec: string;
  spellName: string;
  /** true when the CD was available but no cast occurred inside the vulnerability window */
  wasIdled: boolean;
  /** seconds the player was under any CC during this vulnerability window */
  ccDurationInWindow: number;
}

export interface IOffensiveWindow {
  targetUnitId: string;
  targetName: string;
  targetSpec: string;
  fromSeconds: number;
  toSeconds: number;
  durationSeconds: number;
  /** Total friendly damage dealt to this enemy during the window */
  friendlyDamageInWindow: number;
  /** friendlyDamageInWindow / expected damage for same duration at match average rate */
  damageRatio: number;
  /** True when damageRatio >= CAPITALIZE_RATIO */
  capitalized: boolean;
  /** Per-player offensive CD state during this window */
  friendlyOffensives: IFriendlyOffensiveState[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns how many seconds a unit was under any CC aura during [windowFrom, windowTo].
 * Uses the same aura-tracking pattern as enemyCDs.ts (SPELL_AURA_APPLIED / REMOVED pairs).
 */
function ccSecondsInWindow(unit: ICombatUnit, matchStartMs: number, windowFrom: number, windowTo: number): number {
  const windowStartMs = matchStartMs + windowFrom * 1000;
  const windowEndMs = matchStartMs + windowTo * 1000;

  // Track per-spellId CC start times (handles overlapping auras correctly)
  const ccStartBySpell = new Map<string, number>();
  let totalMs = 0;

  for (const a of unit.auraEvents) {
    if (!a.spellId) continue;
    const entry = SPELLS[a.spellId];
    if (entry?.type !== 'cc') continue;

    if (a.logLine.event === LogEvent.SPELL_AURA_APPLIED || a.logLine.event === LogEvent.SPELL_AURA_REFRESH) {
      ccStartBySpell.set(a.spellId, a.logLine.timestamp);
    } else if (
      a.logLine.event === LogEvent.SPELL_AURA_REMOVED ||
      a.logLine.event === LogEvent.SPELL_AURA_BROKEN ||
      a.logLine.event === LogEvent.SPELL_AURA_BROKEN_SPELL
    ) {
      const ccStart = ccStartBySpell.get(a.spellId) ?? 0;
      const ccEnd = a.logLine.timestamp;
      ccStartBySpell.delete(a.spellId);

      // Clamp to window and accumulate overlap
      if (ccStart > 0 && ccStart < windowEndMs && ccEnd > windowStartMs) {
        const overlapStart = Math.max(ccStart, windowStartMs);
        const overlapEnd = Math.min(ccEnd, windowEndMs);
        totalMs += Math.max(0, overlapEnd - overlapStart);
      }
    }
  }

  // Any CC aura still open at the end of the window
  for (const [, ccStart] of ccStartBySpell) {
    if (ccStart < windowEndMs) {
      const overlapStart = Math.max(ccStart, windowStartMs);
      totalMs += Math.max(0, windowEndMs - overlapStart);
    }
  }

  return totalMs / 1000;
}

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Finds windows where an enemy had NO major defensive buff active and NO major
 * defensive CD available — i.e. their defensives were both spent and expired.
 *
 * Uses an event-driven state machine with three event kinds:
 *   CD_READY   — CD becomes available (start of match, or after cooldown elapses)
 *   CD_USED    — cast detected; buff begins, CD goes on cooldown
 *   BUFF_EXPIRED — buff duration ends; enemy is now defenseless
 *
 * Vulnerability = Available == 0 AND Active == 0.
 */
export function computeOffensiveWindows(
  enemies: ICombatUnit[],
  friendlies: ICombatUnit[],
  combat: AtomicArenaCombat,
): IOffensiveWindow[] {
  const matchStartMs = combat.startTime;
  const matchDurationSeconds = (combat.endTime - matchStartMs) / 1000;
  const windows: IOffensiveWindow[] = [];

  // Pre-compute match-wide friendly damage rate for ratio baseline
  // (sum of all damage out from all friendlies to all enemies)
  const totalFriendlyDamageOut = friendlies
    .flatMap((f) => f.damageOut)
    .reduce((sum, d) => {
      // damageOut includes absorbs; only count raw damage events (effectiveAmount > 0)
      return 'effectiveAmount' in d ? sum + Math.max(0, d.effectiveAmount) : sum;
    }, 0);
  const avgDmgPerSec = matchDurationSeconds > 0 ? totalFriendlyDamageOut / matchDurationSeconds : 0;

  // Pre-compute friendly offensive CDs once (used for all enemy vulnerability windows)
  const friendlyOffensiveCDs = friendlies.map((f) => ({
    unit: f,
    cds: extractMajorCooldowns(f, combat).filter((c) => c.tag === SpellTag.Offensive),
  }));

  for (const enemy of enemies) {
    // ── 1. Build event list for this enemy's major defensives ─────────────────

    const events: IStateEvent[] = [];

    // Scan spellCastEvents directly — do not use extractMajorCooldowns on enemies
    for (const cast of enemy.spellCastEvents) {
      if (cast.logLine.event !== LogEvent.SPELL_CAST_SUCCESS) continue;
      const { spellId } = cast;
      if (!spellId || !EXTERNAL_BIG_DEF_IDS.has(spellId)) continue;

      const effectData = spellEffectData[spellId];
      if (!effectData) continue;
      const cooldownSeconds = effectData.cooldownSeconds ?? effectData.charges?.chargeCooldownSeconds ?? 0;
      if (cooldownSeconds < 30) continue;

      const castTimeSeconds = (cast.logLine.timestamp - matchStartMs) / 1000;
      const buffDuration =
        effectData.durationSeconds && effectData.durationSeconds > 0
          ? effectData.durationSeconds
          : DEFAULT_BUFF_DURATION_S;
      const buffExpiry = castTimeSeconds + buffDuration;
      const cdReady = castTimeSeconds + cooldownSeconds;

      events.push({ time: castTimeSeconds, kind: 'CD_USED', spellId, spellName: effectData.name });
      events.push({ time: buffExpiry, kind: 'BUFF_EXPIRED', spellId, spellName: effectData.name });
      // CD_READY only matters within the match
      if (cdReady < matchDurationSeconds) {
        events.push({ time: cdReady, kind: 'CD_READY', spellId, spellName: effectData.name });
      }
    }

    // Count distinct tracked defensive spells this enemy actually used
    const trackedSpellIds = new Set(events.map((e) => e.spellId));
    const numTracked = trackedSpellIds.size;

    if (numTracked === 0) {
      // No major defensives detected — no meaningful vulnerability windows to surface
      continue;
    }

    // Each tracked spell starts match in CD_READY state (available at t=0)
    const initialAvailable = numTracked; // all start ready
    events.push({ time: 0, kind: 'CD_READY', spellId: '__init__', spellName: '' }); // sentinel handled below
    events.sort((a, b) => a.time - b.time || (a.kind === 'BUFF_EXPIRED' ? -1 : 1));

    // ── 2. Walk events; find windows where available==0 AND active==0 ─────────

    let available = initialAvailable; // CDs ready to be pressed
    let active = 0; // Buffs currently mitigating
    let vulnStart: number | null = null;
    const vulnWindows: Array<{ from: number; to: number }> = [];

    const isVulnerable = () => available === 0 && active === 0;

    const closeWindow = (endTime: number) => {
      if (vulnStart !== null && endTime - vulnStart >= MIN_VULN_SECONDS) {
        vulnWindows.push({ from: vulnStart, to: endTime });
      }
      vulnStart = null;
    };

    for (const ev of events) {
      if (ev.kind === 'CD_READY' && ev.spellId === '__init__') continue; // skip sentinel

      const wasVuln = isVulnerable();

      switch (ev.kind) {
        case 'CD_USED':
          available = Math.max(0, available - 1);
          active++;
          break;
        case 'BUFF_EXPIRED':
          active = Math.max(0, active - 1);
          break;
        case 'CD_READY':
          available++;
          break;
      }

      const nowVuln = isVulnerable();

      if (!wasVuln && nowVuln) {
        vulnStart = ev.time;
      } else if (wasVuln && !nowVuln) {
        closeWindow(ev.time);
      }
    }

    // Close any open window at match end
    if (isVulnerable() && vulnStart !== null) {
      closeWindow(matchDurationSeconds);
    }

    if (vulnWindows.length === 0) continue;

    // ── 3. Per-window metrics ──────────────────────────────────────────────────

    for (const vw of vulnWindows) {
      const windowDuration = vw.to - vw.from;

      // Friendly damage dealt to this specific enemy during the window
      const windowDmg = enemy.damageIn
        .filter((d) => {
          if (!friendlies.some((f) => f.id === d.srcUnitId)) return false;
          const t = (d.logLine.timestamp - matchStartMs) / 1000;
          return t >= vw.from && t <= vw.to;
        })
        .reduce((sum, d) => sum + Math.abs(d.effectiveAmount), 0);

      const expectedDmg = avgDmgPerSec * windowDuration;
      const damageRatio = expectedDmg > 0 ? windowDmg / expectedDmg : windowDmg > 0 ? 2.0 : 0.0;

      // ── 4. Friendly offensive CD state w/ CC context ─────────────────────────

      const friendlyOffensives: IFriendlyOffensiveState[] = [];

      for (const { unit: f, cds } of friendlyOffensiveCDs) {
        for (const cd of cds) {
          // Was this CD available at any point during the vulnerability window?
          const availableOverlap = cd.availableWindows.find(
            (aw) => Math.min(aw.toSeconds, vw.to) - Math.max(aw.fromSeconds, vw.from) > 0,
          );
          if (!availableOverlap) continue;

          // Was it cast during the window?
          const wasCast = cd.casts.some((c) => c.timeSeconds >= vw.from && c.timeSeconds <= vw.to);

          // How much of the window was the player CC'd?
          const ccSeconds = ccSecondsInWindow(f, matchStartMs, vw.from, vw.to);

          friendlyOffensives.push({
            playerName: f.name,
            playerSpec: specToString(f.spec),
            spellName: cd.spellName,
            wasIdled: !wasCast,
            ccDurationInWindow: Math.round(ccSeconds * 10) / 10,
          });
        }
      }

      windows.push({
        targetUnitId: enemy.id,
        targetName: enemy.name,
        targetSpec: specToString(enemy.spec),
        fromSeconds: vw.from,
        toSeconds: vw.to,
        durationSeconds: windowDuration,
        friendlyDamageInWindow: windowDmg,
        damageRatio,
        capitalized: damageRatio >= CAPITALIZE_RATIO,
        friendlyOffensives,
      });
    }
  }

  return windows.sort((a, b) => a.fromSeconds - b.fromSeconds);
}

// ── Formatter ─────────────────────────────────────────────────────────────────

export function formatOffensiveWindowsForContext(windows: IOffensiveWindow[]): string[] {
  const lines: string[] = [];
  lines.push('ENEMY VULNERABILITY WINDOWS (defensive buff expired AND no CD available):');

  if (windows.length === 0) {
    lines.push('  No significant vulnerability windows detected.');
    return lines;
  }

  for (const w of windows) {
    const dmgM = (w.friendlyDamageInWindow / 1_000_000).toFixed(2);
    const ratioStr = `${w.damageRatio.toFixed(1)}× match avg`;
    const capitalizeStr = w.capitalized ? 'CAPITALISED' : 'NOT CAPITALISED';

    lines.push('');
    lines.push(
      `  ${w.targetSpec} (${w.targetName}) — vulnerable ${fmtTime(w.fromSeconds)}–${fmtTime(w.toSeconds)} (${Math.round(w.durationSeconds)}s) [${capitalizeStr}]`,
    );
    lines.push(`    Damage dealt: ${dmgM}M (${ratioStr})`);

    if (w.friendlyOffensives.length === 0) {
      lines.push('    Friendly offensive CDs: none tracked as available during this window.');
    } else {
      for (const fo of w.friendlyOffensives) {
        if (!fo.wasIdled) {
          lines.push(`    ${fo.playerSpec} used ${fo.spellName} during this window.`);
        } else {
          const ccNote =
            fo.ccDurationInWindow > 0
              ? ` Note: ${fo.playerSpec} was CC'd for ${fo.ccDurationInWindow}s of this window.`
              : '';
          lines.push(`    ${fo.playerSpec} had ${fo.spellName} ready but did not use it.${ccNote}`);
        }
      }
    }
  }

  return lines;
}

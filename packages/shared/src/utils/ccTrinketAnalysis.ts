import { ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { ccSpellIds } from '../data/spellTags';
import { fmtTime, isHealerSpec, specToString } from './cooldowns';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Gladiator's Medallion — active PvP trinket that breaks CC */
const GLADIATOR_TRINKET_SPELL_ID = '336126';
/** Adaptation — passive auto-break trinket (proc spell) */
const ADAPTATION_TRINKET_SPELL_ID = '195756';

/** Item IDs for Relentless (passive DR, no active) */
const RELENTLESS_ITEM_IDS = new Set(['181335', '184053', '186870', '185305', '186967', '185310', '184059', '184056']);
/** Item IDs for Adaptation (auto-break on 5s CC, no manual cast) */
const ADAPTATION_ITEM_IDS = new Set([
  '181816',
  '184054',
  '186871',
  '185306',
  '185311',
  '186968',
  '201453',
  '201811',
  '205782',
  '205712',
  '209767',
  '209347',
  '216372',
  '216283',
]);

const HEALER_TRINKET_CD_S = 90;
const DPS_TRINKET_CD_S = 120;

/**
 * Window in ms within which a trinket cast is considered a direct response
 * to a CC application (applied then trinket used within this window).
 */
const TRINKET_RESPONSE_WINDOW_MS = 5000;

/**
 * Minimum damage taken during a CC window for it to be considered a meaningful
 * missed trinket opportunity.
 */
const SIGNIFICANT_CC_DAMAGE = 30_000;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export type TrinketType = 'Gladiator' | 'Adaptation' | 'Relentless' | 'Unknown';

export interface ICCInstance {
  atSeconds: number;
  durationSeconds: number;
  spellId: string;
  spellName: string;
  sourceName: string;
  sourceSpec: string;
  damageTakenDuring: number;
  trinketState: 'used' | 'available_unused' | 'on_cooldown' | 'passive_trinket';
}

export interface IPlayerCCTrinketSummary {
  playerName: string;
  playerSpec: string;
  trinketType: TrinketType;
  trinketCooldownSeconds: number;
  ccInstances: ICCInstance[];
  trinketUseTimes: number[]; // atSeconds for each trinket cast
  /** CC windows where trinket was available but player didn't use it, with significant damage */
  missedTrinketWindows: ICCInstance[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectTrinketType(unit: ICombatUnit): TrinketType {
  const trinketSlots = (unit.info?.equipment ?? []).filter((_, i) => [12, 13].includes(i));
  if (trinketSlots.some((e) => RELENTLESS_ITEM_IDS.has(e.id))) return 'Relentless';
  if (trinketSlots.some((e) => ADAPTATION_ITEM_IDS.has(e.id))) return 'Adaptation';
  if (trinketSlots.length > 0) return 'Gladiator';
  return 'Unknown';
}

/**
 * Returns all timestamps (ms) at which the unit successfully cast their active trinket.
 */
function getTrinketCastTimestamps(unit: ICombatUnit, trinketType: TrinketType): number[] {
  if (trinketType === 'Relentless') return []; // passive, never cast
  const spellId = trinketType === 'Adaptation' ? ADAPTATION_TRINKET_SPELL_ID : GLADIATOR_TRINKET_SPELL_ID;
  return unit.spellCastEvents
    .filter((e) => e.logLine.event === LogEvent.SPELL_CAST_SUCCESS && e.spellId === spellId)
    .map((e) => e.logLine.timestamp);
}

/**
 * Given a sorted list of trinket cast timestamps, returns whether the trinket
 * was off cooldown at `atMs`.
 */
function isTrinketAvailable(castTimestamps: number[], cooldownMs: number, atMs: number): boolean {
  // Find the last cast before atMs
  let lastCast = -Infinity;
  for (const ts of castTimestamps) {
    if (ts <= atMs) lastCast = ts;
    else break;
  }
  if (lastCast === -Infinity) return true; // never used → available
  return atMs - lastCast >= cooldownMs;
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

export function analyzePlayerCCAndTrinket(
  player: ICombatUnit,
  enemies: ICombatUnit[],
  combat: { startTime: number; endTime: number },
): IPlayerCCTrinketSummary {
  const enemyIds = new Set(enemies.map((u) => u.id));
  const matchStartMs = combat.startTime;

  const trinketType = detectTrinketType(player);
  const isHealer = isHealerSpec(player.spec);
  const trinketCooldownSeconds = isHealer ? HEALER_TRINKET_CD_S : DPS_TRINKET_CD_S;
  const trinketCooldownMs = trinketCooldownSeconds * 1000;

  const trinketCastTimestamps = getTrinketCastTimestamps(player, trinketType).sort((a, b) => a - b);

  // Build a map of CC apply → remove timestamps for this player from enemies
  // spellId → list of { applyMs, removeMs }
  const ccWindows: Array<{
    spellId: string;
    spellName: string;
    srcName: string;
    srcUnitId: string;
    applyMs: number;
    removeMs: number;
  }> = [];

  const pendingCC = new Map<string, { applyMs: number; spellName: string; srcName: string; srcUnitId: string }>();

  for (const aura of player.auraEvents) {
    const spellId = aura.spellId;
    if (!spellId) continue;
    if (!enemyIds.has(aura.srcUnitId)) continue;
    if (!ccSpellIds.has(spellId)) continue;

    // FIX 2: key by spellId+caster so re-applications from the same caster don't
    // overwrite the pending entry before the first removal fires.
    const ccKey = `${spellId}:${aura.srcUnitId}`;
    const event = aura.logLine.event;
    if (event === LogEvent.SPELL_AURA_APPLIED) {
      pendingCC.set(ccKey, {
        applyMs: aura.timestamp,
        spellName: aura.spellName ?? spellId,
        srcName: aura.srcUnitName,
        srcUnitId: aura.srcUnitId,
      });
    } else if (
      event === LogEvent.SPELL_AURA_REMOVED ||
      event === LogEvent.SPELL_AURA_BROKEN ||
      event === LogEvent.SPELL_AURA_BROKEN_SPELL
    ) {
      const pending = pendingCC.get(ccKey);
      if (pending) {
        ccWindows.push({
          spellId,
          spellName: pending.spellName,
          srcName: pending.srcName,
          srcUnitId: pending.srcUnitId,
          applyMs: pending.applyMs,
          removeMs: aura.timestamp,
        });
        pendingCC.delete(ccKey);
      }
    }
  }

  // Close any CCs still pending at match end
  Array.from(pendingCC.entries()).forEach(([ccKey, pending]) => {
    const [pendingSpellId] = ccKey.split(':');
    ccWindows.push({
      spellId: pendingSpellId,
      spellName: pending.spellName,
      srcName: pending.srcName,
      srcUnitId: pending.srcUnitId,
      applyMs: pending.applyMs,
      removeMs: combat.endTime,
    });
  });

  // Resolve source spec from enemies list
  const enemySpecMap = new Map(enemies.map((u) => [u.id, specToString(u.spec)]));

  // Build ICCInstance list
  const ccInstances: ICCInstance[] = ccWindows.map((w) => {
    // Damage taken by this player from enemies during the CC window
    const damageTakenDuring = player.damageIn
      .filter((d) => enemyIds.has(d.srcUnitId) && d.logLine.timestamp >= w.applyMs && d.logLine.timestamp <= w.removeMs)
      .reduce((sum, d) => sum + Math.abs(d.effectiveAmount), 0);

    // Was trinket used within the response window after CC application?
    const trinketUsedInWindow = trinketCastTimestamps.some(
      (ts) => ts >= w.applyMs && ts <= w.applyMs + TRINKET_RESPONSE_WINDOW_MS,
    );

    let trinketState: ICCInstance['trinketState'];
    if (trinketType === 'Relentless') {
      trinketState = 'passive_trinket';
    } else if (trinketUsedInWindow) {
      trinketState = 'used';
    } else if (isTrinketAvailable(trinketCastTimestamps, trinketCooldownMs, w.applyMs)) {
      trinketState = 'available_unused';
    } else {
      trinketState = 'on_cooldown';
    }

    return {
      atSeconds: (w.applyMs - matchStartMs) / 1000,
      durationSeconds: (w.removeMs - w.applyMs) / 1000,
      spellId: w.spellId,
      spellName: w.spellName,
      sourceName: w.srcName,
      sourceSpec: enemySpecMap.get(w.srcUnitId) ?? 'Unknown',
      damageTakenDuring,
      trinketState,
    };
  });

  ccInstances.sort((a, b) => a.atSeconds - b.atSeconds);

  const missedTrinketWindows = ccInstances.filter(
    (c) => c.trinketState === 'available_unused' && c.damageTakenDuring >= SIGNIFICANT_CC_DAMAGE,
  );

  return {
    playerName: player.name,
    playerSpec: specToString(player.spec),
    trinketType,
    trinketCooldownSeconds,
    ccInstances,
    trinketUseTimes: trinketCastTimestamps.map((ts) => (ts - matchStartMs) / 1000),
    missedTrinketWindows,
  };
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

export function formatCCTrinketForContext(summaries: IPlayerCCTrinketSummary[]): string[] {
  const lines: string[] = [];
  lines.push('CROWD CONTROL RECEIVED & TRINKET USAGE (on your team):');

  const hasCCData = summaries.some((s) => s.ccInstances.length > 0);
  if (!hasCCData) {
    lines.push('  No hard CC events detected on your team.');
    return lines;
  }

  for (const s of summaries) {
    const cdStr =
      s.trinketType === 'Relentless' || s.trinketType === 'Unknown'
        ? s.trinketType
        : `${s.trinketType}, ${s.trinketCooldownSeconds}s CD`;
    lines.push('');
    lines.push(`  ${s.playerSpec} (${s.playerName}) — Trinket: ${cdStr}`);

    if (s.ccInstances.length === 0) {
      lines.push('    No hard CC received.');
      continue;
    }

    for (const cc of s.ccInstances) {
      const dur = cc.durationSeconds.toFixed(1);
      const dmgK = Math.round(cc.damageTakenDuring / 1000);
      const dmgStr = dmgK > 0 ? `, ${dmgK}k dmg during CC` : '';

      let trinketStr: string;
      switch (cc.trinketState) {
        case 'used':
          trinketStr = '✓ trinket used';
          break;
        case 'available_unused':
          trinketStr =
            dmgK >= Math.round(SIGNIFICANT_CC_DAMAGE / 1000)
              ? '⚠ trinket AVAILABLE — not used'
              : 'trinket available, not used';
          break;
        case 'on_cooldown':
          trinketStr = 'trinket on cooldown';
          break;
        case 'passive_trinket':
          trinketStr = 'passive trinket (Relentless)';
          break;
      }

      lines.push(
        `    ${fmtTime(cc.atSeconds)}: ${cc.spellName} by ${cc.sourceSpec} (${cc.sourceName}) — ${dur}s${dmgStr} — ${trinketStr}`,
      );
    }

    // Summarise trinket uses that were NOT near any CC window (regardless of trinketState),
    // to avoid double-reporting a cast as both a missed window and an off-CC use.
    const trinketResponseWindowS = TRINKET_RESPONSE_WINDOW_MS / 1000;
    const offCCUses = s.trinketUseTimes.filter(
      (t) => !s.ccInstances.some((cc) => Math.abs(cc.atSeconds - t) <= trinketResponseWindowS),
    );
    if (offCCUses.length > 0) {
      lines.push(`    Trinket used outside CC: ${offCCUses.map(fmtTime).join(', ')}`);
    }

    if (s.missedTrinketWindows.length > 0) {
      const missed = s.missedTrinketWindows.map(
        (w) => `${fmtTime(w.atSeconds)} (${Math.round(w.damageTakenDuring / 1000)}k dmg)`,
      );
      lines.push(`    ⚠ Missed trinket window(s): ${missed.join(', ')}`);
    }
  }

  return lines;
}

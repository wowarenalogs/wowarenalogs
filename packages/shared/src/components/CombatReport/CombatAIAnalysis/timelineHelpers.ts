import {
  CombatUnitReaction,
  CombatUnitType,
  getUnitReaction,
  getUnitType,
  ICombatUnit,
  LogEvent,
} from '@wowarenalogs/parser';

import { spellEffectData } from '../../../data/spellEffectData';
import { IMajorCooldownInfo } from '../../../utils/cooldowns';

// ── Shared helpers ─────────────────────────────────────────────────────────

/** Returns the last cast at or before `timeSeconds`, or undefined if none. */
export function lastCastBefore(cd: IMajorCooldownInfo, timeSeconds: number) {
  return cd.casts.filter((c) => c.timeSeconds <= timeSeconds).slice(-1)[0];
}

// ── Critical moment identification helpers ─────────────────────────────────

/**
 * Healer spell IDs that should appear as [OWNER CAST] gap-fillers when they are NOT
 * already tracked by ownerCDs (to avoid double-counting).  Keep in sync with
 * classMetadata.ts as new specs / abilities ship.
 *
 * Sources: Wowhead / WoW API — verified against Patch 11.x spell IDs.
 */
export const HEALER_CAST_SPELL_ID_TO_NAME: Record<string, string> = {
  // ── Priest ─────────────────────────────────────────────────────────────────
  '10060': 'Power Infusion', // Holy/Disc — external DPS CD
  '33206': 'Pain Suppression', // Disc — defensive external
  '265202': 'Holy Word: Salvation', // Holy — raid/party heal CD
  '200183': 'Apotheosis', // Holy — healing amplifier
  '47788': 'Guardian Spirit', // Holy — prevent-death external
  // ── Shaman ─────────────────────────────────────────────────────────────────
  '108280': 'Healing Tide Totem', // Resto — party heal CD
  '98008': 'Spirit Link Totem', // Resto — damage redistribution
  '114052': 'Ascendance', // Resto — healing burst CD
  // ── Druid ──────────────────────────────────────────────────────────────────
  '29166': 'Innervate', // Resto — mana external / self
  '740': 'Tranquility', // Resto — AoE heal channel
  // ── Monk ───────────────────────────────────────────────────────────────────
  '116849': 'Life Cocoon', // Mistweaver — absorb external
  '115310': 'Revival', // Mistweaver — group dispel + heal
  // ── Paladin ────────────────────────────────────────────────────────────────
  '31884': 'Avenging Wrath', // Holy — healing/damage amp
  '216331': 'Avenging Crusader', // Holy alt-talent
  '114165': 'Holy Prism', // not a CD but a high-value cast tracked in some builds
  '6940': 'Blessing of Sacrifice', // Holy — damage redirect external
  '316011': 'Symbol of Hope', // Holy — mana restoration for team
  // ── Evoker ─────────────────────────────────────────────────────────────────
  '363534': 'Rewind', // Preservation — rewind time
  '370537': 'Stasis', // Preservation — store heals
};

/**
 * Passive proc spells that emit SPELL_CAST_SUCCESS but are not intentional player casts.
 * Filtering these removes noise from the [OWNER CAST] timeline.
 */
export const PASSIVE_SPELL_BLOCKLIST = new Set([
  'Reclamation',
  'Infusion of Light',
  "Ysera's Gift",
  "Nature's Vigor",
  'Resounding Voice',
  'Eminence',
  'Awakening',
  'Divine Purpose',
]);

// ── Enemy major buff tracking (F67) ──────────────────────────────────────────

// Only spells that generate SPELL_AURA_APPLIED events on enemy players in WoW combat logs.
// Mass-buff effects (Bloodlust, Heroism, Time Warp) do NOT generate individual aura events for
// enemy team members — they are already visible via [ENEMY CD] / Enemy active in the prompt.
const ENEMY_MAJOR_BUFF_SPELL_IDS: Record<string, { name: string; purgeable: boolean }> = {
  '10060': { name: 'Power Infusion', purgeable: true },
};

export interface IEnemyBuffInterval {
  spellId: string;
  spellName: string;
  startSeconds: number;
  endSeconds: number;
  purgeable: boolean;
}

/**
 * Scans each enemy unit's auraEvents and returns intervals during which a major
 * tracked buff (PI, Bloodlust, etc.) was active.  Unclosed buffs at match end are
 * clamped to matchEndMs so a buff active at the final snapshot is still visible.
 */
export function extractEnemyMajorBuffIntervals(
  enemies: ICombatUnit[],
  matchStartMs: number,
  matchEndMs: number,
): Map<string, IEnemyBuffInterval[]> {
  const result = new Map<string, IEnemyBuffInterval[]>();

  for (const enemy of enemies) {
    const intervals: IEnemyBuffInterval[] = [];
    // key: "${spellId}:${srcUnitId}" → startMs
    const openBuffs = new Map<string, number>();

    // Pre-match scan: seed buffs applied before match start that were not removed before start
    const preNetActive = new Map<string, boolean>();
    for (const event of enemy.auraEvents) {
      const ts: number = event.logLine.timestamp;
      if (ts >= matchStartMs) break; // auraEvents are chronological; stop at match start
      const spellId = event.spellId ?? '';
      if (!ENEMY_MAJOR_BUFF_SPELL_IDS[spellId]) continue;
      const stateKey = `${spellId}:${event.srcUnitId}`;
      if (event.logLine.event === LogEvent.SPELL_AURA_APPLIED) {
        preNetActive.set(stateKey, true);
      } else if (event.logLine.event === LogEvent.SPELL_AURA_REMOVED) {
        preNetActive.set(stateKey, false);
      }
    }
    for (const [stateKey, active] of preNetActive) {
      if (active) openBuffs.set(stateKey, matchStartMs);
    }

    // Main pass: process events during the match
    for (const event of enemy.auraEvents) {
      const spellId = event.spellId ?? '';
      const buffDef = ENEMY_MAJOR_BUFF_SPELL_IDS[spellId];
      if (!buffDef) continue;

      const stateKey = `${spellId}:${event.srcUnitId}`;
      const ts: number = event.logLine.timestamp;
      if (ts < matchStartMs) continue;

      if (event.logLine.event === LogEvent.SPELL_AURA_APPLIED) {
        if (!openBuffs.has(stateKey)) {
          openBuffs.set(stateKey, ts);
        }
      } else if (event.logLine.event === LogEvent.SPELL_AURA_REMOVED) {
        const startMs = openBuffs.get(stateKey);
        if (startMs !== undefined) {
          intervals.push({
            spellId,
            spellName: buffDef.name,
            startSeconds: (startMs - matchStartMs) / 1000,
            endSeconds: (ts - matchStartMs) / 1000,
            purgeable: buffDef.purgeable,
          });
          openBuffs.delete(stateKey);
        }
      }
    }

    // Clamp any unclosed buffs to match end
    for (const [stateKey, startMs] of openBuffs) {
      const spellId = stateKey.split(':')[0];
      const buffDef = ENEMY_MAJOR_BUFF_SPELL_IDS[spellId];
      if (buffDef) {
        intervals.push({
          spellId,
          spellName: buffDef.name,
          startSeconds: (startMs - matchStartMs) / 1000,
          endSeconds: (matchEndMs - matchStartMs) / 1000,
          purgeable: buffDef.purgeable,
        });
      }
    }

    if (intervals.length > 0) {
      result.set(enemy.name, intervals);
    }
  }

  return result;
}

// ── Owner CD buff expiry tracking (F70) ────────────────────────────────────────

export interface ICDExpiryEvent {
  spellId: string;
  spellName: string;
  castAtSeconds: number;
  expiresAtSeconds: number;
  /** true when no SPELL_AURA_REMOVED was found — expiry estimated from cast + known duration */
  isEstimated: boolean;
}

/**
 * For each owner CD cast, finds when the buff actually expired by matching to the
 * chronologically-next SPELL_AURA_REMOVED event (cast by `ownerId`) across all
 * friendly units.  Falls back to `cast.timeSeconds + spellEffectData[spellId].durationSeconds`
 * when no aura event is present.  Skips CDs with no durationSeconds in spellEffectData.
 */
export function extractOwnerCDBuffExpiry(
  ownerCDs: IMajorCooldownInfo[],
  ownerId: string,
  friends: ICombatUnit[],
  matchStartMs: number,
): ICDExpiryEvent[] {
  const result: ICDExpiryEvent[] = [];

  for (const cd of ownerCDs) {
    // CC spells apply their aura to the enemy, not a friendly — SPELL_AURA_REMOVED never
    // appears in friends' events. DR also makes the estimated duration wrong. Skip entirely.
    if (cd.tag === 'Control') continue;
    const duration = spellEffectData[cd.spellId]?.durationSeconds;
    if (!duration || duration <= 0) continue;

    // Collect all SPELL_AURA_REMOVED timestamps for this spell cast by the owner,
    // across all friendly units, sorted ascending.
    const removalTimestampsMs: number[] = [];
    for (const friend of friends) {
      for (const event of friend.auraEvents) {
        if (
          event.spellId === cd.spellId &&
          event.srcUnitId === ownerId &&
          (event.logLine.event as LogEvent) === LogEvent.SPELL_AURA_REMOVED
        ) {
          removalTimestampsMs.push(event.logLine.timestamp as number);
        }
      }
    }
    removalTimestampsMs.sort((a, b) => a - b);

    // Match each cast (ascending) to the chronologically-next removal after the cast.
    let removalIndex = 0;
    for (const cast of cd.casts) {
      const castMs = matchStartMs + cast.timeSeconds * 1000;

      // Skip removals that happened before this cast started (orphans / prior applications).
      while (removalIndex < removalTimestampsMs.length && removalTimestampsMs[removalIndex] < castMs) {
        removalIndex++;
      }

      let expiresAtSeconds: number;
      let isEstimated: boolean;

      if (removalIndex < removalTimestampsMs.length) {
        expiresAtSeconds = (removalTimestampsMs[removalIndex] - matchStartMs) / 1000;
        isEstimated = false;
        removalIndex++;
      } else {
        expiresAtSeconds = cast.timeSeconds + duration;
        isEstimated = true;
      }

      result.push({
        spellId: cd.spellId,
        spellName: cd.spellName,
        castAtSeconds: cast.timeSeconds,
        expiresAtSeconds,
        isEstimated,
      });
    }
  }

  return result;
}

// ── Module-level constants shared across builders ──────────────────────────

/** Minimum total damage for a pressure window to be treated as a [DMG SPIKE] event. */
export const DMG_SPIKE_THRESHOLD = 300_000;

/**
 * Spell IDs for healing-amplifier CDs where we measure throughput during the buff window
 * and append a [HEALING] line (per-5s HPS + overheal %). Restricted to pure healing amps.
 */
export const HEALING_AMPLIFIER_SPELL_IDS = new Set([
  '10060', // Power Infusion (15s)
  '29166', // Innervate (8s)
  '114052', // Ascendance (15s)
]);

/**
 * Computes healing throughput during a CD's active window.
 * Returns per-5s HPS buckets and overall overheal % from healOut events.
 * Returns null if no healing events fall within [fromMs, toMs].
 *
 * Bucket upper bounds are exclusive except for the last bucket (inclusive at toMs)
 * so every event in the window is counted exactly once.
 */
export function computeHealingInWindow(
  healOut: ICombatUnit['healOut'],
  fromMs: number,
  toMs: number,
): { buckets: Array<{ fromSeconds: number; toSeconds: number; hps: number }>; overhealPct: number } | null {
  const events = healOut.filter((h) => h.logLine.timestamp >= fromMs && h.logLine.timestamp <= toMs);
  if (events.length === 0) return null;

  let totalAmount = 0;
  let totalEffective = 0;
  for (const h of events) {
    totalAmount += h.amount;
    totalEffective += h.effectiveAmount;
  }

  const windowSeconds = (toMs - fromMs) / 1000;
  const BUCKET_SIZE = 5;
  const buckets: Array<{ fromSeconds: number; toSeconds: number; hps: number }> = [];

  for (let bucketStart = 0; bucketStart < windowSeconds; bucketStart += BUCKET_SIZE) {
    const bucketEnd = Math.min(bucketStart + BUCKET_SIZE, windowSeconds);
    const isLastBucket = bucketEnd >= windowSeconds;
    const bucketFromMs = fromMs + bucketStart * 1000;
    const bucketToMs = fromMs + bucketEnd * 1000;
    const bucketDuration = bucketEnd - bucketStart;

    const bucketEffective = events
      .filter(
        (h) =>
          h.logLine.timestamp >= bucketFromMs &&
          (isLastBucket ? h.logLine.timestamp <= bucketToMs : h.logLine.timestamp < bucketToMs),
      )
      .reduce((sum, h) => sum + h.effectiveAmount, 0);

    buckets.push({ fromSeconds: bucketStart, toSeconds: bucketEnd, hps: bucketEffective / bucketDuration });
  }

  const overhealPct = totalAmount > 0 ? Math.round(((totalAmount - totalEffective) / totalAmount) * 100) : 0;
  return { buckets, overhealPct };
}

/**
 * Extracts the top-N damage sources that hit `unit` within the `windowMs` window
 * ending at `deathMs`. Returns an array of formatted "source — spell (Xk)" strings.
 */
export function getTopDamageSourcesInWindow(unit: ICombatUnit, endMs: number, windowMs: number, topN = 3): string[] {
  const startMs = endMs - windowMs;
  const buckets = new Map<string, number>();
  for (const d of unit.damageIn) {
    if (d.logLine.timestamp < startMs || d.logLine.timestamp > endMs) continue;
    const dmg = Math.abs(d.effectiveAmount);
    if (dmg <= 0) continue;
    // B20: exclude friendly sources (e.g. Time Dilation from Preservation Evoker buff)
    if (getUnitReaction(d.srcUnitFlags) !== CombatUnitReaction.Hostile) continue;
    // B24: pet/guardian units may have localized (non-ASCII) names from non-en-US clients;
    // replace with "[pet]" to keep attribution readable without localization noise.
    const srcType = getUnitType(d.srcUnitFlags);
    const isPet = srcType === CombatUnitType.Pet || srcType === CombatUnitType.Guardian;
    const srcName = isPet ? '[pet]' : d.srcUnitName || 'Unknown';
    const key = `${srcName} — ${d.spellName ?? 'melee'}`;
    buckets.set(key, (buckets.get(key) ?? 0) + dmg);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([k, v]) => `${k} (${Math.round(v / 1000)}k)`);
}

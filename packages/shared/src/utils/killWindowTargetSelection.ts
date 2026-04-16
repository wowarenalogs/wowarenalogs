import { AtomicArenaCombat, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { spellEffectData } from '../data/spellEffectData';
import spellIdListsData from '../data/spellIdLists.json';
import { fmtTime, specToString } from './cooldowns';
import { IOffensiveWindow } from './offensiveWindows';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAJOR_DEF_IDS = new Set<string>(
  (spellIdListsData as unknown as { externalOrBigDefensiveSpellIds?: string[] }).externalOrBigDefensiveSpellIds ?? [],
);

/** PvP trinket spell IDs that break CC / grant freedom. */
const PVP_TRINKET_SPELL_IDS = new Set<string>([
  '336126', // Gladiator's Medallion (active break-CC)
  '195710', // Primal Gladiator's Badge (older active trinket)
  '208683', // Might of the Alliance / Horde (active)
]);

/** Healer trinket CD (seconds). */
const HEALER_TRINKET_CD_S = 90;
/** DPS trinket CD (seconds). */
const DPS_TRINKET_CD_S = 120;

/** Minimum window duration to bother comparing (mirrors MIN_VULN_SECONDS in offensiveWindows). */
const MIN_WINDOW_SECONDS = 5;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface IEnemySnapshot {
  unitId: string;
  playerName: string;
  playerSpec: string;
  /** HP% at window start, 0–100. null when advanced logging is absent. */
  hpPercent: number | null;
  /** Major defensive CDs that are available (not on cooldown, not active). */
  defensivesAvailable: string[];
  /** Major defensive CDs that are on cooldown or whose buff is currently active. */
  defensivesUnavailable: string[];
  /** true = trinket off cooldown, false = on cooldown, null = no trinket detected. */
  trinketAvailable: boolean | null;
  /**
   * Softness score (higher = easier kill target):
   *   50 * (1 − hpFraction) + 50 * defensivesFraction
   * where defensivesFraction = unavailable / total tracked.
   */
  softnessScore: number;
}

export interface IKillWindowTargetEval {
  windowFromSeconds: number;
  windowToSeconds: number;
  /** The enemy whose defensives triggered this window. */
  focusedTarget: IEnemySnapshot;
  /** All other enemies at this window start. */
  otherTargets: IEnemySnapshot[];
  /** true when another enemy had a higher softness score (was an objectively better target). */
  betterTargetExists: boolean;
  /** Name of the better target, if any. */
  betterTargetName?: string;
  betterTargetSpec?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the unit's HP% (0–100) at `atSeconds`, using the nearest advancedAction
 * entry at or before that time. Returns null when advanced logging is unavailable.
 */
export function getHpPercentAtTime(enemy: ICombatUnit, atSeconds: number, matchStartMs: number): number | null {
  const actions = enemy.advancedActions;
  if (actions.length === 0) return null;

  const targetMs = matchStartMs + atSeconds * 1000;

  // Find the latest action at or before the target time
  let best = null;
  for (const a of actions) {
    if (a.logLine.timestamp <= targetMs) {
      best = a;
    } else {
      break; // actions are chronological
    }
  }

  if (!best) return null;
  if (best.advancedActorMaxHp <= 0) return null;

  return Math.min(100, Math.max(0, (best.advancedActorCurrentHp / best.advancedActorMaxHp) * 100));
}

/**
 * Reconstructs whether each major defensive is available, on cooldown, or has
 * active buff at `windowStartSeconds`, by replaying the enemy's cast history.
 */
function getDefensiveStateAtTime(
  enemy: ICombatUnit,
  windowStartSeconds: number,
  matchStartMs: number,
): { available: string[]; unavailable: string[] } {
  const available: string[] = [];
  const unavailable: string[] = [];

  // Collect all major defensive casts by this enemy before the window
  type DefCast = { spellId: string; spellName: string; castSeconds: number };
  const castsBySpell = new Map<string, DefCast[]>();

  for (const cast of enemy.spellCastEvents) {
    if (cast.logLine.event !== LogEvent.SPELL_CAST_SUCCESS) continue;
    const { spellId } = cast;
    if (!spellId || !MAJOR_DEF_IDS.has(spellId)) continue;

    const castSeconds = (cast.logLine.timestamp - matchStartMs) / 1000;
    if (castSeconds >= windowStartSeconds) continue; // after our snapshot time

    const effectData = spellEffectData[spellId];
    if (!effectData) continue;
    const cdSeconds = effectData.cooldownSeconds ?? effectData.charges?.chargeCooldownSeconds ?? 0;
    if (cdSeconds < 30) continue;

    const spellName = effectData.name;
    const existing = castsBySpell.get(spellId) ?? [];
    existing.push({ spellId, spellName, castSeconds });
    castsBySpell.set(spellId, existing);
  }

  // For each tracked defensive, determine state at window start
  for (const [spellId, casts] of castsBySpell) {
    const effectData = spellEffectData[spellId];
    if (!effectData) continue;

    const cdSeconds = effectData.cooldownSeconds ?? effectData.charges?.chargeCooldownSeconds ?? 0;
    const maxCharges = effectData.charges?.charges ?? 1;
    const buffSeconds = effectData.durationSeconds && effectData.durationSeconds > 0 ? effectData.durationSeconds : 8;

    // Simulate charge regeneration sequentially
    casts.sort((a, b) => a.castSeconds - b.castSeconds);
    let currentCharges = maxCharges;
    let nextRegenTime = 0;

    for (const cast of casts) {
      while (nextRegenTime > 0 && nextRegenTime <= cast.castSeconds && currentCharges < maxCharges) {
        currentCharges++;
        nextRegenTime = currentCharges < maxCharges ? nextRegenTime + cdSeconds : 0;
      }
      currentCharges = Math.max(0, currentCharges - 1);
      if (currentCharges < maxCharges && nextRegenTime === 0) {
        nextRegenTime = cast.castSeconds + cdSeconds;
      }
    }

    // Process regens up to window start
    while (nextRegenTime > 0 && nextRegenTime <= windowStartSeconds && currentCharges < maxCharges) {
      currentCharges++;
      nextRegenTime = currentCharges < maxCharges ? nextRegenTime + cdSeconds : 0;
    }

    const buffActive = casts[casts.length - 1].castSeconds + buffSeconds > windowStartSeconds;
    const cdOnCooldown = currentCharges === 0;

    if (buffActive || cdOnCooldown) {
      unavailable.push(effectData.name);
    } else {
      available.push(effectData.name);
    }
  }

  return { available, unavailable };
}

/**
 * Returns whether this enemy's PvP trinket is available at `windowStartSeconds`.
 * null when no trinket use was ever detected (can't determine type).
 */
function getTrinketStateAtTime(
  enemy: ICombatUnit,
  windowStartSeconds: number,
  matchStartMs: number,
  isHealer: boolean,
): boolean | null {
  const trinketCD = isHealer ? HEALER_TRINKET_CD_S : DPS_TRINKET_CD_S;
  let lastUseSeconds: number | null = null;

  for (const cast of enemy.spellCastEvents) {
    if (cast.logLine.event !== LogEvent.SPELL_CAST_SUCCESS) continue;
    if (!cast.spellId || !PVP_TRINKET_SPELL_IDS.has(cast.spellId)) continue;

    const castSeconds = (cast.logLine.timestamp - matchStartMs) / 1000;
    if (castSeconds >= windowStartSeconds) break;

    lastUseSeconds = castSeconds;
  }

  if (lastUseSeconds === null) return null; // no trinket use detected
  return lastUseSeconds + trinketCD <= windowStartSeconds;
}

/**
 * Builds a full snapshot for one enemy at the given window start.
 */
function snapshotEnemy(enemy: ICombatUnit, windowStartSeconds: number, matchStartMs: number): IEnemySnapshot {
  const hpPercent = getHpPercentAtTime(enemy, windowStartSeconds, matchStartMs);
  const { available, unavailable } = getDefensiveStateAtTime(enemy, windowStartSeconds, matchStartMs);
  const isHealerUnit = false; // spec-based healer check would require cooldowns import — use fixed DPS CD for enemies
  const trinketAvailable = getTrinketStateAtTime(enemy, windowStartSeconds, matchStartMs, isHealerUnit);

  const trinketScore = trinketAvailable === false ? 1 : trinketAvailable === true ? 0 : 0.5;
  const totalTracked = available.length + unavailable.length + 1; // +1 for trinket
  const spentTracked = unavailable.length + trinketScore;
  const defensivesFraction = totalTracked > 0 ? spentTracked / totalTracked : 0;
  const hpFraction = hpPercent !== null ? hpPercent / 100 : 0.5; // assume 50% if unknown

  const trinketPenalty = trinketAvailable === false ? 15 : 0;
  const softnessScore = 50 * (1 - hpFraction) + 50 * defensivesFraction + trinketPenalty;

  return {
    unitId: enemy.id,
    playerName: enemy.name,
    playerSpec: specToString(enemy.spec),
    hpPercent,
    defensivesAvailable: available,
    defensivesUnavailable: unavailable,
    trinketAvailable,
    softnessScore,
  };
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

/**
 * For each offensive window (from computeOffensiveWindows), snapshots ALL enemies
 * at the window start and flags whether a better target was available than the
 * enemy whose defensives triggered the window.
 *
 * Only surfaces windows where at least two enemies are present (otherwise there's
 * no target selection decision to make).
 */
export function analyzeKillWindowTargetSelection(
  windows: IOffensiveWindow[],
  enemies: ICombatUnit[],
  combat: AtomicArenaCombat,
): IKillWindowTargetEval[] {
  if (enemies.length < 2) return [];

  const matchStartMs = combat.startTime;
  const results: IKillWindowTargetEval[] = [];

  for (const window of windows) {
    if (window.durationSeconds < MIN_WINDOW_SECONDS) continue;

    const focusedEnemy = enemies.find((e) => e.id === window.targetUnitId);
    if (!focusedEnemy) continue;

    const otherEnemies = enemies.filter((e) => e.id !== window.targetUnitId);
    if (otherEnemies.length === 0) continue;

    const focusedSnapshot = snapshotEnemy(focusedEnemy, window.fromSeconds, matchStartMs);
    const otherSnapshots = otherEnemies.map((e) => snapshotEnemy(e, window.fromSeconds, matchStartMs));

    // Find the single best alternative target (highest softness score)
    const bestAlternative = otherSnapshots.reduce<IEnemySnapshot | null>((best, s) => {
      if (!best) return s;
      return s.softnessScore > best.softnessScore ? s : best;
    }, null);

    // Flag as "better target exists" when the alternative is meaningfully softer
    // (at least 15 score points ahead, to avoid noise from equal states)
    const SCORE_MARGIN = 15;
    const betterTargetExists =
      bestAlternative !== null && bestAlternative.softnessScore > focusedSnapshot.softnessScore + SCORE_MARGIN;

    results.push({
      windowFromSeconds: window.fromSeconds,
      windowToSeconds: window.toSeconds,
      focusedTarget: focusedSnapshot,
      otherTargets: otherSnapshots,
      betterTargetExists,
      betterTargetName: betterTargetExists ? bestAlternative?.playerName : undefined,
      betterTargetSpec: betterTargetExists ? bestAlternative?.playerSpec : undefined,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

function fmtHp(hp: number | null): string {
  if (hp === null) return 'HP unknown';
  return `${Math.round(hp)}% HP`;
}

function fmtDefensives(snap: IEnemySnapshot): string {
  if (snap.defensivesAvailable.length === 0 && snap.defensivesUnavailable.length === 0) {
    return 'no defensives tracked';
  }
  const parts: string[] = [];
  if (snap.defensivesUnavailable.length > 0) {
    parts.push(`no defensives (${snap.defensivesUnavailable.join(', ')} spent)`);
  } else if (snap.defensivesAvailable.length > 0) {
    parts.push(`defensives up: ${snap.defensivesAvailable.join(', ')}`);
  }
  if (snap.trinketAvailable === false) parts.push('trinket on CD');
  else if (snap.trinketAvailable === true) parts.push('trinket available');
  return parts.join(', ');
}

export function formatKillWindowTargetSelectionForContext(evals: IKillWindowTargetEval[]): string[] {
  if (evals.length === 0) return [];

  const lines: string[] = [];
  lines.push('KILL WINDOW TARGET SELECTION — per-window enemy state comparison:');

  for (const ev of evals) {
    lines.push('');
    lines.push(`  Window ${fmtTime(ev.windowFromSeconds)}–${fmtTime(ev.windowToSeconds)}:`);

    // Focused target
    const f = ev.focusedTarget;
    lines.push(
      `    Focused: ${f.playerSpec} (${f.playerName}) — ${fmtHp(f.hpPercent)}, ${fmtDefensives(f)} [softness: ${Math.round(f.softnessScore)}]`,
    );

    // Alternatives
    for (const o of ev.otherTargets) {
      lines.push(
        `    Other:   ${o.playerSpec} (${o.playerName}) — ${fmtHp(o.hpPercent)}, ${fmtDefensives(o)} [softness: ${Math.round(o.softnessScore)}]`,
      );
    }

    if (ev.betterTargetExists && ev.betterTargetSpec && ev.betterTargetName) {
      lines.push(
        `    ⚠ Better target available: ${ev.betterTargetSpec} (${ev.betterTargetName}) was softer at this window`,
      );
    } else {
      lines.push(`    ✓ Focused target was the correct or equivalent choice`);
    }
  }

  return lines;
}

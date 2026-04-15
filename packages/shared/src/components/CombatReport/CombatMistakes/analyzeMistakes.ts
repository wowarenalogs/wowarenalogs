import {
  AtomicArenaCombat,
  CombatAction,
  CombatAdvancedAction,
  CombatUnitReaction,
  CombatUnitSpec,
  CombatUnitType,
  ICombatUnit,
  LogEvent,
} from '@wowarenalogs/parser';

import { ccSpellIds } from '../../../data/spellTags';
import { healerSpecs } from '../../../utils/utils';
import {
  DEFENSIVE_BUFF_IDS,
  DEFENSIVE_CDS,
  DR_CATEGORIES,
  FULL_IMMUNITY_AURA_IDS,
  INTERRUPT_SPELL_IDS,
  LOW_VALUE_CC_SPELL_IDS,
  MistakeSeverity,
  OFFENSIVE_BUFF_IDS,
  SPELL_NAMES,
  TRINKET_SPELL_ID,
} from './mistakeKnowledgeBase';

export interface MistakeEvidence {
  timestamp: number;
  text: string;
  spellId?: string;
  /** Secondary spell ID (e.g. the immunity/defensive aura on the target). */
  extraSpellId?: string;
}

export interface DetectedMistake {
  id: string;
  playerId: string;
  severity: MistakeSeverity;
  title: string;
  tip: string;
  timestamp: number;
  /** Optional spell ID relevant to the mistake (for icon display). */
  spellId?: string;
  /** Optional spell name. */
  spellName?: string;
  /** Optional target unit ID (for rendering target name with spec icon). */
  targetId?: string;
  /** Optional secondary spell ID (e.g. the defensive aura on the target). */
  extraSpellId?: string;
  /** Optional text rendered after the target name (e.g. "'s Defensive Spell"). */
  titleSuffix?: string;
  /** Individual log events that produced this mistake. */
  evidence?: MistakeEvidence[];
}

const DR_WINDOW_MS = 18000; // 18 seconds for DR reset

/**
 * Analyze a combat encounter and return all detected mistakes for every player.
 */
export function analyzeMistakes(combat: AtomicArenaCombat): DetectedMistake[] {
  const mistakes: DetectedMistake[] = [];
  const players = Object.values(combat.units).filter(
    (u) =>
      u.type === CombatUnitType.Player &&
      (u.reaction === CombatUnitReaction.Friendly || u.reaction === CombatUnitReaction.Hostile),
  );

  for (const player of players) {
    mistakes.push(...detectDamageIntoImmunity(player, combat));
    mistakes.push(...detectCCIntoImmunity(player, combat));
    mistakes.push(...detectDiedWithoutDefensive(player, combat));
    mistakes.push(...detectTrinketLowValueCC(player, combat));
    mistakes.push(...detectCCDROverlap(player, combat));
    mistakes.push(...detectMissedKicks(player, combat));
    mistakes.push(...detectBurstIntoDefensives(player, combat));
    mistakes.push(...detectLateDefensive(player));
  }

  // Sort by timestamp
  mistakes.sort((a, b) => a.timestamp - b.timestamp);
  return mistakes;
}

/**
 * Detect when a player dealt significant damage into a target with a full immunity aura.
 */

function detectDamageIntoImmunity(player: ICombatUnit, combat: AtomicArenaCombat): DetectedMistake[] {
  const mistakes: DetectedMistake[] = [];

  // Build a timeline of immunity windows for all units
  const immunityWindows = buildAuraWindows(combat, FULL_IMMUNITY_AURA_IDS);

  const evidence: MistakeEvidence[] = [];

  // 1. Check damage events that landed during an immunity window
  for (const dmg of player.damageOut) {
    if (!('logLine' in dmg)) continue;
    // Skip DoT ticks — the player can't stop periodic damage already applied before the immunity
    if (dmg.logLine.event === LogEvent.SPELL_PERIODIC_DAMAGE) continue;
    const targetId = dmg.logLine.parameters[4]?.toString();
    if (!targetId) continue;

    const windows = immunityWindows.get(targetId);
    if (!windows) continue;

    for (const win of windows) {
      if (dmg.logLine.timestamp >= win.start && dmg.logLine.timestamp <= win.end) {
        const targetName = dmg.destUnitName?.split('-')[0] ?? 'target';
        const spellName = dmg.spellName ?? 'Melee';
        const immunityName = SPELL_NAMES.get(win.spellId) ?? win.spellId;
        evidence.push({
          timestamp: dmg.logLine.timestamp,
          text: `${spellName} → ${targetName} (${immunityName})`,
          spellId: dmg.spellId ?? undefined,
          extraSpellId: win.spellId,
        });
        break;
      }
    }
  }

  // Sort combined evidence by time
  evidence.sort((a, b) => a.timestamp - b.timestamp);

  // Only flag if there were multiple hits into immunity (not just one stray tick)
  if (evidence.length >= 3) {
    mistakes.push({
      id: 'damage_into_immunity',
      playerId: player.id,
      severity: 'MEDIUM',
      title: `Dealt ${evidence.length} hits into immune targets`,
      tip: 'Attacking a target with Divine Shield, Ice Block, Aspect of the Turtle, or Cyclone wastes GCDs. Swap targets or wait for the immunity to expire.',
      timestamp: evidence[0].timestamp,
      evidence,
    });
  }

  return mistakes;
}

/**
 * Detect when a player cast a CC spell on an immune target (SPELL_MISSED with IMMUNE).
 * Each CC wasted is reported individually since each one has real cooldown/opportunity cost.
 */
function detectCCIntoImmunity(player: ICombatUnit, combat: AtomicArenaCombat): DetectedMistake[] {
  const mistakes: DetectedMistake[] = [];

  for (const evt of combat.events) {
    if (evt.logLine.event !== LogEvent.SPELL_MISSED) continue;
    if (evt.srcUnitId !== player.id) continue;
    const missType = evt.logLine.parameters[11]?.toString();
    if (missType !== 'IMMUNE') continue;
    if (!evt.spellId || !ccSpellIds.has(evt.spellId)) continue;

    const targetName = evt.destUnitName?.split('-')[0] ?? 'target';
    mistakes.push({
      id: 'cc_into_immunity',
      playerId: player.id,
      severity: 'HIGH',
      title: `${evt.spellName ?? 'CC'} wasted on immune ${targetName}`,
      tip: 'CC spells have meaningful cooldowns. Verify the target is not immune before casting.',
      timestamp: evt.logLine.timestamp,
      spellId: evt.spellId,
    });
  }

  return mistakes;
}

interface AuraWindow {
  start: number;
  end: number;
  spellId: string;
}

/**
 * Build time windows for when specific auras are active on each unit.
 * Returns a map of unitId → list of { start, end, spellId } windows.
 */
function buildAuraWindows(combat: AtomicArenaCombat, spellIdSet: Set<string>): Map<string, AuraWindow[]> {
  const windows = new Map<string, AuraWindow[]>();

  for (const unit of Object.values(combat.units)) {
    const unitWindows: AuraWindow[] = [];
    const openWindows = new Map<string, number>(); // spellId -> start timestamp

    for (const aura of unit.auraEvents) {
      const spellId = aura.spellId ?? '';
      if (!spellIdSet.has(spellId)) continue;

      if (aura.logLine.event === LogEvent.SPELL_AURA_APPLIED) {
        openWindows.set(spellId, aura.logLine.timestamp);
      } else if (aura.logLine.event === LogEvent.SPELL_AURA_REMOVED) {
        const start = openWindows.get(spellId);
        if (start !== undefined) {
          unitWindows.push({ start, end: aura.logLine.timestamp, spellId });
          openWindows.delete(spellId);
        }
      }
    }

    // Close any still-open windows at combat end
    for (const [spellId, start] of openWindows.entries()) {
      unitWindows.push({ start, end: combat.endTime, spellId });
    }

    if (unitWindows.length > 0) {
      windows.set(unit.id, unitWindows);
    }
  }

  return windows;
}

/**
 * Detect when a player died without having used any of their major defensive cooldowns.
 */
function detectDiedWithoutDefensive(player: ICombatUnit, _combat: AtomicArenaCombat): DetectedMistake[] {
  const mistakes: DetectedMistake[] = [];

  // Only check players who actually died
  if (player.deathRecords.length === 0) return mistakes;

  const specDefensives = DEFENSIVE_CDS[player.spec];
  if (!specDefensives || specDefensives.length === 0) return mistakes;

  // Check if any defensive was cast during the match
  const defensivesUsed = new Set<string>();
  for (const cast of player.spellCastEvents) {
    if (cast.spellId && specDefensives.includes(cast.spellId)) {
      defensivesUsed.add(cast.spellId);
    }
  }

  // Also check aura events (some defensives are buffs, not casts)
  for (const aura of player.auraEvents) {
    if (
      aura.spellId &&
      specDefensives.includes(aura.spellId) &&
      aura.logLine.event === LogEvent.SPELL_AURA_APPLIED &&
      aura.srcUnitId === player.id
    ) {
      defensivesUsed.add(aura.spellId);
    }
  }

  const unusedDefensives = specDefensives.filter((id) => !defensivesUsed.has(id));
  if (unusedDefensives.length > 0) {
    const deathTime = player.deathRecords[0].timestamp;
    mistakes.push({
      id: 'died_without_defensive',
      playerId: player.id,
      severity: 'HIGH',
      title: `Died without using ${unusedDefensives.length} defensive cooldown${unusedDefensives.length > 1 ? 's' : ''}`,
      tip: `${player.name.split('-')[0]} died without ever activating a major defensive cooldown. These abilities exist to prevent exactly this outcome.`,
      timestamp: deathTime,
      spellId: unusedDefensives[0],
    });
  }

  return mistakes;
}

/**
 * Detect when a player trinketed a low-value CC (Sap, Gouge).
 */
function detectTrinketLowValueCC(player: ICombatUnit, _combat: AtomicArenaCombat): DetectedMistake[] {
  const mistakes: DetectedMistake[] = [];

  // Look for trinket casts (aura removal of CC via trinket)
  // Trinket shows as SPELL_CAST_SUCCESS of the PvP trinket spell
  const trinketCasts = player.spellCastEvents.filter(
    (e) => e.spellId === TRINKET_SPELL_ID && e.logLine.event === LogEvent.SPELL_CAST_SUCCESS,
  );

  for (const trinketCast of trinketCasts) {
    // Check what CC was on the player just before they trinketed
    // Look at auras that were removed within 500ms of the trinket cast
    const trinketTime = trinketCast.logLine.timestamp;
    const recentCCRemoved = player.auraEvents.filter(
      (a) =>
        a.logLine.event === LogEvent.SPELL_AURA_REMOVED &&
        Math.abs(a.logLine.timestamp - trinketTime) < 500 &&
        a.spellId &&
        LOW_VALUE_CC_SPELL_IDS.has(a.spellId),
    );

    if (recentCCRemoved.length > 0) {
      const cc = recentCCRemoved[0];
      mistakes.push({
        id: 'trinket_low_value_cc',
        playerId: player.id,
        severity: 'MEDIUM',
        title: `Trinket used to break ${cc.spellName ?? 'low-value CC'}`,
        tip: 'Sap and Gouge break on damage and have short durations. Trinket is better saved for stuns during kill attempts or CC chains that threaten lethal.',
        timestamp: trinketTime,
        spellId: cc.spellId ?? undefined,
      });
    }
  }

  return mistakes;
}

/**
 * Detect when a player applied CC from the same DR category within 18 seconds on the same target.
 *
 * SPELL_AURA_APPLIED events live on the *target's* auraEvents, not the
 * caster's actionOut, so we scan all units' aura events filtered by srcUnitId.
 */
function detectCCDROverlap(player: ICombatUnit, combat: AtomicArenaCombat): DetectedMistake[] {
  const mistakes: DetectedMistake[] = [];

  // Track last CC application per DR category per target
  // Key: `${targetId}:${drCategory}`
  const lastCCTime = new Map<string, { timestamp: number; spellId: string; spellName: string }>();

  // Collect all SPELL_AURA_APPLIED events where this player is the source,
  // across all units' auraEvents, sorted by timestamp.
  const ccApplied: CombatAction[] = [];
  for (const unit of Object.values(combat.units)) {
    for (const aura of unit.auraEvents) {
      if (aura.logLine.event !== LogEvent.SPELL_AURA_APPLIED) continue;
      if (aura.srcUnitId !== player.id) continue;
      const spellId = aura.spellId ?? '';
      if (!spellId) continue;

      // Check if this spell is in any DR category
      for (const [, spells] of Object.entries(DR_CATEGORIES)) {
        if (spells.has(spellId)) {
          ccApplied.push(aura);
          break;
        }
      }
    }
  }

  ccApplied.sort((a, b) => a.logLine.timestamp - b.logLine.timestamp);

  for (const aura of ccApplied) {
    const spellId = aura.spellId ?? '';

    // Find which DR category this spell belongs to
    let drCategory: string | null = null;
    for (const [category, spells] of Object.entries(DR_CATEGORIES)) {
      if (spells.has(spellId)) {
        drCategory = category;
        break;
      }
    }
    if (!drCategory) continue;

    const targetId = aura.destUnitId;
    const key = `${targetId}:${drCategory}`;
    const last = lastCCTime.get(key);

    if (last && aura.logLine.timestamp - last.timestamp < DR_WINDOW_MS) {
      // Same DR category on same target within 18s
      mistakes.push({
        id: 'cc_dr_overlap',
        playerId: player.id,
        severity: 'LOW',
        title: `${aura.spellName ?? 'CC'} applied into ${drCategory} DR on ${aura.destUnitName.split('-')[0]}`,
        tip: `This ${drCategory} CC was applied within 18 seconds of a previous ${drCategory} CC on the same target, causing diminishing returns. Chain CC from different DR categories instead.`,
        timestamp: aura.logLine.timestamp,
        spellId: spellId,
      });
    }

    lastCCTime.set(key, {
      timestamp: aura.logLine.timestamp,
      spellId,
      spellName: aura.spellName ?? 'CC',
    });
  }

  return mistakes;
}

/**
 * Detect when a player cast an interrupt spell but failed to interrupt anything.
 *
 * A "missed kick" is a SPELL_CAST_SUCCESS of an interrupt spell that has no
 * corresponding SPELL_INTERRUPT event from the same player within a short window.
 */
function detectMissedKicks(player: ICombatUnit, combat: AtomicArenaCombat): DetectedMistake[] {
  const mistakes: DetectedMistake[] = [];

  // Collect all successful interrupt events by this player (from actionOut)
  const interruptTimestamps = new Set<number>();
  for (const action of player.actionOut) {
    if (action.logLine.event === LogEvent.SPELL_INTERRUPT) {
      interruptTimestamps.add(action.logLine.timestamp);
    }
  }

  // Find all kick casts and SPELL_MISSED IMMUNE events for kicks from combat.events
  const kickCasts: CombatAction[] = [];
  // Map of timestamp → true for kick spells that got IMMUNE
  const kickImmuneTimestamps = new Set<number>();
  for (const evt of combat.events) {
    if (evt.srcUnitId !== player.id) continue;
    if (!evt.spellId || !INTERRUPT_SPELL_IDS.has(evt.spellId)) continue;
    if (evt.logLine.event === LogEvent.SPELL_CAST_SUCCESS) {
      kickCasts.push(evt);
    } else if (evt.logLine.event === LogEvent.SPELL_MISSED) {
      const missType = evt.logLine.parameters[11]?.toString();
      if (missType === 'IMMUNE') {
        kickImmuneTimestamps.add(evt.logLine.timestamp);
      }
    }
  }

  for (const cast of kickCasts) {
    const castTime = cast.logLine.timestamp;
    // Check if a SPELL_INTERRUPT occurred within 100ms of the cast
    let interrupted = false;
    for (const ts of Array.from(interruptTimestamps)) {
      if (Math.abs(ts - castTime) <= 100) {
        interrupted = true;
        interruptTimestamps.delete(ts);
        break;
      }
    }

    if (!interrupted) {
      const spellName = cast.spellName ?? SPELL_NAMES.get(cast.spellId ?? '') ?? 'Interrupt';
      const wasImmune = kickImmuneTimestamps.has(castTime);
      mistakes.push({
        id: 'missed_kick',
        playerId: player.id,
        severity: wasImmune ? 'LOW' : 'MEDIUM',
        title: wasImmune ? `${spellName} into immune target` : `${spellName} missed`,
        tip: wasImmune
          ? 'This interrupt was cast on a target that was immune. Check for active immunities before kicking.'
          : 'This interrupt was cast but did not interrupt a spell. The target may not have been casting, or the cast finished before the kick landed.',
        timestamp: castTime,
        spellId: cast.spellId ?? undefined,
        targetId: cast.destUnitId || undefined,
      });
    }
  }

  return mistakes;
}

/**
 * Detect when a player deals damage while they have an offensive cooldown active
 * and their target has a defensive cooldown active.
 *
 * This flags situations where burst damage is wasted into defensives.
 */
function detectBurstIntoDefensives(player: ICombatUnit, combat: AtomicArenaCombat): DetectedMistake[] {
  const mistakes: DetectedMistake[] = [];

  // Healers are exempt — offensive CD resolution is too noisy for healer specs
  if (healerSpecs.includes(player.spec as CombatUnitSpec)) return mistakes;

  // Build windows for this player's offensive buffs
  const offensiveWindows = buildAuraWindows(combat, OFFENSIVE_BUFF_IDS).get(player.id);
  if (!offensiveWindows || offensiveWindows.length === 0) return mistakes;

  // Build defensive windows for all units
  const defensiveWindows = buildAuraWindows(combat, DEFENSIVE_BUFF_IDS);

  // Collect evidence per unique offensive+defensive+target combo
  const evidenceByKey = new Map<
    string,
    { offSpellId: string; defSpellId: string; targetId: string; targetName: string; evidence: MistakeEvidence[] }
  >();

  for (const offWin of offensiveWindows) {
    for (const dmg of player.damageOut) {
      if (!('logLine' in dmg)) continue;
      const ts = dmg.logLine.timestamp;
      if (ts < offWin.start || ts > offWin.end) continue;

      const targetId = dmg.logLine.parameters[4]?.toString();
      if (!targetId) continue;
      // Skip self-damage — having an offensive CD + defensive buff on yourself is not a mistake
      if (targetId === player.id) continue;

      const targetDefWindows = defensiveWindows.get(targetId);
      if (!targetDefWindows) continue;

      for (const defWin of targetDefWindows) {
        if (ts >= defWin.start && ts <= defWin.end) {
          const key = `${offWin.spellId}:${defWin.spellId}:${targetId}`;
          let entry = evidenceByKey.get(key);
          if (!entry) {
            entry = {
              offSpellId: offWin.spellId,
              defSpellId: defWin.spellId,
              targetId,
              targetName: dmg.destUnitName?.split('-')[0] ?? 'target',
              evidence: [],
            };
            evidenceByKey.set(key, entry);
          }
          const spellName = dmg.spellName ?? 'Attack';
          entry.evidence.push({
            timestamp: ts,
            text: `${spellName} → ${entry.targetName}`,
            spellId: dmg.spellId ?? undefined,
          });
          break;
        }
      }
    }
  }

  for (const entry of evidenceByKey.values()) {
    entry.evidence.sort((a, b) => a.timestamp - b.timestamp);
    const offName = SPELL_NAMES.get(entry.offSpellId) ?? 'Offensive CD';
    const defName = SPELL_NAMES.get(entry.defSpellId) ?? 'defensive';

    mistakes.push({
      id: 'burst_into_defensive',
      playerId: player.id,
      severity: 'HIGH',
      title: `${offName} damage into`,
      extraSpellId: entry.defSpellId,
      titleSuffix: defName,
      tip: `${entry.evidence.length} hit${entry.evidence.length !== 1 ? 's' : ''} dealt while ${offName} was active but the target had ${defName} up. Consider swapping targets or waiting for the defensive to expire before committing offensive cooldowns.`,
      timestamp: entry.evidence[0].timestamp,
      spellId: entry.offSpellId,
      targetId: entry.targetId,
      evidence: entry.evidence,
    });
  }

  return mistakes;
}

const LATE_DEFENSIVE_HP_THRESHOLD = 0.3;

/**
 * Detect when a player uses a major defensive cooldown at very low HP (<30%).
 * Full immunities (Divine Shield, Ice Block, Turtle) are excluded since they
 * are effective regardless of HP.
 */
function detectLateDefensive(player: ICombatUnit): DetectedMistake[] {
  const mistakes: DetectedMistake[] = [];

  const specDefensives = DEFENSIVE_CDS[player.spec];
  if (!specDefensives || specDefensives.length === 0) return mistakes;

  for (const cast of player.spellCastEvents) {
    if (cast.logLine.event !== LogEvent.SPELL_CAST_SUCCESS) continue;
    const spellId = cast.spellId ?? '';
    if (!specDefensives.includes(spellId)) continue;
    // Full immunities are effective at any HP
    if (FULL_IMMUNITY_AURA_IDS.has(spellId)) continue;

    // CombatAdvancedAction has HP data for SPELL_CAST_SUCCESS events
    if (!(cast instanceof CombatAdvancedAction)) continue;
    if (cast.advancedActorMaxHp <= 0) continue;

    const hpPct = cast.advancedActorCurrentHp / cast.advancedActorMaxHp;
    if (hpPct < LATE_DEFENSIVE_HP_THRESHOLD) {
      const spellName = cast.spellName ?? SPELL_NAMES.get(spellId) ?? 'Defensive';
      const pctDisplay = Math.round(hpPct * 100);
      mistakes.push({
        id: 'late_defensive',
        playerId: player.id,
        severity: 'MEDIUM',
        title: `${spellName} used at ${pctDisplay}% HP`,
        tip: `Defensive cooldowns are most effective when used early. Using ${spellName} at low HP risks dying before it can absorb or mitigate enough damage.`,
        timestamp: cast.logLine.timestamp,
        spellId,
      });
    }
  }

  return mistakes;
}

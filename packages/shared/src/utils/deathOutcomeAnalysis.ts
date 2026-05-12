import { AtomicArenaCombat, CombatUnitSpec, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { IPlayerCCTrinketSummary } from './ccTrinketAnalysis';
import { specToString } from './cooldowns';
import { distanceBetween, getUnitPositionAtTime, hasLineOfSight } from './losAnalysis';

interface IImmunitySpell {
  name: string;
  cooldownSeconds: number;
  lockoutSpellId?: string;
  specs: CombatUnitSpec[];
  /** Spell IDs that reset this immunity's cooldown when cast (CDR/reset mechanics). */
  resetSpellIds?: string[];
}

const IMMUNITY_SPELLS: Record<string, IImmunitySpell> = {
  '642': {
    name: 'Divine Shield',
    cooldownSeconds: 300,
    lockoutSpellId: '25771',
    specs: [CombatUnitSpec.Paladin_Holy, CombatUnitSpec.Paladin_Retribution, CombatUnitSpec.Paladin_Protection],
  },
  '45438': {
    name: 'Ice Block',
    cooldownSeconds: 240,
    lockoutSpellId: '41425',
    specs: [CombatUnitSpec.Mage_Arcane, CombatUnitSpec.Mage_Fire, CombatUnitSpec.Mage_Frost],
    // B30: Cold Snap (235219) resets Ice Block's cooldown
    resetSpellIds: ['235219'],
  },
  '47585': {
    name: 'Dispersion',
    cooldownSeconds: 90,
    specs: [CombatUnitSpec.Priest_Shadow],
  },
  '186265': {
    name: 'Aspect of the Turtle',
    cooldownSeconds: 180,
    specs: [CombatUnitSpec.Hunter_BeastMastery, CombatUnitSpec.Hunter_Marksmanship, CombatUnitSpec.Hunter_Survival],
  },
  '196555': {
    name: 'Netherwalk',
    cooldownSeconds: 30,
    specs: [CombatUnitSpec.DemonHunter_Havoc],
  },
};

const EXTERNAL_DEFENSIVE_SPELLS: Record<string, { name: string; cooldownSeconds: number; specs: CombatUnitSpec[] }> = {
  '102342': {
    name: 'Ironbark',
    cooldownSeconds: 45,
    specs: [CombatUnitSpec.Druid_Restoration],
  },
  '33206': {
    name: 'Pain Suppression',
    cooldownSeconds: 180,
    specs: [CombatUnitSpec.Priest_Discipline],
  },
  '47788': {
    name: 'Guardian Spirit',
    cooldownSeconds: 180,
    specs: [CombatUnitSpec.Priest_Holy],
  },
  '1022': {
    name: 'Blessing of Protection',
    cooldownSeconds: 300,
    specs: [CombatUnitSpec.Paladin_Holy, CombatUnitSpec.Paladin_Retribution, CombatUnitSpec.Paladin_Protection],
  },
  '633': {
    name: 'Lay on Hands',
    cooldownSeconds: 420,
    specs: [CombatUnitSpec.Paladin_Holy, CombatUnitSpec.Paladin_Retribution, CombatUnitSpec.Paladin_Protection],
  },
  '116849': {
    name: 'Life Cocoon',
    cooldownSeconds: 120,
    specs: [CombatUnitSpec.Monk_Mistweaver],
  },
};

export interface IDeathImmuneAvailable {
  spellId: string;
  spellName: string;
  wasInCC: boolean;
}

export interface IMissedExternal {
  casterName: string;
  casterSpec: string;
  spellId: string;
  spellName: string;
  casterWasInCC: boolean;
}

export interface IDeathOutcomeEvent {
  deadPlayer: string;
  deadPlayerSpec: string;
  atSeconds: number;
  availableImmunities: IDeathImmuneAvailable[];
  missedExternals: IMissedExternal[];
}

export interface IDeathOutcomeSummary {
  events: IDeathOutcomeEvent[];
}

function lastCastSeconds(unit: ICombatUnit, spellId: string, matchStartMs: number): number | null {
  const casts = unit.spellCastEvents.filter(
    (e) => e.spellId === spellId && e.logLine.event === LogEvent.SPELL_CAST_SUCCESS,
  );
  if (casts.length === 0) return null;
  return (Math.max(...casts.map((e) => e.logLine.timestamp)) - matchStartMs) / 1000;
}

function isAvailableAt(
  unit: ICombatUnit,
  spellId: string,
  cooldownSeconds: number,
  atSeconds: number,
  matchStartMs: number,
  resetSpellIds?: string[],
): boolean {
  const lastCast = lastCastSeconds(unit, spellId, matchStartMs);
  if (lastCast === null) return true;
  if (atSeconds >= lastCast + cooldownSeconds) return true;

  // B30: if a reset spell was cast between the last use and atSeconds, the cooldown was reset.
  // Treat the reset cast as the new "last cast" and check availability from there.
  if (resetSpellIds && resetSpellIds.length > 0) {
    for (const resetId of resetSpellIds) {
      const resetCast = lastCastSeconds(unit, resetId, matchStartMs);
      if (resetCast !== null && resetCast > lastCast && resetCast <= atSeconds) {
        // Reset happened after the last use — cooldown starts over from the reset
        return atSeconds >= resetCast + cooldownSeconds;
      }
    }
  }
  return false;
}

/** Pre-computed lockout intervals: [fromSeconds, toSeconds] pairs sorted by fromSeconds. */
type LockoutIntervals = [number, number][];

/** Build lockout intervals for one (unit, spellId) pair once per match. */
function buildLockoutIntervals(unit: ICombatUnit, lockoutSpellId: string, matchStartMs: number): LockoutIntervals {
  const relevant = unit.auraEvents
    .filter((e) => e.spellId === lockoutSpellId)
    .sort((a, b) => {
      if (a.logLine.timestamp !== b.logLine.timestamp) return a.logLine.timestamp - b.logLine.timestamp;
      if (a.logLine.event === LogEvent.SPELL_AURA_APPLIED) return -1;
      if (b.logLine.event === LogEvent.SPELL_AURA_APPLIED) return 1;
      return 0;
    });

  const intervals: LockoutIntervals = [];
  let openAt: number | null = null;
  for (const e of relevant) {
    const t = (e.logLine.timestamp - matchStartMs) / 1000;
    if (e.logLine.event === LogEvent.SPELL_AURA_APPLIED) openAt = t;
    else if (e.logLine.event === LogEvent.SPELL_AURA_REMOVED && openAt !== null) {
      intervals.push([openAt, t]);
      openAt = null;
    }
  }
  return intervals;
}

/** B29: O(log N) lockout check using pre-built intervals. */
function isLockedOutAt(intervals: LockoutIntervals, atSeconds: number): boolean {
  let lo = 0;
  let hi = intervals.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const [from, to] = intervals[mid];
    if (atSeconds < from) {
      hi = mid - 1;
    } else if (atSeconds > to) {
      lo = mid + 1;
    } else {
      return true; // atSeconds is within [from, to]
    }
  }
  return false;
}

function wasInHardCC(
  ccSummary: Pick<IPlayerCCTrinketSummary, 'playerName' | 'ccInstances'>,
  atSeconds: number,
): boolean {
  return ccSummary.ccInstances.some(
    (cc) => cc.atSeconds <= atSeconds && cc.atSeconds + cc.durationSeconds > atSeconds && cc.trinketState !== 'used', // 'used' = they did trinket out; any other state = they were CC'd
  );
}

// Max range for external defensive spells (all are 40-yard targeted spells in WoW).
const EXTERNAL_SPELL_RANGE_YARDS = 40;

export function buildDeathOutcomeSummary(
  combat: Pick<AtomicArenaCombat, 'startTime'> & { zoneId?: string },
  friends: ICombatUnit[],
  ccSummaries: Pick<IPlayerCCTrinketSummary, 'playerName' | 'ccInstances'>[],
): IDeathOutcomeSummary {
  const matchStartMs = combat.startTime;
  const events: IDeathOutcomeEvent[] = [];

  // B29: pre-build lockout intervals once per (unit, spell) pair to avoid O(N) filter+sort per death
  const lockoutCache = new Map<string, LockoutIntervals>();
  const getLockoutIntervals = (unit: ICombatUnit, spellId: string): LockoutIntervals => {
    const key = `${unit.id}:${spellId}`;
    if (!lockoutCache.has(key)) lockoutCache.set(key, buildLockoutIntervals(unit, spellId, matchStartMs));
    return lockoutCache.get(key) ?? [];
  };

  for (const unit of friends) {
    for (const deathRecord of unit.deathRecords) {
      const atSeconds = (deathRecord.timestamp - matchStartMs) / 1000;
      const ccSummary = ccSummaries.find((s) => s.playerName === unit.name);

      const availableImmunities: IDeathImmuneAvailable[] = [];
      for (const [spellId, spell] of Object.entries(IMMUNITY_SPELLS)) {
        if (!spell.specs.includes(unit.spec)) continue;
        if (!isAvailableAt(unit, spellId, spell.cooldownSeconds, atSeconds, matchStartMs, spell.resetSpellIds))
          continue;
        if (spell.lockoutSpellId && isLockedOutAt(getLockoutIntervals(unit, spell.lockoutSpellId), atSeconds)) continue;
        availableImmunities.push({
          spellId,
          spellName: spell.name,
          wasInCC: ccSummary ? wasInHardCC(ccSummary, atSeconds) : false,
        });
      }

      const deathMs = deathRecord.timestamp;
      const dyingPos = getUnitPositionAtTime(unit, deathMs);

      const missedExternals: IMissedExternal[] = [];
      for (const teammate of friends) {
        if (teammate.id === unit.id) continue;
        const teammateCCSummary = ccSummaries.find((s) => s.playerName === teammate.name);

        // B27: skip if teammate was out of spell range or LoS-blocked at death time
        const casterPos = getUnitPositionAtTime(teammate, deathMs);
        if (dyingPos && casterPos) {
          if (distanceBetween(dyingPos, casterPos) > EXTERNAL_SPELL_RANGE_YARDS) continue;
          if (combat.zoneId) {
            const los = hasLineOfSight(combat.zoneId, casterPos, dyingPos);
            if (los === false) continue; // confirmed LoS blocked (null = unmapped, pass through)
          }
        }

        for (const [spellId, spell] of Object.entries(EXTERNAL_DEFENSIVE_SPELLS)) {
          const everCast = teammate.spellCastEvents.some(
            (e) => e.spellId === spellId && e.logLine.event === LogEvent.SPELL_CAST_SUCCESS,
          );
          if (!everCast && !spell.specs.includes(teammate.spec)) continue;
          if (!isAvailableAt(teammate, spellId, spell.cooldownSeconds, atSeconds, matchStartMs)) continue;
          missedExternals.push({
            casterName: teammate.name,
            casterSpec: specToString(teammate.spec),
            spellId,
            spellName: spell.name,
            casterWasInCC: teammateCCSummary ? wasInHardCC(teammateCCSummary, atSeconds) : false,
          });
        }
      }

      if (availableImmunities.length > 0 || missedExternals.length > 0) {
        events.push({
          deadPlayer: unit.name,
          deadPlayerSpec: specToString(unit.spec),
          atSeconds,
          availableImmunities,
          missedExternals,
        });
      }
    }
  }

  return { events };
}

export function formatDeathOutcomeForContext(summary: IDeathOutcomeSummary): string {
  if (summary.events.length === 0) return '';
  const lines: string[] = ['DEATHS WITH MISSED OPTIONS'];
  for (const ev of summary.events) {
    const t = `${Math.floor(ev.atSeconds / 60)}:${String(Math.floor(ev.atSeconds % 60)).padStart(2, '0')}`;
    for (const imm of ev.availableImmunities) {
      const ccNote = imm.wasInCC ? ', was in CC' : ", was not CC'd";
      lines.push(`  [${t}] ${ev.deadPlayerSpec} (${ev.deadPlayer}) — had ${imm.spellName} available${ccNote}`);
    }
    for (const ext of ev.missedExternals) {
      const ccNote = ext.casterWasInCC ? ', caster in CC' : ', caster was free';
      lines.push(`  [${t}] ${ev.deadPlayer} died — ${ext.casterName} had ${ext.spellName} available${ccNote}`);
    }
  }
  return lines.join('\n');
}

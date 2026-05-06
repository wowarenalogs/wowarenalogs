import { AtomicArenaCombat, CombatUnitSpec, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { IPlayerCCTrinketSummary } from './ccTrinketAnalysis';
import { specToString } from './cooldowns';

interface IImmunitySpell {
  name: string;
  cooldownSeconds: number;
  lockoutSpellId?: string;
  specs: CombatUnitSpec[];
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
): boolean {
  const lastCast = lastCastSeconds(unit, spellId, matchStartMs);
  if (lastCast === null) return true;
  return atSeconds >= lastCast + cooldownSeconds;
}

function isLockedOut(unit: ICombatUnit, lockoutSpellId: string, atSeconds: number, matchStartMs: number): boolean {
  let active = false;
  for (const e of unit.auraEvents) {
    if (e.spellId !== lockoutSpellId) continue;
    const t = (e.logLine.timestamp - matchStartMs) / 1000;
    if (e.logLine.event === LogEvent.SPELL_AURA_APPLIED) active = t <= atSeconds;
    if (e.logLine.event === LogEvent.SPELL_AURA_REMOVED && t <= atSeconds) active = false;
  }
  return active;
}

function wasInHardCC(
  ccSummary: Pick<IPlayerCCTrinketSummary, 'playerName' | 'ccInstances'>,
  atSeconds: number,
): boolean {
  return ccSummary.ccInstances.some(
    (cc) =>
      cc.atSeconds <= atSeconds &&
      cc.atSeconds + cc.durationSeconds > atSeconds &&
      (cc.trinketState === 'on_cooldown' || cc.trinketState === 'passive_trinket'),
  );
}

export function buildDeathOutcomeSummary(
  combat: Pick<AtomicArenaCombat, 'startTime'>,
  friends: ICombatUnit[],
  ccSummaries: Pick<IPlayerCCTrinketSummary, 'playerName' | 'ccInstances'>[],
): IDeathOutcomeSummary {
  const matchStartMs = combat.startTime;
  const events: IDeathOutcomeEvent[] = [];

  for (const unit of friends) {
    for (const deathRecord of unit.deathRecords) {
      const atSeconds = (deathRecord.timestamp - matchStartMs) / 1000;
      const ccSummary = ccSummaries.find((s) => s.playerName === unit.name);

      const availableImmunities: IDeathImmuneAvailable[] = [];
      for (const [spellId, spell] of Object.entries(IMMUNITY_SPELLS)) {
        if (!spell.specs.includes(unit.spec)) continue;
        if (!isAvailableAt(unit, spellId, spell.cooldownSeconds, atSeconds, matchStartMs)) continue;
        if (spell.lockoutSpellId && isLockedOut(unit, spell.lockoutSpellId, atSeconds, matchStartMs)) continue;
        availableImmunities.push({
          spellId,
          spellName: spell.name,
          wasInCC: ccSummary ? wasInHardCC(ccSummary, atSeconds) : false,
        });
      }

      const missedExternals: IMissedExternal[] = [];
      for (const teammate of friends) {
        if (teammate.id === unit.id) continue;
        const teammateCCSummary = ccSummaries.find((s) => s.playerName === teammate.name);
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

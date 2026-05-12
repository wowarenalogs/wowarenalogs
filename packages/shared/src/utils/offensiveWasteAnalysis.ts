import { AtomicArenaCombat, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

import { ccSpellIds } from '../data/spellTags';
import { specToString } from './cooldowns';

const IMMUNITY_AURAS: Record<string, string> = {
  '642': 'Divine Shield',
  '45438': 'Ice Block',
  '47585': 'Dispersion',
  '186265': 'Aspect of the Turtle',
};

const MAJOR_DR_AURAS: Record<string, string> = {
  '102342': 'Ironbark',
  '33206': 'Pain Suppression',
  '264735': 'Survival of the Fittest',
  '22812': 'Barkskin',
  '498': 'Divine Protection',
};

export interface IOffensiveWasteCast {
  spellId: string;
  spellName: string;
  atSeconds: number;
}

export interface IOffensiveWasteEvent {
  casterName: string;
  casterSpec: string;
  targetName: string;
  targetSpec: string;
  defenseType: 'immunity' | 'major_dr';
  defenseName: string;
  defenseWindowSeconds: [number, number];
  wasteCasts: IOffensiveWasteCast[];
}

export interface IOffensiveWasteSummary {
  events: IOffensiveWasteEvent[];
}

interface IDefenseWindow {
  spellId: string;
  defenseName: string;
  defenseType: 'immunity' | 'major_dr';
  fromSeconds: number;
  toSeconds: number;
  unitId: string;
  unitName: string;
  unitSpec: string;
}

function buildDefenseWindows(enemies: ICombatUnit[], matchStartMs: number): IDefenseWindow[] {
  const windows: IDefenseWindow[] = [];

  for (const enemy of enemies) {
    const openAt: Record<string, number> = {};

    const sorted = [...enemy.auraEvents].sort((a, b) => a.logLine.timestamp - b.logLine.timestamp);

    for (const e of sorted) {
      const spellId = e.spellId;
      if (!spellId) continue;
      const isImmunity = spellId in IMMUNITY_AURAS;
      const isDR = spellId in MAJOR_DR_AURAS;
      if (!isImmunity && !isDR) continue;

      const t = (e.logLine.timestamp - matchStartMs) / 1000;

      if (e.logLine.event === LogEvent.SPELL_AURA_APPLIED) {
        openAt[spellId] = t;
      } else if (e.logLine.event === LogEvent.SPELL_AURA_REMOVED && openAt[spellId] !== undefined) {
        windows.push({
          spellId,
          defenseName: isImmunity ? IMMUNITY_AURAS[spellId] : MAJOR_DR_AURAS[spellId],
          defenseType: isImmunity ? 'immunity' : 'major_dr',
          fromSeconds: openAt[spellId],
          toSeconds: t,
          unitId: enemy.id,
          unitName: enemy.name,
          unitSpec: specToString(enemy.spec),
        });
        delete openAt[spellId];
      }
    }
  }

  return windows;
}

function getHighValueSpellIds(unit: ICombatUnit): Set<string> {
  const totals: Record<string, number> = {};
  let grandTotal = 0;

  for (const dmg of unit.damageOut) {
    const id = dmg.spellId ?? 'melee';
    totals[id] = (totals[id] ?? 0) + (dmg.effectiveAmount ?? 0);
    grandTotal += dmg.effectiveAmount ?? 0;
  }

  if (grandTotal === 0) return new Set(Object.keys(totals));
  const threshold = grandTotal * 0.05;
  return new Set(
    Object.entries(totals)
      .filter(([, v]) => v >= threshold)
      .map(([k]) => k),
  );
}

export function buildOffensiveWasteSummary(
  combat: Pick<AtomicArenaCombat, 'startTime'>,
  friends: ICombatUnit[],
  enemies: ICombatUnit[],
): IOffensiveWasteSummary {
  const matchStartMs = combat.startTime;
  const defenseWindows = buildDefenseWindows(enemies, matchStartMs);
  const events: IOffensiveWasteEvent[] = [];

  for (const friend of friends) {
    const highValueIds = getHighValueSpellIds(friend);
    const castEvents = friend.spellCastEvents.filter((e) => e.logLine.event === LogEvent.SPELL_CAST_SUCCESS);

    for (const window of defenseWindows) {
      const threshold = window.defenseType === 'immunity' ? 2 : 3;

      const wasteCasts: IOffensiveWasteCast[] = castEvents
        .filter((e) => {
          if (e.destUnitId !== window.unitId) return false;
          const t = (e.logLine.timestamp - matchStartMs) / 1000;
          if (t < window.fromSeconds || t > window.toSeconds) return false;
          if (e.spellId === null) return false;
          // B28: for immunity windows, also count high-value CC/utility spells that do no damage
          // (e.g. Mindgames, HoJ, Silence) which would otherwise be filtered by the damage threshold.
          const isHighValueCC = window.defenseType === 'immunity' && ccSpellIds.has(e.spellId);
          return isHighValueCC || highValueIds.size === 0 || highValueIds.has(e.spellId);
        })
        .map((e) => ({
          spellId: e.spellId ?? '',
          spellName: e.spellName ?? '',
          atSeconds: (e.logLine.timestamp - matchStartMs) / 1000,
        }));

      if (wasteCasts.length >= threshold) {
        events.push({
          casterName: friend.name,
          casterSpec: specToString(friend.spec),
          targetName: window.unitName,
          targetSpec: window.unitSpec,
          defenseType: window.defenseType,
          defenseName: window.defenseName,
          defenseWindowSeconds: [window.fromSeconds, window.toSeconds],
          wasteCasts,
        });
      }
    }
  }

  return { events };
}

export function formatOffensiveWasteForContext(summary: IOffensiveWasteSummary): string {
  if (summary.events.length === 0) return '';
  const lines: string[] = ['ABILITIES INTO IMMUNITY/DR'];
  for (const ev of summary.events) {
    const t = `${Math.floor(ev.defenseWindowSeconds[0] / 60)}:${String(Math.floor(ev.defenseWindowSeconds[0] % 60)).padStart(2, '0')}`;
    const spells = ev.wasteCasts.map((c) => c.spellName).join(' + ');
    lines.push(`  [${t}] ${ev.casterSpec} (${ev.casterName}): ${spells} into ${ev.targetName}'s ${ev.defenseName}`);
  }
  return lines.join('\n');
}

import { WowVersion, CombatAction, LogEvent } from 'wow-combat-log-parser';

// TODO: Every function in this file represents a feature the parser should handle
// but for now the front end is patching in

// Missing crit flag
export const isCrit = (event: CombatAction, wowversion: WowVersion) => {
  if (wowversion !== 'shadowlands') return false;
  if (event.logLine.event === 'SPELL_DAMAGE') {
    return event.logLine.parameters[35] === 1;
  }
  if (event.logLine.event === 'SPELL_PERIODIC_DAMAGE') {
    return event.logLine.parameters[35] === 1;
  }
  if (event.logLine.event === 'SPELL_HEAL') {
    return event.logLine.parameters[32] === 1;
  }
  if (event.logLine.event === 'SPELL_PERIODIC_HEAL') {
    return event.logLine.parameters[32] === 1;
  }
  return false;
};

// Decoding for SPELL_AURA_APPLIED_DOSE and _REMOVED_DOSE
export const getDosesCount = (event: CombatAction, wowversion: WowVersion) => {
  if (wowversion !== 'shadowlands') return NaN;
  if (
    event.logLine.event === LogEvent.SPELL_AURA_APPLIED_DOSE ||
    event.logLine.event === LogEvent.SPELL_AURA_REMOVED_DOSE
  ) {
    return event.logLine.parameters[12];
  }
  return NaN;
};

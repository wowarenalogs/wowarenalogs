import { AtomicArenaCombat, ICombatUnit, LogEvent } from '@wowarenalogs/parser';

export interface IAuraDuration {
  spellId: string;
  spellName: string;
  startTimeOffset: number;
  endTimeOffset: number;
  auraOwnerId: string;
}

export interface IAuraState {
  spellName: string;
  count: number;
  startTimeOffset: number;
  auraOwnerId: string;
}

export const computeAuraDurations = (combat: AtomicArenaCombat, unit: ICombatUnit) => {
  const durations: IAuraDuration[] = [];
  const auraStates = new Map<string, IAuraState>();

  for (let i = 0; i < unit.auraEvents.length; ++i) {
    const event = unit.auraEvents[i];
    const spellId = event.spellId || '';
    switch (event.logLine.event) {
      case LogEvent.SPELL_AURA_APPLIED:
        {
          const currentState = auraStates.get(spellId) || {
            spellName: event.spellName || '',
            count: 0,
            startTimeOffset: event.logLine.timestamp - combat.startTime,
            auraOwnerId: event.srcUnitId,
          };
          if (event.spellName) {
            currentState.spellName = event.spellName;
          }
          currentState.count += 1;
          auraStates.set(spellId, currentState);
        }
        break;
      case LogEvent.SPELL_AURA_REMOVED:
        {
          const currentAuraState = auraStates.get(spellId) || {
            spellName: event.spellName || '',
            count: 0,
            startTimeOffset: 0,
            auraOwnerId: '',
          };
          if (currentAuraState.count > 0) {
            const newAuraState = {
              spellName: event.spellName || currentAuraState.spellName,
              count: currentAuraState.count - 1,
              startTimeOffset: currentAuraState.startTimeOffset,
              auraOwnerId: currentAuraState.auraOwnerId,
            };
            if (newAuraState.count === 0) {
              durations.push({
                spellId,
                spellName: newAuraState.spellName,
                startTimeOffset: newAuraState.startTimeOffset,
                endTimeOffset: event.timestamp - combat.startTime,
                auraOwnerId: currentAuraState.auraOwnerId,
              });
              auraStates.delete(spellId);
            } else {
              auraStates.set(spellId, newAuraState);
            }
          }
        }
        break;
    }
  }

  return durations;
};

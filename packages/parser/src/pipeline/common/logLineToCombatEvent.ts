import { pipe } from 'rxjs';
import { map } from 'rxjs/operators';

import { ArenaMatchEnd } from '../../actions/ArenaMatchEnd';
import { ArenaMatchStart } from '../../actions/ArenaMatchStart';
import { CombatAbsorbAction } from '../../actions/CombatAbsorbAction';
import { CombatAction } from '../../actions/CombatAction';
import { CombatAdvancedAction } from '../../actions/CombatAdvancedAction';
import { CombatExtraSpellAction } from '../../actions/CombatExtraSpellAction';
import { CombatHpUpdateAction } from '../../actions/CombatHpUpdateAction';
import { CombatantInfoAction } from '../../actions/CombatantInfoAction';
import { CombatEvent, ILogLine, LogEvent, WowVersion } from '../../types';

export const logLineToCombatEvent = (wowVersion: WowVersion) => {
  return pipe(
    map((logLine: ILogLine | string): CombatEvent | string => {
      if (typeof logLine === 'string') {
        return logLine;
      }

      try {
        switch (logLine.event) {
          case LogEvent.ARENA_MATCH_START:
            return new ArenaMatchStart(logLine);
          case LogEvent.ARENA_MATCH_END:
            return new ArenaMatchEnd(logLine);
          case LogEvent.COMBATANT_INFO:
            return new CombatantInfoAction(logLine);
          case LogEvent.SWING_DAMAGE:
          case LogEvent.RANGE_DAMAGE:
          case LogEvent.SPELL_DAMAGE:
          case LogEvent.SPELL_PERIODIC_DAMAGE:
          case LogEvent.SPELL_HEAL:
          case LogEvent.SPELL_PERIODIC_HEAL:
            return new CombatHpUpdateAction(logLine, wowVersion);
          case LogEvent.SPELL_ABSORBED:
            return new CombatAbsorbAction(logLine, wowVersion);
          case LogEvent.SPELL_AURA_APPLIED:
          case LogEvent.SPELL_AURA_APPLIED_DOSE:
          case LogEvent.SPELL_AURA_REFRESH:
          case LogEvent.SPELL_AURA_REMOVED:
          case LogEvent.SPELL_AURA_REMOVED_DOSE:
          case LogEvent.SPELL_AURA_BROKEN:
          case LogEvent.SPELL_AURA_BROKEN_SPELL:
          case LogEvent.SPELL_EXTRA_ATTACKS:
          case LogEvent.UNIT_DIED:
          case LogEvent.SPELL_CAST_START:
          case LogEvent.SPELL_CAST_FAILED:
          case LogEvent.SPELL_SUMMON:
            return new CombatAction(logLine);
          case LogEvent.SPELL_INTERRUPT:
          case LogEvent.SPELL_STOLEN:
          case LogEvent.SPELL_DISPEL:
          case LogEvent.SPELL_DISPEL_FAILED:
            return new CombatExtraSpellAction(logLine);
          case LogEvent.SPELL_CAST_SUCCESS:
          case LogEvent.SPELL_ENERGIZE:
          case LogEvent.SPELL_PERIODIC_ENERGIZE:
            return new CombatAdvancedAction(logLine, wowVersion);
          default:
            return logLine.raw;
        }
      } catch (e) {
        return logLine.raw;
      }
    }),
  );
};

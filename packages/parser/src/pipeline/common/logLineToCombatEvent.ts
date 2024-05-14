import { pipe } from 'rxjs';
import { map } from 'rxjs/operators';

import { ArenaMatchEnd } from '../../actions/ArenaMatchEnd';
import { ArenaMatchStart } from '../../actions/ArenaMatchStart';
import { CombatAbsorbAction } from '../../actions/CombatAbsorbAction';
import { CombatAction } from '../../actions/CombatAction';
import { CombatAdvancedAction } from '../../actions/CombatAdvancedAction';
import { CombatantInfoAction } from '../../actions/CombatantInfoAction';
import { CombatExtraSpellAction } from '../../actions/CombatExtraSpellAction';
import { CombatHpUpdateAction } from '../../actions/CombatHpUpdateAction';
import { CombatSupportAction } from '../../actions/CombatSupportAction';
import { PartyKill } from '../../actions/PartyKill';
import { SpellAuraBrokenSpell } from '../../actions/SpellAuraBrokenSpell';
import { ZoneChange } from '../../actions/ZoneChange';
import { logInfo, logTrace } from '../../logger';
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
          case LogEvent.SPELL_DAMAGE_SUPPORT:
          case LogEvent.SPELL_PERIODIC_DAMAGE_SUPPORT:
          case LogEvent.SPELL_HEAL_SUPPORT:
          case LogEvent.SPELL_PERIODIC_HEAL_SUPPORT:
          case LogEvent.RANGE_DAMAGE_SUPPORT:
          case LogEvent.SWING_DAMAGE_SUPPORT:
          case LogEvent.SWING_DAMAGE_LANDED_SUPPORT:
            return new CombatSupportAction(logLine, wowVersion);
          case LogEvent.SPELL_ABSORBED:
            return new CombatAbsorbAction(logLine, wowVersion);
          case LogEvent.SPELL_AURA_BROKEN_SPELL:
            return new SpellAuraBrokenSpell(logLine, wowVersion);
          case LogEvent.SPELL_AURA_APPLIED:
          case LogEvent.SPELL_AURA_APPLIED_DOSE:
          case LogEvent.SPELL_AURA_REFRESH:
          case LogEvent.SPELL_AURA_REMOVED:
          case LogEvent.SPELL_AURA_REMOVED_DOSE:
          case LogEvent.SPELL_AURA_BROKEN:
          case LogEvent.SPELL_EXTRA_ATTACKS:
          case LogEvent.UNIT_DIED:
          case LogEvent.SPELL_CAST_START:
          case LogEvent.SPELL_CAST_FAILED:
          case LogEvent.SPELL_SUMMON:
          case LogEvent.SWING_MISSED:
          case LogEvent.SPELL_MISSED:
          case LogEvent.SPELL_PERIODIC_MISSED:
          case LogEvent.RANGE_MISSED:
            return new CombatAction(logLine);
          case LogEvent.SPELL_INTERRUPT:
          case LogEvent.SPELL_STOLEN:
          case LogEvent.SPELL_DISPEL:
          case LogEvent.SPELL_DISPEL_FAILED:
            return new CombatExtraSpellAction(logLine);
          case LogEvent.SPELL_CAST_SUCCESS:
          case LogEvent.SPELL_ENERGIZE:
          case LogEvent.SPELL_PERIODIC_ENERGIZE:
            // case LogEvent.DAMAGE_SPLIT: // TODO: Support this eventually
            return new CombatAdvancedAction(logLine, wowVersion);
          case LogEvent.PARTY_KILL:
            return new PartyKill(logLine);
          case LogEvent.ZONE_CHANGE:
            return new ZoneChange(logLine);
          case LogEvent.SWING_DAMAGE_LANDED: // we should not process both this and SWING_DAMAGE
          default:
            logTrace(logLine.event);
            return logLine.raw;
        }
      } catch (e) {
        logInfo('Failed to parse');
        logInfo(e);
        return logLine.raw;
      }
    }),
  );
};

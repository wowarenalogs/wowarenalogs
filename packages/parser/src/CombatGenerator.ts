import _ from 'lodash';
import { v4 as uuidv4 } from 'uuid';

import { CombatAbsorbAction } from './actions/CombatAbsorbAction';
import { CombatAction } from './actions/CombatAction';
import { CombatAdvancedAction } from './actions/CombatAdvancedAction';
import { CombatHpUpdateAction } from './actions/CombatHpUpdateAction';
import { CombatSupportAction } from './actions/CombatSupportAction';
import { PartyKill } from './actions/PartyKill';
import { classMetadata } from './classMetadata';
import { CombatUnit } from './CombatUnit';
import { logTrace } from './logger';
import { CombatUnitClass, ICombatantMetadata, LogEvent, WowVersion } from './types';

const SPELL_ID_TO_CLASS_MAP = new Map<string, CombatUnitClass>(
  classMetadata.flatMap((cls) => {
    return cls.abilities.map((ability) => [ability.spellId, cls.unitClass]);
  }),
);

export class CombatGenerator {
  public id: string = uuidv4();
  public isWellFormed = false;
  public startTime = 0;
  public endTime = 0;
  public units: { [unitId: string]: CombatUnit } = {};
  public playerId = '';
  public playerTeamId = '';
  public hasAdvancedLogging = false;
  public rawLines: string[] = [];
  public linesNotParsedCount = 0;
  public events: (CombatAction | CombatAdvancedAction)[] = [];

  protected combatantMetadata: Map<string, ICombatantMetadata> = new Map<string, ICombatantMetadata>();

  protected inferredCombatantIds: Set<string> = new Set<string>();

  constructor(
    public readonly wowVersion: WowVersion,
    public readonly timezone: string,
  ) {}

  protected registerCombatant(id: string, combatantMetadata: ICombatantMetadata) {
    this.combatantMetadata.set(id, combatantMetadata);
  }

  protected parseEvent(srcUnit: CombatUnit, destUnit: CombatUnit, event: CombatAction | PartyKill) {
    switch (event.logLine.event) {
      case LogEvent.SPELL_DAMAGE_SUPPORT:
      case LogEvent.SPELL_PERIODIC_DAMAGE_SUPPORT:
      case LogEvent.RANGE_DAMAGE_SUPPORT:
      case LogEvent.SWING_DAMAGE_SUPPORT:
      case LogEvent.SWING_DAMAGE_LANDED_SUPPORT:
        {
          const supportAction = event as CombatSupportAction;
          srcUnit.supportDamageIn.push(supportAction);

          // [#sup1] This is a similar case to the SPELL_ABSORB note below
          // If the first event of the match is a support event and the support spell caster
          //  isn't in the units array yet we must add them first. HOWEVER
          //  for support events we don't have the unitName!

          // Due to this restriction we are currently skipping including any absorb events before the unit is ready

          if (this.units[supportAction.supportActorId]) {
            const supportCaster = this.units[supportAction.supportActorId];
            supportCaster.supportDamageOut.push(supportAction);
          }
        }
        break;
      case LogEvent.SPELL_HEAL_SUPPORT:
      case LogEvent.SPELL_PERIODIC_HEAL_SUPPORT:
        {
          const supportAction = event as CombatSupportAction;
          srcUnit.supportHealIn.push(supportAction);

          // Same case as [#sup1] above
          if (this.units[supportAction.supportActorId]) {
            const supportCaster = this.units[supportAction.supportActorId];
            supportCaster.supportHealOut.push(supportAction);
          }
        }
        break;
      case LogEvent.SPELL_ABSORBED:
        {
          const absorbAction = event as CombatAbsorbAction;
          // There is an edge case where the first spell of a match is a SPELL_ABSORBED
          // event and the unit that cast the shield isn't registered in the units array yet
          // In this case - add the unit to the list before attempting to push the event
          if (!this.units[absorbAction.shieldOwnerUnitId]) {
            this.units[absorbAction.shieldOwnerUnitId] = new CombatUnit(
              absorbAction.shieldOwnerUnitId,
              absorbAction.shieldOwnerUnitName,
            );
          }
          const shieldOwner = this.units[absorbAction.shieldOwnerUnitId];
          shieldOwner.absorbsOut.push(absorbAction);
          destUnit.absorbsIn.push(absorbAction);
          srcUnit.absorbsDamaged.push(absorbAction);
          srcUnit.damageOut.push(absorbAction);
        }
        break;
      case LogEvent.SWING_DAMAGE:
      case LogEvent.RANGE_DAMAGE:
      case LogEvent.SPELL_DAMAGE:
      case LogEvent.SPELL_PERIODIC_DAMAGE:
        {
          const damageAction = event as CombatHpUpdateAction;
          if (srcUnit.id !== destUnit.id) {
            srcUnit.damageOut.push(damageAction);
          }
          destUnit.damageIn.push(damageAction);
          if (damageAction.advanced) {
            const advancedActor = this.units[damageAction.advancedActorId];
            advancedActor?.advancedActions.push(damageAction);
            this.hasAdvancedLogging = true;

            if (damageAction.advancedOwnerId !== '0000000000000000') {
              advancedActor.proveOwner(damageAction.advancedOwnerId);
            }
          }
        }
        break;
      case LogEvent.SPELL_HEAL:
      case LogEvent.SPELL_PERIODIC_HEAL:
        {
          const healAction = event as CombatHpUpdateAction;
          srcUnit.healOut.push(healAction);
          destUnit.healIn.push(healAction);
          if (healAction.advanced) {
            const advancedActor = this.units[healAction.advancedActorId];
            advancedActor?.advancedActions.push(healAction);
            this.hasAdvancedLogging = true;

            if (healAction.advancedOwnerId !== '0000000000000000') {
              advancedActor.proveOwner(healAction.advancedOwnerId);
            }
          }
        }
        break;
      case LogEvent.SPELL_AURA_APPLIED:
      case LogEvent.SPELL_AURA_APPLIED_DOSE:
      case LogEvent.SPELL_AURA_REFRESH:
      case LogEvent.SPELL_AURA_REMOVED:
      case LogEvent.SPELL_AURA_REMOVED_DOSE:
      case LogEvent.SPELL_AURA_BROKEN:
      case LogEvent.SPELL_AURA_BROKEN_SPELL:
        if (event instanceof CombatAction) {
          destUnit.auraEvents.push(event);
        }
        break;
      case LogEvent.SPELL_INTERRUPT:
      case LogEvent.SPELL_STOLEN:
      case LogEvent.SPELL_DISPEL:
      case LogEvent.SPELL_DISPEL_FAILED:
      case LogEvent.SPELL_EXTRA_ATTACKS:
        if (event instanceof CombatAction) {
          srcUnit.actionOut.push(event);
          destUnit.actionIn.push(event);
        }
        break;
      case LogEvent.UNIT_DIED:
        if (
          event.logLine.parameters.length > 8 &&
          event.logLine.parameters[8] === 1 // 8 is unconsciousOnDeath in wowcombatlog
        ) {
          destUnit.consciousDeathRecords.push(event.logLine);
        } else {
          logTrace('UNIT_DIED', event.logLine.raw);
          destUnit.deathRecords.push(event.logLine);
        }
        break;
      case LogEvent.SPELL_CAST_SUCCESS:
        {
          const advancedAction = event as CombatAdvancedAction;
          if (advancedAction.advanced) {
            const advancedActor = this.units[advancedAction.advancedActorId];
            advancedActor?.advancedActions.push(advancedAction);
            this.hasAdvancedLogging = true;
          }
          srcUnit.spellCastEvents.push(advancedAction);

          if (this.wowVersion === 'classic' && advancedAction.spellId) {
            const unitClass = SPELL_ID_TO_CLASS_MAP.get(advancedAction.spellId);
            if (unitClass) {
              srcUnit.proveClass(unitClass);
            }
          }
        }
        break;
      case LogEvent.SPELL_CAST_START:
      case LogEvent.SPELL_CAST_FAILED:
        if (event instanceof CombatAction) {
          srcUnit.spellCastEvents.push(event);
        }
        break;
      case LogEvent.SPELL_SUMMON:
        if (event instanceof CombatAction) {
          srcUnit.actionOut.push(event);
        }
        destUnit.proveOwner(srcUnit.id);
        break;
    }
  }
}

import _ from 'lodash';
import { v4 as uuidv4 } from 'uuid';

import { CombatAbsorbAction } from './actions/CombatAbsorbAction';
import { CombatAbsorbSupportAction } from './actions/CombatAbsorbSupportAction';
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

const SUPPORT_PAIRING_WINDOW_MS = 10;
// Absorbs that only delay damage: Stretch Time, Time Dilation, Fel Armor
const DELAYED_DAMAGE_ABSORBS = new Set(['410355', '357170', '386124']);
// Fel Armor's delayed damage lands inside the attacker's later hits
const FEL_ARMOR = '386124';
const SWING_TWIN_WINDOW_MS = 250;

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

  private pendingSwings = new Map<string, CombatHpUpdateAction[]>();
  private lastSwingSweep = 0;
  private recentAbsorbs: CombatAbsorbAction[] = [];

  protected inferredCombatantIds: Set<string> = new Set<string>();

  constructor(
    public readonly wowVersion: WowVersion,
    public readonly timezone: string,
  ) {}

  // Melee is logged from both sides, but many pet swings only from the victim's; keep the victim's copy
  protected isSwingTwin(event: CombatAction) {
    const type = event.logLine.event;
    if (type !== LogEvent.SWING_DAMAGE && type !== LogEvent.SWING_DAMAGE_LANDED) {
      return false;
    }
    this.sweepSwings(event.timestamp);
    const swing = event as CombatHpUpdateAction;
    const baseAmount = swing.logLine.parameters[26 + (this.wowVersion === 'retail' ? 2 : -1)];
    const key = `${swing.srcUnitId}|${swing.destUnitId}|${baseAmount}`;
    const pending = this.pendingSwings.get(key) ?? [];
    const twinIndex = pending.findIndex(
      (p) => p.logLine.event !== type && swing.timestamp - p.timestamp <= SWING_TWIN_WINDOW_MS,
    );
    if (twinIndex < 0) {
      pending.push(swing);
      this.pendingSwings.set(key, pending);
      return false;
    }
    const [twin] = pending.splice(twinIndex, 1);
    if (!pending.length) {
      this.pendingSwings.delete(key);
    }
    if (type === LogEvent.SWING_DAMAGE) {
      return true;
    }
    this.removeSwing(twin);
    return false;
  }

  private sweepSwings(timestamp: number) {
    if (timestamp - this.lastSwingSweep < SWING_TWIN_WINDOW_MS) {
      return;
    }
    this.lastSwingSweep = timestamp;
    this.pendingSwings.forEach((pending, key) => {
      while (pending.length && timestamp - pending[0].timestamp > SWING_TWIN_WINDOW_MS) {
        pending.shift();
      }
      if (!pending.length) {
        this.pendingSwings.delete(key);
      }
    });
  }

  private removeSwing(swing: CombatHpUpdateAction) {
    const remove = (actions: CombatAction[] | undefined) => {
      const i = actions?.lastIndexOf(swing) ?? -1;
      if (i >= 0) {
        actions?.splice(i, 1);
      }
    };
    remove(this.events);
    remove(this.units[swing.srcUnitId]?.damageOut);
    remove(this.units[swing.destUnitId]?.damageIn);
  }

  protected registerCombatant(id: string, combatantMetadata: ICombatantMetadata) {
    this.combatantMetadata.set(id, combatantMetadata);
  }

  private reattributeSupporterHit(ally: CombatUnit, supporter: CombatUnit, supportAction: CombatSupportAction) {
    let moved = false;
    for (let i = ally.damageOut.length - 1; i >= 0; i--) {
      const action = ally.damageOut[i];
      if (action.timestamp < supportAction.timestamp - SUPPORT_PAIRING_WINDOW_MS) {
        break;
      }
      if (action.spellId === supportAction.spellId && action.destUnitId === supportAction.destUnitId) {
        ally.damageOut.splice(i, 1);
        action.creditedUnitId = supporter.id;
        supporter.damageOut.push(action);
        moved = true;
      }
    }
    return moved;
  }

  private pairSupport(actions: (CombatHpUpdateAction | CombatAbsorbAction)[], supportAction: CombatSupportAction) {
    if (supportAction.logLine.event.startsWith('SWING_')) {
      supportAction.supportedSpell = { spellId: null, spellName: null };
      return;
    }
    for (let i = actions.length - 1; i >= 0; i--) {
      const action = actions[i];
      if (action.timestamp < supportAction.timestamp - SUPPORT_PAIRING_WINDOW_MS) {
        return;
      }
      if (action.destUnitId === supportAction.destUnitId) {
        supportAction.supportedSpell = { spellId: action.spellId, spellName: action.spellName };
        return;
      }
    }
  }

  private findSupportedAbsorb(supportAction: CombatAbsorbSupportAction) {
    for (let i = this.recentAbsorbs.length - 1; i >= 0; i--) {
      const absorb = this.recentAbsorbs[i];
      if (absorb.timestamp < supportAction.timestamp - SUPPORT_PAIRING_WINDOW_MS) {
        return null;
      }
      if (
        absorb.srcUnitId === supportAction.srcUnitId &&
        absorb.destUnitId === supportAction.destUnitId &&
        absorb.spellId === supportAction.spellId &&
        absorb.shieldOwnerUnitId === supportAction.shieldOwnerUnitId
      ) {
        return absorb;
      }
    }
    return null;
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

          // [#sup1] This is a similar case to the SPELL_ABSORB note below
          // If the first event of the match is a support event and the support spell caster
          //  isn't in the units array yet we must add them first. HOWEVER
          //  for support events we don't have the unitName!

          // Due to this restriction we are currently skipping including any absorb events before the unit is ready
          const supporter = this.units[supportAction.supportActorId];
          if (!supporter || supporter.id === srcUnit.id) {
            break;
          }

          // Procs like Bombardments are logged under the ally who triggered them; the whole hit is the supporter's
          if (this.reattributeSupporterHit(srcUnit, supporter, supportAction)) {
            break;
          }

          this.pairSupport(srcUnit.damageOut, supportAction);
          srcUnit.supportDamageIn.push(supportAction);
          supporter.supportDamageOut.push(supportAction);
        }
        break;
      case LogEvent.SPELL_HEAL_SUPPORT:
      case LogEvent.SPELL_PERIODIC_HEAL_SUPPORT:
        {
          const supportAction = event as CombatSupportAction;

          // Same case as [#sup1] above
          const supporter = this.units[supportAction.supportActorId];
          if (!supporter || supporter.id === srcUnit.id) {
            break;
          }

          this.pairSupport(srcUnit.healOut, supportAction);
          srcUnit.supportHealIn.push(supportAction);
          supporter.supportHealOut.push(supportAction);
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
          while (
            this.recentAbsorbs.length &&
            this.recentAbsorbs[0].timestamp < absorbAction.timestamp - SUPPORT_PAIRING_WINDOW_MS
          ) {
            this.recentAbsorbs.shift();
          }
          this.recentAbsorbs.push(absorbAction);
          if (!DELAYED_DAMAGE_ABSORBS.has(absorbAction.shieldSpellId)) {
            shieldOwner.absorbsOut.push(absorbAction);
          }
          destUnit.absorbsIn.push(absorbAction);
          srcUnit.absorbsDamaged.push(absorbAction);
          if (srcUnit.id !== destUnit.id && absorbAction.shieldSpellId !== FEL_ARMOR) {
            srcUnit.damageOut.push(absorbAction);
          }
        }
        break;
      case LogEvent.SPELL_ABSORBED_SUPPORT:
        {
          const supportAction = event as CombatAbsorbSupportAction;
          const shieldOwner = this.units[supportAction.shieldOwnerUnitId];
          const supporter = this.units[supportAction.supportActorId];
          if (!shieldOwner || !supporter || supporter.id === shieldOwner.id) {
            break;
          }
          const absorb = this.findSupportedAbsorb(supportAction);
          // The shield this supports isn't counted, so there's nothing to share
          if (absorb && DELAYED_DAMAGE_ABSORBS.has(absorb.shieldSpellId)) {
            break;
          }
          if (absorb) {
            supportAction.supportedShieldSpellId = absorb.shieldSpellId;
            supportAction.supportedShieldSpellName = absorb.shieldSpellName;
          }

          shieldOwner.supportAbsorbIn.push(supportAction);
          supporter.supportAbsorbOut.push(supportAction);
        }
        break;
      case LogEvent.SPELL_HEAL_ABSORBED:
        {
          // src applied the heal absorb, dest had a heal denied. See CombatAbsorbAction
          // for how the remaining fields differ from SPELL_ABSORBED.
          const absorbAction = event as CombatAbsorbAction;
          srcUnit.healAbsorbsOut.push(absorbAction);
          destUnit.healAbsorbsIn.push(absorbAction);
        }
        break;
      case LogEvent.SWING_DAMAGE:
      case LogEvent.SWING_DAMAGE_LANDED:
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

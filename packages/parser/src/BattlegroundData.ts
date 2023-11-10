import _ from 'lodash';
import { v4 as uuidv4 } from 'uuid';

import { ArenaMatchEnd } from './actions/ArenaMatchEnd';
import { ArenaMatchStart } from './actions/ArenaMatchStart';
import { CombatAbsorbAction } from './actions/CombatAbsorbAction';
import { CombatAction } from './actions/CombatAction';
import { CombatAdvancedAction } from './actions/CombatAdvancedAction';
import { CombatantInfoAction } from './actions/CombatantInfoAction';
import { CombatHpUpdateAction } from './actions/CombatHpUpdateAction';
import { CombatSupportAction } from './actions/CombatSupportAction';
import { ZoneChange } from './actions/ZoneChange';
import { classMetadata } from './classMetadata';
import { CombatUnit } from './CombatUnit';
import { logInfo } from './logger';
import {
  CombatEvent,
  CombatUnitAffiliation,
  CombatUnitClass,
  CombatUnitReaction,
  CombatUnitSpec,
  CombatUnitType,
  ICombatantMetadata,
  LogEvent,
  WowVersion,
} from './types';
import { getUnitReaction, getUnitType } from './utils';

const SPELL_ID_TO_CLASS_MAP = new Map<string, CombatUnitClass>(
  classMetadata.flatMap((cls) => {
    return cls.abilities.map((ability) => [ability.spellId, cls.unitClass]);
  }),
);

export class BattlegroundData {
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

  private combatantMetadata: Map<string, ICombatantMetadata> = new Map<string, ICombatantMetadata>();

  private inferredCombatantIds: Set<string> = new Set<string>();

  constructor(
    public readonly wowVersion: WowVersion,
    public readonly timezone: string,
  ) {}

  public readEvent(event: CombatEvent) {
    if (this.startTime === 0) {
      this.startTime = event.timestamp;
    }
    this.endTime = event.timestamp;

    if (event instanceof ZoneChange) {
      return;
    }

    if (event.logLine.parameters.length < 8) {
      return;
    }

    if (event instanceof CombatAction) {
      this.events.push(event);
    }

    if (event instanceof ArenaMatchEnd) {
      throw new Error('This is not possible but needed for TS');
    }
    if (event instanceof ArenaMatchStart) {
      throw new Error('This is not possible but needed for TS');
    }
    if (event instanceof CombatantInfoAction) {
      throw new Error('This is not possible but needed for TS');
    }

    const srcGUID = event.srcUnitId;
    const srcName = event.srcUnitName;
    const srcFlag = event.srcUnitFlags;

    const destGUID = event.destUnitId;
    const destName = event.destUnitName;
    const destFlag = event.destUnitFlags;

    if (!this.units[srcGUID]) {
      this.units[srcGUID] = new CombatUnit(srcGUID, srcName);
    }
    if (!this.units[destGUID]) {
      this.units[destGUID] = new CombatUnit(destGUID, destName);
    }

    const srcUnit = this.units[srcGUID];
    const destUnit = this.units[destGUID];
    if (!srcUnit || !destUnit) {
      throw new Error('failed to parse source unit or dest unit from the log line');
    }
    srcUnit.endTime = event.timestamp;
    destUnit.endTime = event.timestamp;

    srcUnit.proveType(getUnitType(srcFlag));
    destUnit.proveType(getUnitType(destFlag));

    srcUnit.proveReaction(getUnitReaction(srcFlag));
    destUnit.proveReaction(getUnitReaction(destFlag));

    const isSignificantEvent =
      event.srcUnitId !== event.destUnitId &&
      getUnitReaction(event.srcUnitFlags) !== getUnitReaction(event.destUnitFlags) &&
      getUnitType(event.srcUnitFlags) === CombatUnitType.Player &&
      getUnitType(event.destUnitFlags) === CombatUnitType.Player;

    if (isSignificantEvent) {
      this.inferredCombatantIds.add(event.srcUnitId);
      this.inferredCombatantIds.add(event.destUnitId);
    }

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
          if (srcGUID !== destGUID) {
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
        srcUnit.actionOut.push(event.logLine);
        destUnit.actionIn.push(event.logLine);
        break;
      case LogEvent.UNIT_DIED:
        if (
          event.logLine.parameters.length > 8 &&
          event.logLine.parameters[8] === 1 // 8 is unconsciousOnDeath in wowcombatlog
        ) {
          destUnit.consciousDeathRecords.push(event.logLine);
        } else {
          logInfo('UNIT_DIED', event.logLine.raw);
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
        srcUnit.actionOut.push(event.logLine);
        destUnit.proveOwner(srcUnit.id);
        break;
    }
  }

  public registerCombatant(id: string, combatantMetadata: ICombatantMetadata) {
    this.combatantMetadata.set(id, combatantMetadata);
  }

  private inferMatchMetadata() {
    this.playerTeamId = '0'; // for Classic logs, we always use 0 as the owner's team

    this.inferredCombatantIds.forEach((id) => {
      // eslint-disable-next-line no-console
      const unit = this.units[id];
      const metadata = {
        spec: unit.spec,
        class: unit.class,
        info: {
          teamId: unit.reaction === CombatUnitReaction.Friendly ? '0' : '1',
          strength: 0,
          agility: 0,
          stamina: 0,
          intelligence: 0,
          dodge: 0,
          parry: 0,
          block: 0,
          critMelee: 0,
          critRanged: 0,
          critSpell: 0,
          speed: 0,
          lifesteal: 0,
          hasteMelee: 0,
          hasteRanged: 0,
          hasteSpell: 0,
          avoidance: 0,
          mastery: 0,
          versatilityDamgeDone: 0,
          versatilityHealingDone: 0,
          versatilityDamageTaken: 0,
          armor: 0,
          specId: '',
          talents: [],
          pvpTalents: [],
          equipment: [],
          interestingAurasJSON: '',
          item28: 0,
          item29: 0,
          personalRating: 0,
          highestPvpTier: 0,
        },
      };
      unit.info = metadata.info;
      this.combatantMetadata.set(id, metadata);
    });
  }

  public end(wasTimeout?: boolean) {
    _.forEach(this.units, (unit) => {
      unit.endActivity();
      if (this.combatantMetadata.has(unit.id)) {
        const metadata = this.combatantMetadata.get(unit.id);
        if (metadata) {
          unit.info = metadata?.info;
        }
        unit.proveClass(metadata?.class || CombatUnitClass.None);
        unit.proveSpec(metadata?.spec || CombatUnitSpec.None);
      }
      unit.end();
    });

    this.inferMatchMetadata();

    // HACK: Mark players with participationCount<5 spell cast events as NPCs
    // this is due to the insane amount of noise that will be in these logs from tracking by zone change
    // the ZONE_CHANGED event fires at the *end* of the entire loading cycle for a new zone so you get lots of aura updates first
    _.forEach(this.units, (unit) => {
      const participationCount = unit.spellCastEvents.length + unit.damageOut.length + unit.healOut.length;
      if (participationCount < 5) {
        unit.type = CombatUnitType.NPC;
      }
    });

    // merge pet output activities into their owners
    _.forEach(this.units, (unit) => {
      if (unit.type !== CombatUnitType.Player && unit.ownerId.length) {
        const owner = this.units[unit.ownerId];
        if (!owner) {
          return;
        }

        owner.damageOut = owner.damageOut.concat(unit.damageOut).sort((a, b) => a.timestamp - b.timestamp);

        owner.supportDamageIn = owner.supportDamageIn
          .concat(unit.supportDamageIn)
          .sort((a, b) => a.timestamp - b.timestamp);

        owner.absorbsOut = owner.absorbsOut.concat(unit.absorbsOut).sort((a, b) => a.timestamp - b.timestamp);

        owner.healOut = owner.healOut.concat(unit.healOut).sort((a, b) => a.timestamp - b.timestamp);

        owner.actionOut = owner.actionOut.concat(unit.actionOut).sort((a, b) => a.timestamp - b.timestamp);
      }
    });

    // units are finalized, check playerTeam info
    _.forEach(this.units, (unit) => {
      const metadata = this.combatantMetadata.get(unit.id);
      if (metadata) {
        if (unit.reaction === CombatUnitReaction.Friendly) {
          this.playerTeamId = metadata.info.teamId;
        }
      }
    });

    // a valid arena combat should have at least two friendly units and two hostile units
    const playerUnits = Array.from(_.values(this.units)).filter((unit) => unit.type === CombatUnitType.Player);
    const deadPlayerCount = playerUnits.filter((p) => p.deathRecords.length > 0).length;

    const recordingPlayer = playerUnits.find((p) => p.affiliation === CombatUnitAffiliation.Mine);

    this.playerId = recordingPlayer?.id || '';

    if (
      playerUnits.length >= this.combatantMetadata.size &&
      deadPlayerCount > 0 &&
      !wasTimeout &&
      deadPlayerCount < this.combatantMetadata.size
    ) {
      this.isWellFormed = true;
    }
    // Debugging for malformed matches in tests
    else {
      logInfo('Malformed match report');
      logInfo('unitLength >=? combatMetadata', playerUnits.length, this.combatantMetadata.size);
      logInfo('deadPlayerCount', deadPlayerCount);
      logInfo('wasTimeout', wasTimeout);
      logInfo('deadPlayerCount < combatMetadata', deadPlayerCount < this.combatantMetadata.size);
    }
  }
}

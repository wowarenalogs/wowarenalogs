import _ from 'lodash';

import { ArenaMatchEnd } from './actions/ArenaMatchEnd';
import { ArenaMatchStart } from './actions/ArenaMatchStart';
import { CombatAction } from './actions/CombatAction';
import { CombatantInfoAction } from './actions/CombatantInfoAction';
import { ZoneChange } from './actions/ZoneChange';
import { CombatGenerator } from './CombatGenerator';
import { CombatUnit } from './CombatUnit';
import { logInfo } from './logger';
import {
  CombatEvent,
  CombatUnitAffiliation,
  CombatUnitClass,
  CombatUnitReaction,
  CombatUnitSpec,
  CombatUnitType,
  WowVersion,
} from './types';
import { getUnitReaction, getUnitType } from './utils';

export class BattlegroundData extends CombatGenerator {
  constructor(
    public readonly wowVersion: WowVersion,
    public readonly timezone: string,
  ) {
    super(wowVersion, timezone);
  }

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
      throw new Error('This is not possible but needed for TS (ArenaMatchEnd)');
    }
    if (event instanceof ArenaMatchStart) {
      throw new Error('This is not possible but needed for TS (ArenaMatchStart)');
    }
    if (event instanceof CombatantInfoAction) {
      throw new Error('This is not possible but needed for TS (CombatantInfoAction)');
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

    this.parseEvent(srcUnit, destUnit, event);
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
          item12: 0,
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

/* eslint-disable no-fallthrough */
import _ from 'lodash';

import { ArenaMatchEnd, ArenaMatchEndInfo } from './actions/ArenaMatchEnd';
import { ArenaMatchStart, ArenaMatchStartInfo } from './actions/ArenaMatchStart';
import { CombatAction } from './actions/CombatAction';
import { CombatAdvancedAction } from './actions/CombatAdvancedAction';
import { CombatantInfoAction } from './actions/CombatantInfoAction';
import { ZoneChange, ZoneChangeInfo } from './actions/ZoneChange';
import { CombatGenerator } from './CombatGenerator';
import { CombatUnit, ICombatUnit } from './CombatUnit';
import { logInfo } from './logger';
import {
  CombatEvent,
  CombatResult,
  CombatUnitAffiliation,
  CombatUnitClass,
  CombatUnitReaction,
  CombatUnitSpec,
  CombatUnitType,
  ILogLine,
  WowVersion,
} from './types';
import { getUnitReaction, getUnitType } from './utils';

/**
 * Describes an activity that has a start/end that can be determined from the game's combat log
 */
export interface IActivityStarted {
  dataType: 'ActivityStarted';
  arenaMatchStartInfo?: ArenaMatchStartInfo;
  bgZoneChange?: ZoneChangeInfo;
}

/**
 * Generic to hold any battleground activity
 * Currently it is unclear how to determine if a bg is ranked or unranked or blitz
 */
export interface IBattlegroundCombat {
  dataType: 'BattlegroundCombat';
  id: string;
  wowVersion: WowVersion;
  timezone: string;
  zoneInEvent: ZoneChangeInfo;
  zoneOutEvent: ZoneChangeInfo;
  units: { [unitId: string]: ICombatUnit };
  events: (CombatAction | CombatAdvancedAction)[];
  rawLines: string[];
  startTime: number;
  endTime: number;
}

/**
 * Fields that describe a 2v2 or 3v3 conflict between players
 * with a conclusive end as observed by one of the players in the match
 */
export interface IArenaCombat {
  id: string;
  wowVersion: WowVersion;
  /**
   * The timezone the parser interpreted the log file's timestamps as being in
   *
   * Could have been user provided or guessed using moment.tz.guess
   */
  timezone: string;

  /**
   * Marker to discriminate types of combats into shuffle rounds or arena matches
   */
  dataType: 'ShuffleRound' | 'ArenaMatch';

  /**
   * Information decoded from ARENA_MATCH_START
   */
  startInfo: ArenaMatchStartInfo;

  /**
   * All units that had log events during the match, includes players and pets
   */
  units: { [unitId: string]: ICombatUnit };
  /**
   * Parsed events
   */
  events: (CombatAction | CombatAdvancedAction)[];

  /**
   * Raw log lines of the underlying segment
   */
  rawLines: string[];
  /**
   * Count of lines the combat log parser could not turn into higher level objects
   */
  linesNotParsedCount: number;
  /**
   * Start time of the round, based on ARENA_MATCH_START
   */
  startTime: number;
  /**
   * End time of the round, based on player death inspection
   */
  endTime: number;

  /**
   * Id of player who recorded the match
   * Based on https://wowpedia.fandom.com/wiki/UnitFlag
   * COMBATLOG_OBJECT_AFFILIATION_MINE
   */
  playerId: string;

  /**
   * Team of player who recorded the match
   * Based on https://wowpedia.fandom.com/wiki/UnitFlag
   * COMBATLOG_OBJECT_REACTION_FRIENDLY
   */
  playerTeamId: string;

  /**
   * Result of the match from the perspective of the recorder's team
   *   Based on unit deaths for shuffles
   *   Based on ARENA_MATCH_END event for regular arena matches
   */
  result: CombatResult;

  /**
   * Duration of round or match - calculated from death timing or
   * based on ARENA_MATCH_END if available
   *
   * * __ShuffleMatch__: the duration of the entire match
   *
   * * __ArenaMatch__: the duration of the entire match
   *
   * * __ShuffleRound__: the duration of the round
   *
   */
  durationInSeconds: number;

  /**
   * Id of team who won, inferred from player death
   */
  winningTeamId: string;

  /**
   * Flag based on combat log data observed, an option in WoW's advanced settings
   * Required to have position data in the logs
   */
  hasAdvancedLogging: boolean;

  /**
   * Rating for team of player who recorded the match, according to ARENA_MATCH_END
   *
   * __Will not be available on locally recorded shuffle rounds 0-4__
   */
  playerTeamRating?: number;
}

/*
   Interface for solo shuffle rounds

   We can detect when we need this at the first event (_START) using "Rated Solo Shuffle" and "Solo Shuffle"
   strings in the bracket column
*/
export interface IShuffleRound extends IArenaCombat {
  dataType: 'ShuffleRound';

  /**
   * Combatant whose death caused the round to end
   */
  killedUnitId: string; //

  /**
   * Scoreboard at the end of the round
   */
  scoreboard: { unitId: string; wins: number }[];

  /**
   * Round number of the shulffe round, 0-5
   */
  sequenceNumber: number;

  /**
   * Information decoded from ARENA_MATCH_END
   * This data will be unavailable for solo shuffle rounds that are recorded locally
   * However - once the match ends the DTO will contain the endInfo object copied from
   * the end of the match
   *
   * __Will not be available on locally recorded shuffles__
   */
  shuffleMatchEndInfo?: ArenaMatchEndInfo;

  /**
   * Results of the match according to ARENA_MATCH_END
   *
   * __Will not be available on locally recorded shuffles__
   */
  shuffleMatchResult?: CombatResult;
}

/**
 * Interface for ranked or skirmish 2v2 or 3v3 matches
 */
export interface IArenaMatch extends IArenaCombat {
  dataType: 'ArenaMatch';
  endInfo: ArenaMatchEndInfo;
}

/**
 * Union type for IArenaMatch and IShuffleRound.
 */
export type AtomicArenaCombat = IArenaMatch | IShuffleRound;

/**
 * Interface to hold all 6 rounds of a shuffle and have more details about the match's overall end
 */
export interface IShuffleMatch {
  wowVersion: WowVersion;

  dataType: 'ShuffleMatch';
  id: string;
  startTime: number;
  endTime: number;

  /**
   * The timezone the parser interpreted the log file's timestamps as being in
   *
   * Could have been user provided or guessed using moment.tz.guess
   */
  timezone: string;

  /**
   * Result as reported by ARENA_MATCH_END
   */
  result: CombatResult;

  /**
   * Information decoded from ARENA_MATCH_START for the first round
   */
  startInfo: ArenaMatchStartInfo;
  /**
   * Information decoded from ARENA_MATCH_END for the last round
   */
  endInfo: ArenaMatchEndInfo;

  /**
   * Duration of round or match - calculated from death timing or
   * based on ARENA_MATCH_END if available
   *
   * * __ShuffleMatch__: the duration of the entire match
   *
   * * __ArenaMatch__: the duration of the entire match
   *
   * * __ShuffleRound__: the duration of the round
   *
   */
  durationInSeconds: number;

  // Store information about each round individually
  rounds: IShuffleRound[];
}

export interface IMalformedCombatData {
  wowVersion: WowVersion;
  dataType: 'MalformedCombat';
  id: string;
  isWellFormed: false;
  startTime: number;
  rawLines: string[];
  linesNotParsedCount: number;
}

export class CombatData extends CombatGenerator {
  public endInfo: ArenaMatchEndInfo | undefined = undefined;
  public startInfo: ArenaMatchStartInfo | undefined = undefined;
  public playerTeamRating = 0;
  public result: CombatResult = CombatResult.Unknown;

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

    if (event instanceof ArenaMatchStart) {
      this.startInfo = {
        timestamp: event.timestamp,
        zoneId: event.zoneId,
        item1: event.item1,
        bracket: event.bracket,
        isRanked: event.isRanked,
      };
      return;
    }
    if (event instanceof ArenaMatchEnd) {
      this.endInfo = {
        timestamp: event.timestamp,
        winningTeamId: event.winningTeamId,
        matchDurationInSeconds: event.matchDurationInSeconds,
        team0MMR: event.team0MMR,
        team1MMR: event.team1MMR,
      };
      return;
    }
    if (event instanceof ZoneChange) {
      return;
    }

    if (event.logLine.parameters.length < 8) {
      return;
    }

    if (event instanceof CombatAction) {
      this.events.push(event);
    }

    if (event instanceof CombatantInfoAction) {
      const unitId: string = event.logLine.parameters[0].toString();
      const specId: string = event.info.specId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((Object as any).values(CombatUnitSpec).indexOf(specId) >= 0) {
        const spec = specId as CombatUnitSpec;
        let unitClass = CombatUnitClass.None;
        switch (spec) {
          case CombatUnitSpec.DeathKnight_Blood:
          case CombatUnitSpec.DeathKnight_Frost:
          case CombatUnitSpec.DeathKnight_Unholy:
            unitClass = CombatUnitClass.DeathKnight;
            break;
          case CombatUnitSpec.DemonHunter_Havoc:
          case CombatUnitSpec.DemonHunter_Vengeance:
          case CombatUnitSpec.DemonHunter_Devourer:
            unitClass = CombatUnitClass.DemonHunter;
            break;
          case CombatUnitSpec.Druid_Balance:
          case CombatUnitSpec.Druid_Feral:
          case CombatUnitSpec.Druid_Guardian:
          case CombatUnitSpec.Druid_Restoration:
            unitClass = CombatUnitClass.Druid;
            break;
          case CombatUnitSpec.Hunter_BeastMastery:
          case CombatUnitSpec.Hunter_Marksmanship:
          case CombatUnitSpec.Hunter_Survival:
            unitClass = CombatUnitClass.Hunter;
            break;
          case CombatUnitSpec.Mage_Arcane:
          case CombatUnitSpec.Mage_Fire:
          case CombatUnitSpec.Mage_Frost:
            unitClass = CombatUnitClass.Mage;
            break;
          case CombatUnitSpec.Monk_BrewMaster:
          case CombatUnitSpec.Monk_Windwalker:
          case CombatUnitSpec.Monk_Mistweaver:
            unitClass = CombatUnitClass.Monk;
            break;
          case CombatUnitSpec.Paladin_Holy:
          case CombatUnitSpec.Paladin_Protection:
          case CombatUnitSpec.Paladin_Retribution:
            unitClass = CombatUnitClass.Paladin;
            break;
          case CombatUnitSpec.Priest_Discipline:
          case CombatUnitSpec.Priest_Holy:
          case CombatUnitSpec.Priest_Shadow:
            unitClass = CombatUnitClass.Priest;
            break;
          case CombatUnitSpec.Rogue_Assassination:
          case CombatUnitSpec.Rogue_Outlaw:
          case CombatUnitSpec.Rogue_Subtlety:
            unitClass = CombatUnitClass.Rogue;
            break;
          case CombatUnitSpec.Shaman_Elemental:
          case CombatUnitSpec.Shaman_Enhancement:
          case CombatUnitSpec.Shaman_Restoration:
            unitClass = CombatUnitClass.Shaman;
            break;
          case CombatUnitSpec.Warlock_Affliction:
          case CombatUnitSpec.Warlock_Demonology:
          case CombatUnitSpec.Warlock_Destruction:
            unitClass = CombatUnitClass.Warlock;
            break;
          case CombatUnitSpec.Warrior_Arms:
          case CombatUnitSpec.Warrior_Fury:
          case CombatUnitSpec.Warrior_Protection:
            unitClass = CombatUnitClass.Warrior;
            break;
          case CombatUnitSpec.Evoker_Devastation:
          case CombatUnitSpec.Evoker_Preservation:
          case CombatUnitSpec.Evoker_Augmentation:
            unitClass = CombatUnitClass.Evoker;
            break;
        }
        this.registerCombatant(unitId, {
          spec,
          class: unitClass,
          info: event.info,
        });
      }
      return;
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

    if (this.wowVersion === 'classic') {
      // We cannot currently tell known combatants at the start of the arena because
      // arena preparation buff is not showing up in combat logs. So we just record
      // all cambatants. this is not ideal because it could include other
      // combatants (some other events arrive before ZONE_CHANGE involving players in the loading map).
      // This is mitigated by parser trimming the events until the last death event,
      // it remains to be seen if we could finish the arena and get another UNIT_DIED
      // event (from a player in the loading map) before the ZONE_CHANGE event.
      const isSignificantEvent =
        event.srcUnitId !== event.destUnitId &&
        getUnitReaction(event.srcUnitFlags) !== getUnitReaction(event.destUnitFlags) &&
        getUnitType(event.srcUnitFlags) === CombatUnitType.Player &&
        getUnitType(event.destUnitFlags) === CombatUnitType.Player;

      if (isSignificantEvent) {
        this.inferredCombatantIds.add(event.srcUnitId);
        this.inferredCombatantIds.add(event.destUnitId);
      }
    }

    this.parseEvent(srcUnit, destUnit, event);
  }

  private inferMatchMetadata() {
    this.playerTeamId = '0'; // for Classic logs, we always use 0 as the owner's team
    this.playerTeamRating = 0;

    this.startInfo = {
      timestamp: this.startTime,
      bracket: '',
      isRanked: true,
      zoneId: '',
      item1: '',
    };

    const allDeaths = Object.values(this.units)
      .filter((u) => u.type === CombatUnitType.Player && u.deathRecords.length > 0)
      .flatMap((u) => u.deathRecords)
      .sort((a, b) => a.timestamp - b.timestamp);
    const lastDeath = allDeaths.length ? new CombatAction(_.last(allDeaths) as ILogLine) : null;
    this.endInfo = {
      winningTeamId: lastDeath
        ? getUnitReaction(lastDeath.destUnitFlags) === CombatUnitReaction.Friendly
          ? '1'
          : '0'
        : '0',
      matchDurationInSeconds: (this.endTime - this.startTime) / 1000,
      team0MMR: 0,
      team1MMR: 0,
      timestamp: this.endTime,
    };

    this.inferredCombatantIds.forEach((id) => {
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
          item9: 0,
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

    // In very rare circumstances, the combat log will include a player that's not actually in the match
    // this is referred to as the outsider bug
    // See test/testlogs/test_outside_bug.txt for an example log
    // To resolve it we will inspect the units of the match and any 'Player' units who weren't represented
    // in the COMBATANT_INFO events are downgraded to NPCs ;)
    if (this.wowVersion === 'retail') {
      _.forEach(this.units, (unit) => {
        if (unit.type === CombatUnitType.Player) {
          if (!unit.info) {
            unit.type = CombatUnitType.NPC;
          }
        }
      });
    }

    if (this.wowVersion === 'classic') {
      this.inferMatchMetadata();
    }

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

    if (this.playerTeamId) {
      this.playerTeamRating = this.playerTeamId === '0' ? this.endInfo?.team0MMR || 0 : this.endInfo?.team1MMR || 0;
    }

    this.playerId = recordingPlayer?.id || '';

    if (this.endInfo) {
      if (this.endInfo.winningTeamId === this.playerTeamId) {
        this.result = CombatResult.Win;
      } else {
        this.result = CombatResult.Lose;
      }
    } else {
      this.result = CombatResult.Unknown;
    }

    if (
      playerUnits.length >= this.combatantMetadata.size &&
      deadPlayerCount > 0 &&
      !wasTimeout &&
      this.startInfo &&
      this.endInfo &&
      deadPlayerCount < this.combatantMetadata.size &&
      (this.result === CombatResult.Win || this.result === CombatResult.Lose)
    ) {
      this.isWellFormed = true;
    }
    // Debugging for malformed matches in tests
    else {
      logInfo('Malformed match report');
      logInfo('unitLength >=? combatMetadata', playerUnits.length, this.combatantMetadata.size);
      logInfo('deadPlayerCount', deadPlayerCount);
      logInfo('wasTimeout', wasTimeout);
      logInfo('has startInfo', !!this.startInfo);
      logInfo('has endInfo', !!this.endInfo);
      logInfo('deadPlayerCount < combatMetadata', deadPlayerCount < this.combatantMetadata.size);
      logInfo('result type valid', this.result === CombatResult.Win || this.result === CombatResult.Lose);
    }
  }
}

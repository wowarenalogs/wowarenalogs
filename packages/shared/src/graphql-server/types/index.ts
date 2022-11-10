import { CombatantInfo, IArenaMatch, ICombatUnit, IShuffleRound } from '@wowarenalogs/parser';
import { gql } from 'apollo-server-micro';

import { CombatDataStub } from '../../graphql/__generated__/graphql';

export enum UserSubscriptionTier {
  Common = 'Common',
  Rare = 'Rare',
}

export interface User {
  id: string;
  battlenetId: string | null;
  battletag: string | null;
  referrer: string | null;
  subscriptionTier: UserSubscriptionTier;
  tags: string[];
}

export interface ApolloContext {
  user: User | null;
}

/*
  Stub classes should be carefully edited to reflect their
  non-stub versions cleanly. If fields are removed in the definition
  of a stub from the base, leave them as commented out here.
*/
/**
 * Stub of CombatantInfo for cloud storage
 *
 * Missing fields as of 11/10/2022:
 * * strength: number;
 * * agility: number;
 * * stamina: number;
 * * intelligence: number;
 * * dodge: number;
 * * parry: number;
 * * block: number;
 * * critMelee: number;
 * * critRanged: number;
 * * critSpell: number;
 * * speed: number;
 * * lifesteal: number;
 * * hasteMelee: number;
 * * hasteRanged: number;
 * * hasteSpell: number;
 * * avoidance: number;
 * * mastery: number;
 * * versatilityDamgeDone: number;
 * * versatilityHealingDone: number;
 * * versatilityDamageTaken: number;
 * * armor: number;
 * * equipment: EquippedItem[];
 * * interestingAurasJSON: string;
 * * item28: number;
 * * item29: number;
 */
export interface ICombatantInfoStub
  extends Pick<CombatantInfo, 'teamId' | 'specId' | 'talents' | 'pvpTalents' | 'personalRating' | 'highestPvpTier'> {}

/**
 * Stub of ICombatUnit for cloud storage
 *
 * Missing fields as of 11/10/2022:
 * * isWellFormed: boolean;
 * * damageIn: CombatHpUpdateAction[];
 * * damageOut: CombatHpUpdateAction[];
 * * healIn: CombatHpUpdateAction[];
 * * healOut: CombatHpUpdateAction[];
 * * absorbsIn: CombatAbsorbAction[];
 * * absorbsOut: CombatAbsorbAction[];
 * * absorbsDamaged: CombatAbsorbAction[];
 * * actionIn: ILogLine[];
 * * actionOut: ILogLine[];
 * * auraEvents: CombatAction[];
 * * spellCastEvents: CombatAction[];
 * * deathRecords: ILogLine[];
 * * consciousDeathRecords: ILogLine[];
 * * advancedActions: CombatAdvancedAction[];
 */
export interface ICombatUnitStub
  extends Pick<ICombatUnit, 'id' | 'name' | 'reaction' | 'affiliation' | 'type' | 'class' | 'spec'> {
  info: ICombatantInfoStub;
}

interface IArenaMatchStub extends Omit<IArenaMatch, 'units' | 'events' | 'rawLines'> {}
interface IShuffleRoundStub extends Omit<IShuffleRound, 'units' | 'events' | 'rawLines'> {}

interface IUnitsStub {
  /**
   * A copy of the units array from a parsed log output with
   * some fields removed to save space when stored in the cloud
   *
   * Combat event mappings are notable all removed
   * As is unit equipped items
   */
  units: ICombatUnitStub[];
}

/**
 * These items are useful for the frontend but ultimately only present as part of an uploaded log
 */
interface IDTOPublicFeatures {
  /**
   * Battle.net ID of the log uploader
   */
  ownerId: string;
  /**
   * Cloud storage URL of the raw log file
   */
  logObjectUrl: string;
  /**
   * TODO: what is this field for again?
   * It was something to do with how we were correcting for UTC time
   * differentials between the log and rtc of the user's machine
   */
  utcCorrected: boolean;
}

export type ICombatDataStub = (IArenaMatchStub | IShuffleRoundStub) & IUnitsStub & IDTOPublicFeatures;

const stub: ICombatDataStub = {} as ICombatDataStub;

// eslint-disable-next-line no-console
console.log(stub.dataType);

export interface CombatQueryResult {
  combats: CombatDataStub[];
  queryLimitReached: boolean;
}

export const typeDefs = gql`
  type IUser {
    id: String!
    battletag: String
    referrer: String
    subscriptionTier: String!
    tags: [String]
  }
  type ArenaMatchEndInfo {
    timestamp: Float!
    winningTeamId: String!
    matchDurationInSeconds: Float!
    team0MMR: Int!
    team1MMR: Int!
  }
  type ArenaMatchStartInfo {
    timestamp: Float!
    zoneId: String!
    item1: String!
    bracket: String!
    isRanked: Boolean!
  }
  type CombatDataStub {
    id: String!
    wowVersion: String
    ownerId: String
    units: [CombatUnitStub!]!
    result: Int!
    logObjectUrl: String!
    startInfo: ArenaMatchStartInfo
    endInfo: ArenaMatchEndInfo
    startTime: Float!
    endTime: Float!
    playerTeamId: String!
    playerTeamRating: Int!
    hasAdvancedLogging: Boolean!
    utcCorrected: Boolean
  }
  type Talent {
    id1: Int
    id2: Int
    count: Int
  }
  type CombatantInfo {
    teamId: String!
    specId: String!
    talents: [Talent]!
    pvpTalents: [String!]!
    personalRating: Int!
    highestPvpTier: Int!
  }
  type CombatUnitStub {
    id: String!
    name: String!
    info: CombatantInfo
    type: Int!
    spec: String!
    class: Int!
    reaction: Int!
    affiliation: Int!
  }
  type CombatQueryResult {
    combats: [CombatDataStub!]!
    queryLimitReached: Boolean!
  }
  type Query {
    me: IUser
    latestMatches(
      wowVersion: String!
      bracket: String
      minRating: Float
      compQueryString: String
      lhsShouldBeWinner: Boolean
      offset: Int! = 0
      count: Int! = 50
    ): CombatQueryResult!
    myMatches(anonymousUserId: String = null, offset: Int! = 0, count: Int! = 50): CombatQueryResult!
    userMatches(userId: String!, offset: Int! = 0, count: Int! = 50): CombatQueryResult!
    matchesWithCombatant(playerName: String!): [CombatDataStub!]!
  }
  type Mutation {
    setUserReferrer(referrer: String): IUser
  }
`;

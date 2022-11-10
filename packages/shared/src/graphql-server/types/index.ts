import {
  ArenaMatchEndInfo,
  ArenaMatchStartInfo,
  CombatantInfo,
  CombatResult,
  CombatUnitClass,
  CombatUnitReaction,
  CombatUnitSpec,
  CombatUnitType,
  WowVersion,
} from '@wowarenalogs/parser';
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
interface ICombatUnitStub {
  id: string;
  name: string;
  reaction: CombatUnitReaction;
  type: CombatUnitType;
  class: CombatUnitClass;
  spec: CombatUnitSpec;
  info?: CombatantInfo;
  // damageIn: CombatHpUpdateAction[];
  // damageOut: CombatHpUpdateAction[];
  // healIn: CombatHpUpdateAction[];
  // healOut: CombatHpUpdateAction[];
  // actionIn: ILogLine[];
  // actionOut: ILogLine[];
  // auraEvents: CombatAction[];
  // spellCastEvents: CombatAction[];
  // deathRecords: ILogLine[];
  // advancedActions: CombatAdvancedAction[];
}

export interface ICombatDataStub {
  logObjectUrl: string;
  wowVersion?: WowVersion;
  ownerId: string | null;
  units: ICombatUnitStub[]; // changed from original type
  id: string;
  startTime: number;
  endTime: number;
  playerTeamId: string;
  playerTeamRating: number;
  result: CombatResult;
  hasAdvancedLogging: boolean;
  // rawLines: string[];
  // linesNotParsedCount: number;
  startInfo?: ArenaMatchStartInfo;
  endInfo?: ArenaMatchEndInfo;
  utcCorrected: boolean;
}

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
  type EquippedItem {
    bonuses: [String!]!
    enchants: [String!]!
    gems: [String!]!
    id: String!
    ilvl: Int!
  }
  type Talent {
    id1: Int
    id2: Int
    count: Int
  }
  type CombatantInfo {
    teamId: String!
    strength: Int!
    agility: Int!
    stamina: Int!
    intelligence: Int!
    dodge: Int!
    parry: Int!
    block: Int!
    critMelee: Int!
    critRanged: Int!
    critSpell: Int!
    speed: Int!
    lifesteal: Int!
    hasteMelee: Int!
    hasteRanged: Int!
    hasteSpell: Int!
    avoidance: Int!
    mastery: Int!
    versatilityDamgeDone: Int!
    versatilityHealingDone: Int!
    versatilityDamageTaken: Int!
    armor: Int!
    specId: String!
    talents: [Talent]!
    pvpTalents: [String!]!
    equipment: [EquippedItem!]!
    interestingAurasJSON: String!
    item28: Int!
    item29: Int!
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

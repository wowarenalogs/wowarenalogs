import { gql } from 'apollo-server-micro';

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
  type ArenaMatchDataStub {
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
    playerId: String!
    playerTeamId: String!
    playerTeamRating: Int!
    hasAdvancedLogging: Boolean!
    utcCorrected: Boolean
    durationInSeconds: Int!
  }
  type ScoreboardEntry {
    unitId: String!
    wins: Int!
  }
  type ShuffleRoundStub {
    id: String!
    wowVersion: String
    ownerId: String
    units: [CombatUnitStub!]!
    result: Int!
    logObjectUrl: String!
    startInfo: ArenaMatchStartInfo
    startTime: Float!
    endTime: Float!
    playerId: String!
    playerTeamId: String!
    playerTeamRating: Int!
    hasAdvancedLogging: Boolean!
    utcCorrected: Boolean
    durationInSeconds: Int!
    killedUnitId: String!
    scoreboard: [ScoreboardEntry]
    sequenceNumber: Int!
    shuffleMatchEndInfo: ArenaMatchEndInfo
    shuffleMatchResult: Int
  }

  union CombatDataStub = ShuffleRoundStub | ArenaMatchDataStub
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

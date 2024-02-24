import { gql } from 'apollo-server-micro';

export const typeDefs = gql`
  type IUser {
    id: String!
    battlenetId: String
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
    playerId: String
    playerTeamId: String!
    playerTeamRating: Int!
    hasAdvancedLogging: Boolean!
    durationInSeconds: Float
    winningTeamId: String
    timezone: String
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
    playerId: String
    playerTeamId: String!
    playerTeamRating: Int!
    hasAdvancedLogging: Boolean!
    durationInSeconds: Float
    winningTeamId: String
    killedUnitId: String!
    scoreboard: [ScoreboardEntry]
    sequenceNumber: Int!
    shuffleMatchEndInfo: ArenaMatchEndInfo
    shuffleMatchResult: Int
    shuffleMatchId: String
    timezone: String
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
    highestPvpTier: Int
  }

  type CombatUnitStub {
    id: String!
    name: String!
    info: CombatantInfo
    type: Int!
    spec: String!
    class: Int!
    reaction: Int!
    affiliation: Int
  }

  type CombatQueryResult {
    combats: [CombatDataStub!]!
    queryLimitReached: Boolean!
  }

  type UserCharacterBracketStats {
    bracket: String!
    highestRating: Int!
    latestRating: Int!
    wins: Int!
    losses: Int!
  }

  type UserCharacterInfo {
    characterName: String!
    guid: String!
    specId: String!
    bracketStats: [UserCharacterBracketStats!]!
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
    myCharacters: [UserCharacterInfo!]!
    userMatches(userId: String!, offset: Int! = 0, count: Int! = 50): CombatQueryResult!
    characterMatches(realm: String!, characterName: String!, offset: Int! = 0, count: Int! = 50): CombatQueryResult!
    matchesWithCombatant(combatantName: String!): [CombatDataStub!]!
    matchesWithOwnerId(ownerId: String!): [CombatDataStub!]!
    matchById(matchId: String!): CombatDataStub!
  }

  type Mutation {
    setUserReferrer(referrer: String): IUser
  }
`;

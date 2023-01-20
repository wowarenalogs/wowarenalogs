import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
const defaultOptions = {} as const;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
};

export type ArenaMatchDataStub = {
  __typename?: 'ArenaMatchDataStub';
  durationInSeconds?: Maybe<Scalars['Float']>;
  endInfo?: Maybe<ArenaMatchEndInfo>;
  endTime: Scalars['Float'];
  hasAdvancedLogging: Scalars['Boolean'];
  id: Scalars['String'];
  logObjectUrl: Scalars['String'];
  ownerId?: Maybe<Scalars['String']>;
  playerId?: Maybe<Scalars['String']>;
  playerTeamId: Scalars['String'];
  playerTeamRating: Scalars['Int'];
  result: Scalars['Int'];
  startInfo?: Maybe<ArenaMatchStartInfo>;
  startTime: Scalars['Float'];
  timezone?: Maybe<Scalars['String']>;
  units: Array<CombatUnitStub>;
  winningTeamId?: Maybe<Scalars['String']>;
  wowVersion?: Maybe<Scalars['String']>;
};

export type ArenaMatchEndInfo = {
  __typename?: 'ArenaMatchEndInfo';
  matchDurationInSeconds: Scalars['Float'];
  team0MMR: Scalars['Int'];
  team1MMR: Scalars['Int'];
  timestamp: Scalars['Float'];
  winningTeamId: Scalars['String'];
};

export type ArenaMatchStartInfo = {
  __typename?: 'ArenaMatchStartInfo';
  bracket: Scalars['String'];
  isRanked: Scalars['Boolean'];
  item1: Scalars['String'];
  timestamp: Scalars['Float'];
  zoneId: Scalars['String'];
};

export type CombatDataStub = ArenaMatchDataStub | ShuffleRoundStub;

export type CombatQueryResult = {
  __typename?: 'CombatQueryResult';
  combats: Array<CombatDataStub>;
  queryLimitReached: Scalars['Boolean'];
};

export type CombatUnitStub = {
  __typename?: 'CombatUnitStub';
  affiliation?: Maybe<Scalars['Int']>;
  class: Scalars['Int'];
  id: Scalars['String'];
  info?: Maybe<CombatantInfo>;
  name: Scalars['String'];
  reaction: Scalars['Int'];
  spec: Scalars['String'];
  type: Scalars['Int'];
};

export type CombatantInfo = {
  __typename?: 'CombatantInfo';
  highestPvpTier?: Maybe<Scalars['Int']>;
  personalRating: Scalars['Int'];
  pvpTalents: Array<Scalars['String']>;
  specId: Scalars['String'];
  talents: Array<Maybe<Talent>>;
  teamId: Scalars['String'];
};

export type IUser = {
  __typename?: 'IUser';
  battlenetId?: Maybe<Scalars['String']>;
  battletag?: Maybe<Scalars['String']>;
  id: Scalars['String'];
  referrer?: Maybe<Scalars['String']>;
  subscriptionTier: Scalars['String'];
  tags?: Maybe<Array<Maybe<Scalars['String']>>>;
};

export type Mutation = {
  __typename?: 'Mutation';
  setUserReferrer?: Maybe<IUser>;
};


export type MutationSetUserReferrerArgs = {
  referrer?: InputMaybe<Scalars['String']>;
};

export type Query = {
  __typename?: 'Query';
  characterMatches: CombatQueryResult;
  latestMatches: CombatQueryResult;
  matchById: CombatDataStub;
  matchesWithCombatant: Array<CombatDataStub>;
  me?: Maybe<IUser>;
  myMatches: CombatQueryResult;
  userMatches: CombatQueryResult;
};


export type QueryCharacterMatchesArgs = {
  characterName: Scalars['String'];
  count?: Scalars['Int'];
  offset?: Scalars['Int'];
  realm: Scalars['String'];
};


export type QueryLatestMatchesArgs = {
  bracket?: InputMaybe<Scalars['String']>;
  compQueryString?: InputMaybe<Scalars['String']>;
  count?: Scalars['Int'];
  lhsShouldBeWinner?: InputMaybe<Scalars['Boolean']>;
  minRating?: InputMaybe<Scalars['Float']>;
  offset?: Scalars['Int'];
  wowVersion: Scalars['String'];
};


export type QueryMatchByIdArgs = {
  matchId: Scalars['String'];
};


export type QueryMatchesWithCombatantArgs = {
  playerName: Scalars['String'];
};


export type QueryMyMatchesArgs = {
  anonymousUserId?: InputMaybe<Scalars['String']>;
  count?: Scalars['Int'];
  offset?: Scalars['Int'];
};


export type QueryUserMatchesArgs = {
  count?: Scalars['Int'];
  offset?: Scalars['Int'];
  userId: Scalars['String'];
};

export type ScoreboardEntry = {
  __typename?: 'ScoreboardEntry';
  unitId: Scalars['String'];
  wins: Scalars['Int'];
};

export type ShuffleRoundStub = {
  __typename?: 'ShuffleRoundStub';
  durationInSeconds?: Maybe<Scalars['Float']>;
  endTime: Scalars['Float'];
  hasAdvancedLogging: Scalars['Boolean'];
  id: Scalars['String'];
  killedUnitId: Scalars['String'];
  logObjectUrl: Scalars['String'];
  ownerId?: Maybe<Scalars['String']>;
  playerId?: Maybe<Scalars['String']>;
  playerTeamId: Scalars['String'];
  playerTeamRating: Scalars['Int'];
  result: Scalars['Int'];
  scoreboard?: Maybe<Array<Maybe<ScoreboardEntry>>>;
  sequenceNumber: Scalars['Int'];
  shuffleMatchEndInfo?: Maybe<ArenaMatchEndInfo>;
  shuffleMatchId?: Maybe<Scalars['String']>;
  shuffleMatchResult?: Maybe<Scalars['Int']>;
  startInfo?: Maybe<ArenaMatchStartInfo>;
  startTime: Scalars['Float'];
  timezone?: Maybe<Scalars['String']>;
  units: Array<CombatUnitStub>;
  winningTeamId?: Maybe<Scalars['String']>;
  wowVersion?: Maybe<Scalars['String']>;
};

export type Talent = {
  __typename?: 'Talent';
  count?: Maybe<Scalars['Int']>;
  id1?: Maybe<Scalars['Int']>;
  id2?: Maybe<Scalars['Int']>;
};

export type EndInfosFragment = { __typename?: 'ArenaMatchEndInfo', timestamp: number, winningTeamId: string, matchDurationInSeconds: number, team0MMR: number, team1MMR: number };

export type StartInfosFragment = { __typename?: 'ArenaMatchStartInfo', timestamp: number, zoneId: string, item1: string, bracket: string, isRanked: boolean };

export type CombatantInfosFragment = { __typename?: 'CombatantInfo', teamId: string, specId: string, pvpTalents: Array<string>, personalRating: number, highestPvpTier?: number | null, talents: Array<{ __typename?: 'Talent', id1?: number | null, id2?: number | null, count?: number | null } | null> };

export type UnitInfosFragment = { __typename?: 'CombatUnitStub', id: string, name: string, affiliation?: number | null, type: number, spec: string, class: number, reaction: number, info?: { __typename?: 'CombatantInfo', teamId: string, specId: string, pvpTalents: Array<string>, personalRating: number, highestPvpTier?: number | null, talents: Array<{ __typename?: 'Talent', id1?: number | null, id2?: number | null, count?: number | null } | null> } | null };

export type ArenaInfosFragment = { __typename?: 'ArenaMatchDataStub', id: string, wowVersion?: string | null, ownerId?: string | null, result: number, logObjectUrl: string, startTime: number, endTime: number, playerId?: string | null, playerTeamId: string, playerTeamRating: number, hasAdvancedLogging: boolean, durationInSeconds?: number | null, winningTeamId?: string | null, timezone?: string | null, units: Array<{ __typename?: 'CombatUnitStub', id: string, name: string, affiliation?: number | null, type: number, spec: string, class: number, reaction: number, info?: { __typename?: 'CombatantInfo', teamId: string, specId: string, pvpTalents: Array<string>, personalRating: number, highestPvpTier?: number | null, talents: Array<{ __typename?: 'Talent', id1?: number | null, id2?: number | null, count?: number | null } | null> } | null }>, startInfo?: { __typename?: 'ArenaMatchStartInfo', timestamp: number, zoneId: string, item1: string, bracket: string, isRanked: boolean } | null, endInfo?: { __typename?: 'ArenaMatchEndInfo', timestamp: number, winningTeamId: string, matchDurationInSeconds: number, team0MMR: number, team1MMR: number } | null };

export type ShuffleInfosFragment = { __typename?: 'ShuffleRoundStub', id: string, wowVersion?: string | null, ownerId?: string | null, result: number, logObjectUrl: string, startTime: number, endTime: number, playerId?: string | null, playerTeamId: string, playerTeamRating: number, hasAdvancedLogging: boolean, durationInSeconds?: number | null, winningTeamId?: string | null, killedUnitId: string, sequenceNumber: number, shuffleMatchResult?: number | null, shuffleMatchId?: string | null, timezone?: string | null, units: Array<{ __typename?: 'CombatUnitStub', id: string, name: string, affiliation?: number | null, type: number, spec: string, class: number, reaction: number, info?: { __typename?: 'CombatantInfo', teamId: string, specId: string, pvpTalents: Array<string>, personalRating: number, highestPvpTier?: number | null, talents: Array<{ __typename?: 'Talent', id1?: number | null, id2?: number | null, count?: number | null } | null> } | null }>, startInfo?: { __typename?: 'ArenaMatchStartInfo', timestamp: number, zoneId: string, item1: string, bracket: string, isRanked: boolean } | null, scoreboard?: Array<{ __typename?: 'ScoreboardEntry', unitId: string, wins: number } | null> | null, shuffleMatchEndInfo?: { __typename?: 'ArenaMatchEndInfo', timestamp: number, winningTeamId: string, matchDurationInSeconds: number, team0MMR: number, team1MMR: number } | null };

export type GetPublicMatchesQueryVariables = Exact<{
  wowVersion: Scalars['String'];
  bracket?: InputMaybe<Scalars['String']>;
  minRating?: InputMaybe<Scalars['Float']>;
  compQueryString?: InputMaybe<Scalars['String']>;
  lhsShouldBeWinner?: InputMaybe<Scalars['Boolean']>;
  offset?: InputMaybe<Scalars['Int']>;
  count?: InputMaybe<Scalars['Int']>;
}>;


export type GetPublicMatchesQuery = { __typename?: 'Query', latestMatches: { __typename?: 'CombatQueryResult', queryLimitReached: boolean, combats: Array<{ __typename?: 'ArenaMatchDataStub', id: string, wowVersion?: string | null, ownerId?: string | null, result: number, logObjectUrl: string, startTime: number, endTime: number, playerId?: string | null, playerTeamId: string, playerTeamRating: number, hasAdvancedLogging: boolean, durationInSeconds?: number | null, winningTeamId?: string | null, timezone?: string | null, units: Array<{ __typename?: 'CombatUnitStub', id: string, name: string, affiliation?: number | null, type: number, spec: string, class: number, reaction: number, info?: { __typename?: 'CombatantInfo', teamId: string, specId: string, pvpTalents: Array<string>, personalRating: number, highestPvpTier?: number | null, talents: Array<{ __typename?: 'Talent', id1?: number | null, id2?: number | null, count?: number | null } | null> } | null }>, startInfo?: { __typename?: 'ArenaMatchStartInfo', timestamp: number, zoneId: string, item1: string, bracket: string, isRanked: boolean } | null, endInfo?: { __typename?: 'ArenaMatchEndInfo', timestamp: number, winningTeamId: string, matchDurationInSeconds: number, team0MMR: number, team1MMR: number } | null } | { __typename?: 'ShuffleRoundStub', id: string, wowVersion?: string | null, ownerId?: string | null, result: number, logObjectUrl: string, startTime: number, endTime: number, playerId?: string | null, playerTeamId: string, playerTeamRating: number, hasAdvancedLogging: boolean, durationInSeconds?: number | null, winningTeamId?: string | null, killedUnitId: string, sequenceNumber: number, shuffleMatchResult?: number | null, shuffleMatchId?: string | null, timezone?: string | null, units: Array<{ __typename?: 'CombatUnitStub', id: string, name: string, affiliation?: number | null, type: number, spec: string, class: number, reaction: number, info?: { __typename?: 'CombatantInfo', teamId: string, specId: string, pvpTalents: Array<string>, personalRating: number, highestPvpTier?: number | null, talents: Array<{ __typename?: 'Talent', id1?: number | null, id2?: number | null, count?: number | null } | null> } | null }>, startInfo?: { __typename?: 'ArenaMatchStartInfo', timestamp: number, zoneId: string, item1: string, bracket: string, isRanked: boolean } | null, scoreboard?: Array<{ __typename?: 'ScoreboardEntry', unitId: string, wins: number } | null> | null, shuffleMatchEndInfo?: { __typename?: 'ArenaMatchEndInfo', timestamp: number, winningTeamId: string, matchDurationInSeconds: number, team0MMR: number, team1MMR: number } | null }> } };

export type GetMyMatchesQueryVariables = Exact<{
  anonymousUserId?: InputMaybe<Scalars['String']>;
  offset?: InputMaybe<Scalars['Int']>;
  count?: InputMaybe<Scalars['Int']>;
}>;


export type GetMyMatchesQuery = { __typename?: 'Query', myMatches: { __typename?: 'CombatQueryResult', queryLimitReached: boolean, combats: Array<{ __typename?: 'ArenaMatchDataStub', id: string, wowVersion?: string | null, ownerId?: string | null, result: number, logObjectUrl: string, startTime: number, endTime: number, playerId?: string | null, playerTeamId: string, playerTeamRating: number, hasAdvancedLogging: boolean, durationInSeconds?: number | null, winningTeamId?: string | null, timezone?: string | null, units: Array<{ __typename?: 'CombatUnitStub', id: string, name: string, affiliation?: number | null, type: number, spec: string, class: number, reaction: number, info?: { __typename?: 'CombatantInfo', teamId: string, specId: string, pvpTalents: Array<string>, personalRating: number, highestPvpTier?: number | null, talents: Array<{ __typename?: 'Talent', id1?: number | null, id2?: number | null, count?: number | null } | null> } | null }>, startInfo?: { __typename?: 'ArenaMatchStartInfo', timestamp: number, zoneId: string, item1: string, bracket: string, isRanked: boolean } | null, endInfo?: { __typename?: 'ArenaMatchEndInfo', timestamp: number, winningTeamId: string, matchDurationInSeconds: number, team0MMR: number, team1MMR: number } | null } | { __typename?: 'ShuffleRoundStub', id: string, wowVersion?: string | null, ownerId?: string | null, result: number, logObjectUrl: string, startTime: number, endTime: number, playerId?: string | null, playerTeamId: string, playerTeamRating: number, hasAdvancedLogging: boolean, durationInSeconds?: number | null, winningTeamId?: string | null, killedUnitId: string, sequenceNumber: number, shuffleMatchResult?: number | null, shuffleMatchId?: string | null, timezone?: string | null, units: Array<{ __typename?: 'CombatUnitStub', id: string, name: string, affiliation?: number | null, type: number, spec: string, class: number, reaction: number, info?: { __typename?: 'CombatantInfo', teamId: string, specId: string, pvpTalents: Array<string>, personalRating: number, highestPvpTier?: number | null, talents: Array<{ __typename?: 'Talent', id1?: number | null, id2?: number | null, count?: number | null } | null> } | null }>, startInfo?: { __typename?: 'ArenaMatchStartInfo', timestamp: number, zoneId: string, item1: string, bracket: string, isRanked: boolean } | null, scoreboard?: Array<{ __typename?: 'ScoreboardEntry', unitId: string, wins: number } | null> | null, shuffleMatchEndInfo?: { __typename?: 'ArenaMatchEndInfo', timestamp: number, winningTeamId: string, matchDurationInSeconds: number, team0MMR: number, team1MMR: number } | null }> } };

export type GetUserMatchesQueryVariables = Exact<{
  userId: Scalars['String'];
  offset?: InputMaybe<Scalars['Int']>;
  count?: InputMaybe<Scalars['Int']>;
}>;


export type GetUserMatchesQuery = { __typename?: 'Query', userMatches: { __typename?: 'CombatQueryResult', queryLimitReached: boolean, combats: Array<{ __typename?: 'ArenaMatchDataStub', id: string, wowVersion?: string | null, ownerId?: string | null, result: number, logObjectUrl: string, startTime: number, endTime: number, playerId?: string | null, playerTeamId: string, playerTeamRating: number, hasAdvancedLogging: boolean, durationInSeconds?: number | null, winningTeamId?: string | null, timezone?: string | null, units: Array<{ __typename?: 'CombatUnitStub', id: string, name: string, affiliation?: number | null, type: number, spec: string, class: number, reaction: number, info?: { __typename?: 'CombatantInfo', teamId: string, specId: string, pvpTalents: Array<string>, personalRating: number, highestPvpTier?: number | null, talents: Array<{ __typename?: 'Talent', id1?: number | null, id2?: number | null, count?: number | null } | null> } | null }>, startInfo?: { __typename?: 'ArenaMatchStartInfo', timestamp: number, zoneId: string, item1: string, bracket: string, isRanked: boolean } | null, endInfo?: { __typename?: 'ArenaMatchEndInfo', timestamp: number, winningTeamId: string, matchDurationInSeconds: number, team0MMR: number, team1MMR: number } | null } | { __typename?: 'ShuffleRoundStub', id: string, wowVersion?: string | null, ownerId?: string | null, result: number, logObjectUrl: string, startTime: number, endTime: number, playerId?: string | null, playerTeamId: string, playerTeamRating: number, hasAdvancedLogging: boolean, durationInSeconds?: number | null, winningTeamId?: string | null, killedUnitId: string, sequenceNumber: number, shuffleMatchResult?: number | null, shuffleMatchId?: string | null, timezone?: string | null, units: Array<{ __typename?: 'CombatUnitStub', id: string, name: string, affiliation?: number | null, type: number, spec: string, class: number, reaction: number, info?: { __typename?: 'CombatantInfo', teamId: string, specId: string, pvpTalents: Array<string>, personalRating: number, highestPvpTier?: number | null, talents: Array<{ __typename?: 'Talent', id1?: number | null, id2?: number | null, count?: number | null } | null> } | null }>, startInfo?: { __typename?: 'ArenaMatchStartInfo', timestamp: number, zoneId: string, item1: string, bracket: string, isRanked: boolean } | null, scoreboard?: Array<{ __typename?: 'ScoreboardEntry', unitId: string, wins: number } | null> | null, shuffleMatchEndInfo?: { __typename?: 'ArenaMatchEndInfo', timestamp: number, winningTeamId: string, matchDurationInSeconds: number, team0MMR: number, team1MMR: number } | null }> } };

export type GetCharacterMatchesQueryVariables = Exact<{
  realm: Scalars['String'];
  characterName: Scalars['String'];
  offset?: InputMaybe<Scalars['Int']>;
  count?: InputMaybe<Scalars['Int']>;
}>;


export type GetCharacterMatchesQuery = { __typename?: 'Query', characterMatches: { __typename?: 'CombatQueryResult', queryLimitReached: boolean, combats: Array<{ __typename?: 'ArenaMatchDataStub', id: string, wowVersion?: string | null, ownerId?: string | null, result: number, logObjectUrl: string, startTime: number, endTime: number, playerId?: string | null, playerTeamId: string, playerTeamRating: number, hasAdvancedLogging: boolean, durationInSeconds?: number | null, winningTeamId?: string | null, timezone?: string | null, units: Array<{ __typename?: 'CombatUnitStub', id: string, name: string, affiliation?: number | null, type: number, spec: string, class: number, reaction: number, info?: { __typename?: 'CombatantInfo', teamId: string, specId: string, pvpTalents: Array<string>, personalRating: number, highestPvpTier?: number | null, talents: Array<{ __typename?: 'Talent', id1?: number | null, id2?: number | null, count?: number | null } | null> } | null }>, startInfo?: { __typename?: 'ArenaMatchStartInfo', timestamp: number, zoneId: string, item1: string, bracket: string, isRanked: boolean } | null, endInfo?: { __typename?: 'ArenaMatchEndInfo', timestamp: number, winningTeamId: string, matchDurationInSeconds: number, team0MMR: number, team1MMR: number } | null } | { __typename?: 'ShuffleRoundStub', id: string, wowVersion?: string | null, ownerId?: string | null, result: number, logObjectUrl: string, startTime: number, endTime: number, playerId?: string | null, playerTeamId: string, playerTeamRating: number, hasAdvancedLogging: boolean, durationInSeconds?: number | null, winningTeamId?: string | null, killedUnitId: string, sequenceNumber: number, shuffleMatchResult?: number | null, shuffleMatchId?: string | null, timezone?: string | null, units: Array<{ __typename?: 'CombatUnitStub', id: string, name: string, affiliation?: number | null, type: number, spec: string, class: number, reaction: number, info?: { __typename?: 'CombatantInfo', teamId: string, specId: string, pvpTalents: Array<string>, personalRating: number, highestPvpTier?: number | null, talents: Array<{ __typename?: 'Talent', id1?: number | null, id2?: number | null, count?: number | null } | null> } | null }>, startInfo?: { __typename?: 'ArenaMatchStartInfo', timestamp: number, zoneId: string, item1: string, bracket: string, isRanked: boolean } | null, scoreboard?: Array<{ __typename?: 'ScoreboardEntry', unitId: string, wins: number } | null> | null, shuffleMatchEndInfo?: { __typename?: 'ArenaMatchEndInfo', timestamp: number, winningTeamId: string, matchDurationInSeconds: number, team0MMR: number, team1MMR: number } | null }> } };

export type GetMatchesWithCombatantQueryVariables = Exact<{
  playerName: Scalars['String'];
}>;


export type GetMatchesWithCombatantQuery = { __typename?: 'Query', matchesWithCombatant: Array<{ __typename?: 'ArenaMatchDataStub', id: string, wowVersion?: string | null, ownerId?: string | null, result: number, logObjectUrl: string, startTime: number, endTime: number, playerId?: string | null, playerTeamId: string, playerTeamRating: number, hasAdvancedLogging: boolean, durationInSeconds?: number | null, winningTeamId?: string | null, timezone?: string | null, units: Array<{ __typename?: 'CombatUnitStub', id: string, name: string, affiliation?: number | null, type: number, spec: string, class: number, reaction: number, info?: { __typename?: 'CombatantInfo', teamId: string, specId: string, pvpTalents: Array<string>, personalRating: number, highestPvpTier?: number | null, talents: Array<{ __typename?: 'Talent', id1?: number | null, id2?: number | null, count?: number | null } | null> } | null }>, startInfo?: { __typename?: 'ArenaMatchStartInfo', timestamp: number, zoneId: string, item1: string, bracket: string, isRanked: boolean } | null, endInfo?: { __typename?: 'ArenaMatchEndInfo', timestamp: number, winningTeamId: string, matchDurationInSeconds: number, team0MMR: number, team1MMR: number } | null } | { __typename?: 'ShuffleRoundStub', id: string, wowVersion?: string | null, ownerId?: string | null, result: number, logObjectUrl: string, startTime: number, endTime: number, playerId?: string | null, playerTeamId: string, playerTeamRating: number, hasAdvancedLogging: boolean, durationInSeconds?: number | null, winningTeamId?: string | null, killedUnitId: string, sequenceNumber: number, shuffleMatchResult?: number | null, shuffleMatchId?: string | null, timezone?: string | null, units: Array<{ __typename?: 'CombatUnitStub', id: string, name: string, affiliation?: number | null, type: number, spec: string, class: number, reaction: number, info?: { __typename?: 'CombatantInfo', teamId: string, specId: string, pvpTalents: Array<string>, personalRating: number, highestPvpTier?: number | null, talents: Array<{ __typename?: 'Talent', id1?: number | null, id2?: number | null, count?: number | null } | null> } | null }>, startInfo?: { __typename?: 'ArenaMatchStartInfo', timestamp: number, zoneId: string, item1: string, bracket: string, isRanked: boolean } | null, scoreboard?: Array<{ __typename?: 'ScoreboardEntry', unitId: string, wins: number } | null> | null, shuffleMatchEndInfo?: { __typename?: 'ArenaMatchEndInfo', timestamp: number, winningTeamId: string, matchDurationInSeconds: number, team0MMR: number, team1MMR: number } | null }> };

export type GetMatchByIdQueryVariables = Exact<{
  matchId: Scalars['String'];
}>;


export type GetMatchByIdQuery = { __typename?: 'Query', matchById: { __typename?: 'ArenaMatchDataStub', id: string, wowVersion?: string | null, ownerId?: string | null, result: number, logObjectUrl: string, startTime: number, endTime: number, playerId?: string | null, playerTeamId: string, playerTeamRating: number, hasAdvancedLogging: boolean, durationInSeconds?: number | null, winningTeamId?: string | null, timezone?: string | null, units: Array<{ __typename?: 'CombatUnitStub', id: string, name: string, affiliation?: number | null, type: number, spec: string, class: number, reaction: number, info?: { __typename?: 'CombatantInfo', teamId: string, specId: string, pvpTalents: Array<string>, personalRating: number, highestPvpTier?: number | null, talents: Array<{ __typename?: 'Talent', id1?: number | null, id2?: number | null, count?: number | null } | null> } | null }>, startInfo?: { __typename?: 'ArenaMatchStartInfo', timestamp: number, zoneId: string, item1: string, bracket: string, isRanked: boolean } | null, endInfo?: { __typename?: 'ArenaMatchEndInfo', timestamp: number, winningTeamId: string, matchDurationInSeconds: number, team0MMR: number, team1MMR: number } | null } | { __typename?: 'ShuffleRoundStub', id: string, wowVersion?: string | null, ownerId?: string | null, result: number, logObjectUrl: string, startTime: number, endTime: number, playerId?: string | null, playerTeamId: string, playerTeamRating: number, hasAdvancedLogging: boolean, durationInSeconds?: number | null, winningTeamId?: string | null, killedUnitId: string, sequenceNumber: number, shuffleMatchResult?: number | null, shuffleMatchId?: string | null, timezone?: string | null, units: Array<{ __typename?: 'CombatUnitStub', id: string, name: string, affiliation?: number | null, type: number, spec: string, class: number, reaction: number, info?: { __typename?: 'CombatantInfo', teamId: string, specId: string, pvpTalents: Array<string>, personalRating: number, highestPvpTier?: number | null, talents: Array<{ __typename?: 'Talent', id1?: number | null, id2?: number | null, count?: number | null } | null> } | null }>, startInfo?: { __typename?: 'ArenaMatchStartInfo', timestamp: number, zoneId: string, item1: string, bracket: string, isRanked: boolean } | null, scoreboard?: Array<{ __typename?: 'ScoreboardEntry', unitId: string, wins: number } | null> | null, shuffleMatchEndInfo?: { __typename?: 'ArenaMatchEndInfo', timestamp: number, winningTeamId: string, matchDurationInSeconds: number, team0MMR: number, team1MMR: number } | null } };

export type GetProfileQueryVariables = Exact<{ [key: string]: never; }>;


export type GetProfileQuery = { __typename?: 'Query', me?: { __typename?: 'IUser', id: string, battletag?: string | null, battlenetId?: string | null, referrer?: string | null, subscriptionTier: string, tags?: Array<string | null> | null } | null };

export type SetUserReferrerMutationVariables = Exact<{
  referrer?: InputMaybe<Scalars['String']>;
}>;


export type SetUserReferrerMutation = { __typename?: 'Mutation', setUserReferrer?: { __typename?: 'IUser', id: string, battletag?: string | null, referrer?: string | null, subscriptionTier: string } | null };

export const CombatantInfosFragmentDoc = gql`
    fragment combatantInfos on CombatantInfo {
  teamId
  specId
  talents {
    id1
    id2
    count
  }
  pvpTalents
  personalRating
  highestPvpTier
}
    `;
export const UnitInfosFragmentDoc = gql`
    fragment unitInfos on CombatUnitStub {
  id
  name
  affiliation
  info {
    ...combatantInfos
  }
  type
  spec
  class
  reaction
}
    ${CombatantInfosFragmentDoc}`;
export const StartInfosFragmentDoc = gql`
    fragment startInfos on ArenaMatchStartInfo {
  timestamp
  zoneId
  item1
  bracket
  isRanked
}
    `;
export const EndInfosFragmentDoc = gql`
    fragment endInfos on ArenaMatchEndInfo {
  timestamp
  winningTeamId
  matchDurationInSeconds
  team0MMR
  team1MMR
}
    `;
export const ArenaInfosFragmentDoc = gql`
    fragment arenaInfos on ArenaMatchDataStub {
  id
  wowVersion
  ownerId
  units {
    ...unitInfos
  }
  result
  logObjectUrl
  startInfo {
    ...startInfos
  }
  endInfo {
    ...endInfos
  }
  startTime
  endTime
  playerId
  playerTeamId
  playerTeamRating
  hasAdvancedLogging
  durationInSeconds
  winningTeamId
  timezone
}
    ${UnitInfosFragmentDoc}
${StartInfosFragmentDoc}
${EndInfosFragmentDoc}`;
export const ShuffleInfosFragmentDoc = gql`
    fragment shuffleInfos on ShuffleRoundStub {
  id
  wowVersion
  ownerId
  units {
    ...unitInfos
  }
  result
  logObjectUrl
  startInfo {
    ...startInfos
  }
  startTime
  endTime
  playerId
  playerTeamId
  playerTeamRating
  hasAdvancedLogging
  durationInSeconds
  winningTeamId
  killedUnitId
  scoreboard {
    unitId
    wins
  }
  sequenceNumber
  shuffleMatchEndInfo {
    ...endInfos
  }
  shuffleMatchResult
  shuffleMatchId
  timezone
}
    ${UnitInfosFragmentDoc}
${StartInfosFragmentDoc}
${EndInfosFragmentDoc}`;
export const GetPublicMatchesDocument = gql`
    query GetPublicMatches($wowVersion: String!, $bracket: String, $minRating: Float, $compQueryString: String, $lhsShouldBeWinner: Boolean, $offset: Int = 0, $count: Int = 50) {
  latestMatches(
    wowVersion: $wowVersion
    bracket: $bracket
    minRating: $minRating
    compQueryString: $compQueryString
    lhsShouldBeWinner: $lhsShouldBeWinner
    offset: $offset
    count: $count
  ) {
    combats {
      ...arenaInfos
      ...shuffleInfos
    }
    queryLimitReached
  }
}
    ${ArenaInfosFragmentDoc}
${ShuffleInfosFragmentDoc}`;

/**
 * __useGetPublicMatchesQuery__
 *
 * To run a query within a React component, call `useGetPublicMatchesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetPublicMatchesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetPublicMatchesQuery({
 *   variables: {
 *      wowVersion: // value for 'wowVersion'
 *      bracket: // value for 'bracket'
 *      minRating: // value for 'minRating'
 *      compQueryString: // value for 'compQueryString'
 *      lhsShouldBeWinner: // value for 'lhsShouldBeWinner'
 *      offset: // value for 'offset'
 *      count: // value for 'count'
 *   },
 * });
 */
export function useGetPublicMatchesQuery(baseOptions: Apollo.QueryHookOptions<GetPublicMatchesQuery, GetPublicMatchesQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetPublicMatchesQuery, GetPublicMatchesQueryVariables>(GetPublicMatchesDocument, options);
      }
export function useGetPublicMatchesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetPublicMatchesQuery, GetPublicMatchesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetPublicMatchesQuery, GetPublicMatchesQueryVariables>(GetPublicMatchesDocument, options);
        }
export type GetPublicMatchesQueryHookResult = ReturnType<typeof useGetPublicMatchesQuery>;
export type GetPublicMatchesLazyQueryHookResult = ReturnType<typeof useGetPublicMatchesLazyQuery>;
export type GetPublicMatchesQueryResult = Apollo.QueryResult<GetPublicMatchesQuery, GetPublicMatchesQueryVariables>;
export const GetMyMatchesDocument = gql`
    query GetMyMatches($anonymousUserId: String = null, $offset: Int = 0, $count: Int = 50) {
  myMatches(anonymousUserId: $anonymousUserId, offset: $offset, count: $count) {
    combats {
      ...arenaInfos
      ...shuffleInfos
    }
    queryLimitReached
  }
}
    ${ArenaInfosFragmentDoc}
${ShuffleInfosFragmentDoc}`;

/**
 * __useGetMyMatchesQuery__
 *
 * To run a query within a React component, call `useGetMyMatchesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMyMatchesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMyMatchesQuery({
 *   variables: {
 *      anonymousUserId: // value for 'anonymousUserId'
 *      offset: // value for 'offset'
 *      count: // value for 'count'
 *   },
 * });
 */
export function useGetMyMatchesQuery(baseOptions?: Apollo.QueryHookOptions<GetMyMatchesQuery, GetMyMatchesQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetMyMatchesQuery, GetMyMatchesQueryVariables>(GetMyMatchesDocument, options);
      }
export function useGetMyMatchesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetMyMatchesQuery, GetMyMatchesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetMyMatchesQuery, GetMyMatchesQueryVariables>(GetMyMatchesDocument, options);
        }
export type GetMyMatchesQueryHookResult = ReturnType<typeof useGetMyMatchesQuery>;
export type GetMyMatchesLazyQueryHookResult = ReturnType<typeof useGetMyMatchesLazyQuery>;
export type GetMyMatchesQueryResult = Apollo.QueryResult<GetMyMatchesQuery, GetMyMatchesQueryVariables>;
export const GetUserMatchesDocument = gql`
    query GetUserMatches($userId: String!, $offset: Int = 0, $count: Int = 50) {
  userMatches(userId: $userId, offset: $offset, count: $count) {
    combats {
      ...arenaInfos
      ...shuffleInfos
    }
    queryLimitReached
  }
}
    ${ArenaInfosFragmentDoc}
${ShuffleInfosFragmentDoc}`;

/**
 * __useGetUserMatchesQuery__
 *
 * To run a query within a React component, call `useGetUserMatchesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetUserMatchesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetUserMatchesQuery({
 *   variables: {
 *      userId: // value for 'userId'
 *      offset: // value for 'offset'
 *      count: // value for 'count'
 *   },
 * });
 */
export function useGetUserMatchesQuery(baseOptions: Apollo.QueryHookOptions<GetUserMatchesQuery, GetUserMatchesQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetUserMatchesQuery, GetUserMatchesQueryVariables>(GetUserMatchesDocument, options);
      }
export function useGetUserMatchesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetUserMatchesQuery, GetUserMatchesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetUserMatchesQuery, GetUserMatchesQueryVariables>(GetUserMatchesDocument, options);
        }
export type GetUserMatchesQueryHookResult = ReturnType<typeof useGetUserMatchesQuery>;
export type GetUserMatchesLazyQueryHookResult = ReturnType<typeof useGetUserMatchesLazyQuery>;
export type GetUserMatchesQueryResult = Apollo.QueryResult<GetUserMatchesQuery, GetUserMatchesQueryVariables>;
export const GetCharacterMatchesDocument = gql`
    query GetCharacterMatches($realm: String!, $characterName: String!, $offset: Int = 0, $count: Int = 50) {
  characterMatches(
    realm: $realm
    characterName: $characterName
    offset: $offset
    count: $count
  ) {
    combats {
      ...arenaInfos
      ...shuffleInfos
    }
    queryLimitReached
  }
}
    ${ArenaInfosFragmentDoc}
${ShuffleInfosFragmentDoc}`;

/**
 * __useGetCharacterMatchesQuery__
 *
 * To run a query within a React component, call `useGetCharacterMatchesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetCharacterMatchesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetCharacterMatchesQuery({
 *   variables: {
 *      realm: // value for 'realm'
 *      characterName: // value for 'characterName'
 *      offset: // value for 'offset'
 *      count: // value for 'count'
 *   },
 * });
 */
export function useGetCharacterMatchesQuery(baseOptions: Apollo.QueryHookOptions<GetCharacterMatchesQuery, GetCharacterMatchesQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetCharacterMatchesQuery, GetCharacterMatchesQueryVariables>(GetCharacterMatchesDocument, options);
      }
export function useGetCharacterMatchesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetCharacterMatchesQuery, GetCharacterMatchesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetCharacterMatchesQuery, GetCharacterMatchesQueryVariables>(GetCharacterMatchesDocument, options);
        }
export type GetCharacterMatchesQueryHookResult = ReturnType<typeof useGetCharacterMatchesQuery>;
export type GetCharacterMatchesLazyQueryHookResult = ReturnType<typeof useGetCharacterMatchesLazyQuery>;
export type GetCharacterMatchesQueryResult = Apollo.QueryResult<GetCharacterMatchesQuery, GetCharacterMatchesQueryVariables>;
export const GetMatchesWithCombatantDocument = gql`
    query GetMatchesWithCombatant($playerName: String!) {
  matchesWithCombatant(playerName: $playerName) {
    ...arenaInfos
    ...shuffleInfos
  }
}
    ${ArenaInfosFragmentDoc}
${ShuffleInfosFragmentDoc}`;

/**
 * __useGetMatchesWithCombatantQuery__
 *
 * To run a query within a React component, call `useGetMatchesWithCombatantQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMatchesWithCombatantQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMatchesWithCombatantQuery({
 *   variables: {
 *      playerName: // value for 'playerName'
 *   },
 * });
 */
export function useGetMatchesWithCombatantQuery(baseOptions: Apollo.QueryHookOptions<GetMatchesWithCombatantQuery, GetMatchesWithCombatantQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetMatchesWithCombatantQuery, GetMatchesWithCombatantQueryVariables>(GetMatchesWithCombatantDocument, options);
      }
export function useGetMatchesWithCombatantLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetMatchesWithCombatantQuery, GetMatchesWithCombatantQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetMatchesWithCombatantQuery, GetMatchesWithCombatantQueryVariables>(GetMatchesWithCombatantDocument, options);
        }
export type GetMatchesWithCombatantQueryHookResult = ReturnType<typeof useGetMatchesWithCombatantQuery>;
export type GetMatchesWithCombatantLazyQueryHookResult = ReturnType<typeof useGetMatchesWithCombatantLazyQuery>;
export type GetMatchesWithCombatantQueryResult = Apollo.QueryResult<GetMatchesWithCombatantQuery, GetMatchesWithCombatantQueryVariables>;
export const GetMatchByIdDocument = gql`
    query GetMatchById($matchId: String!) {
  matchById(matchId: $matchId) {
    ...arenaInfos
    ...shuffleInfos
  }
}
    ${ArenaInfosFragmentDoc}
${ShuffleInfosFragmentDoc}`;

/**
 * __useGetMatchByIdQuery__
 *
 * To run a query within a React component, call `useGetMatchByIdQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMatchByIdQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMatchByIdQuery({
 *   variables: {
 *      matchId: // value for 'matchId'
 *   },
 * });
 */
export function useGetMatchByIdQuery(baseOptions: Apollo.QueryHookOptions<GetMatchByIdQuery, GetMatchByIdQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetMatchByIdQuery, GetMatchByIdQueryVariables>(GetMatchByIdDocument, options);
      }
export function useGetMatchByIdLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetMatchByIdQuery, GetMatchByIdQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetMatchByIdQuery, GetMatchByIdQueryVariables>(GetMatchByIdDocument, options);
        }
export type GetMatchByIdQueryHookResult = ReturnType<typeof useGetMatchByIdQuery>;
export type GetMatchByIdLazyQueryHookResult = ReturnType<typeof useGetMatchByIdLazyQuery>;
export type GetMatchByIdQueryResult = Apollo.QueryResult<GetMatchByIdQuery, GetMatchByIdQueryVariables>;
export const GetProfileDocument = gql`
    query GetProfile {
  me {
    id
    battletag
    battlenetId
    referrer
    subscriptionTier
    tags
  }
}
    `;

/**
 * __useGetProfileQuery__
 *
 * To run a query within a React component, call `useGetProfileQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetProfileQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetProfileQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetProfileQuery(baseOptions?: Apollo.QueryHookOptions<GetProfileQuery, GetProfileQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetProfileQuery, GetProfileQueryVariables>(GetProfileDocument, options);
      }
export function useGetProfileLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetProfileQuery, GetProfileQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetProfileQuery, GetProfileQueryVariables>(GetProfileDocument, options);
        }
export type GetProfileQueryHookResult = ReturnType<typeof useGetProfileQuery>;
export type GetProfileLazyQueryHookResult = ReturnType<typeof useGetProfileLazyQuery>;
export type GetProfileQueryResult = Apollo.QueryResult<GetProfileQuery, GetProfileQueryVariables>;
export const SetUserReferrerDocument = gql`
    mutation SetUserReferrer($referrer: String) {
  setUserReferrer(referrer: $referrer) {
    id
    battletag
    referrer
    subscriptionTier
  }
}
    `;
export type SetUserReferrerMutationFn = Apollo.MutationFunction<SetUserReferrerMutation, SetUserReferrerMutationVariables>;

/**
 * __useSetUserReferrerMutation__
 *
 * To run a mutation, you first call `useSetUserReferrerMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSetUserReferrerMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [setUserReferrerMutation, { data, loading, error }] = useSetUserReferrerMutation({
 *   variables: {
 *      referrer: // value for 'referrer'
 *   },
 * });
 */
export function useSetUserReferrerMutation(baseOptions?: Apollo.MutationHookOptions<SetUserReferrerMutation, SetUserReferrerMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<SetUserReferrerMutation, SetUserReferrerMutationVariables>(SetUserReferrerDocument, options);
      }
export type SetUserReferrerMutationHookResult = ReturnType<typeof useSetUserReferrerMutation>;
export type SetUserReferrerMutationResult = Apollo.MutationResult<SetUserReferrerMutation>;
export type SetUserReferrerMutationOptions = Apollo.BaseMutationOptions<SetUserReferrerMutation, SetUserReferrerMutationVariables>;
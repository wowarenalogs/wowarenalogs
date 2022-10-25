import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
export type Maybe<T> = T | null;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  /** The `Upload` scalar type represents a file upload. */
  Upload: any;
};


export type ArenaMatchEndInfo = {
  __typename?: 'ArenaMatchEndInfo';
  timestamp: Scalars['Float'];
  winningTeamId: Scalars['String'];
  matchDurationInSeconds: Scalars['Float'];
  team0MMR: Scalars['Int'];
  team1MMR: Scalars['Int'];
};

export type ArenaMatchStartInfo = {
  __typename?: 'ArenaMatchStartInfo';
  timestamp: Scalars['Float'];
  zoneId: Scalars['String'];
  item1: Scalars['String'];
  bracket: Scalars['String'];
  isRanked: Scalars['Boolean'];
};

export enum CacheControlScope {
  Public = 'PUBLIC',
  Private = 'PRIVATE'
}

export type CombatDataStub = {
  __typename?: 'CombatDataStub';
  id: Scalars['String'];
  wowVersion?: Maybe<Scalars['String']>;
  ownerId?: Maybe<Scalars['String']>;
  units: Array<CombatUnitStub>;
  result: Scalars['Int'];
  logObjectUrl: Scalars['String'];
  startInfo?: Maybe<ArenaMatchStartInfo>;
  endInfo?: Maybe<ArenaMatchEndInfo>;
  startTime: Scalars['Float'];
  endTime: Scalars['Float'];
  playerTeamId: Scalars['String'];
  playerTeamRating: Scalars['Int'];
  hasAdvancedLogging: Scalars['Boolean'];
  utcCorrected?: Maybe<Scalars['Boolean']>;
};

export type CombatQueryResult = {
  __typename?: 'CombatQueryResult';
  combats: Array<CombatDataStub>;
  queryLimitReached: Scalars['Boolean'];
};

export type CombatUnitStub = {
  __typename?: 'CombatUnitStub';
  id: Scalars['String'];
  name: Scalars['String'];
  info?: Maybe<CombatantInfo>;
  type: Scalars['Int'];
  spec: Scalars['String'];
  class: Scalars['Int'];
  reaction: Scalars['Int'];
};

export type CombatantInfo = {
  __typename?: 'CombatantInfo';
  teamId: Scalars['String'];
  strength: Scalars['Int'];
  agility: Scalars['Int'];
  stamina: Scalars['Int'];
  intelligence: Scalars['Int'];
  dodge: Scalars['Int'];
  parry: Scalars['Int'];
  block: Scalars['Int'];
  critMelee: Scalars['Int'];
  critRanged: Scalars['Int'];
  critSpell: Scalars['Int'];
  speed: Scalars['Int'];
  lifesteal: Scalars['Int'];
  hasteMelee: Scalars['Int'];
  hasteRanged: Scalars['Int'];
  hasteSpell: Scalars['Int'];
  avoidance: Scalars['Int'];
  mastery: Scalars['Int'];
  versatilityDamgeDone: Scalars['Int'];
  versatilityHealingDone: Scalars['Int'];
  versatilityDamageTaken: Scalars['Int'];
  armor: Scalars['Int'];
  specId: Scalars['String'];
  talents: Array<Scalars['String']>;
  pvpTalents: Array<Scalars['String']>;
  equipment: Array<EquippedItem>;
  interestingAurasJSON: Scalars['String'];
  item29: Scalars['Int'];
  item30: Scalars['Int'];
  personalRating: Scalars['Int'];
  highestPvpTier: Scalars['Int'];
};

export type EquippedItem = {
  __typename?: 'EquippedItem';
  bonuses: Array<Scalars['String']>;
  enchants: Array<Scalars['String']>;
  gems: Array<Scalars['String']>;
  id: Scalars['String'];
  ilvl: Scalars['Int'];
};

export type IUser = {
  __typename?: 'IUser';
  id: Scalars['String'];
  battletag?: Maybe<Scalars['String']>;
  referrer?: Maybe<Scalars['String']>;
  subscriptionTier: Scalars['String'];
  tags?: Maybe<Array<Maybe<Scalars['String']>>>;
};

export type Mutation = {
  __typename?: 'Mutation';
  setUserReferrer?: Maybe<IUser>;
};


export type MutationSetUserReferrerArgs = {
  referrer?: Maybe<Scalars['String']>;
};

export type Query = {
  __typename?: 'Query';
  me?: Maybe<IUser>;
  latestMatches: CombatQueryResult;
  myMatches: CombatQueryResult;
  userMatches: CombatQueryResult;
  matchesWithCombatant: Array<CombatDataStub>;
};


export type QueryLatestMatchesArgs = {
  wowVersion: Scalars['String'];
  bracket?: Maybe<Scalars['String']>;
  minRating?: Maybe<Scalars['Float']>;
  compQueryString?: Maybe<Scalars['String']>;
  lhsShouldBeWinner?: Maybe<Scalars['Boolean']>;
  offset?: Scalars['Int'];
  count?: Scalars['Int'];
};


export type QueryMyMatchesArgs = {
  anonymousUserId?: Maybe<Scalars['String']>;
  offset?: Scalars['Int'];
  count?: Scalars['Int'];
};


export type QueryUserMatchesArgs = {
  userId: Scalars['String'];
  offset?: Scalars['Int'];
  count?: Scalars['Int'];
};


export type QueryMatchesWithCombatantArgs = {
  playerName: Scalars['String'];
};


export type EndInfosFragment = (
  { __typename?: 'ArenaMatchEndInfo' }
  & Pick<ArenaMatchEndInfo, 'timestamp' | 'winningTeamId' | 'matchDurationInSeconds' | 'team0MMR' | 'team1MMR'>
);

export type StartInfosFragment = (
  { __typename?: 'ArenaMatchStartInfo' }
  & Pick<ArenaMatchStartInfo, 'timestamp' | 'zoneId' | 'item1' | 'bracket' | 'isRanked'>
);

export type ItemInfosFragment = (
  { __typename?: 'EquippedItem' }
  & Pick<EquippedItem, 'bonuses' | 'enchants' | 'gems' | 'id' | 'ilvl'>
);

export type CombatantInfosFragment = (
  { __typename?: 'CombatantInfo' }
  & Pick<CombatantInfo, 'teamId' | 'strength' | 'agility' | 'stamina' | 'intelligence' | 'dodge' | 'parry' | 'block' | 'critMelee' | 'critRanged' | 'critSpell' | 'speed' | 'lifesteal' | 'hasteMelee' | 'hasteRanged' | 'hasteSpell' | 'avoidance' | 'mastery' | 'versatilityDamgeDone' | 'versatilityHealingDone' | 'versatilityDamageTaken' | 'armor' | 'specId' | 'talents' | 'pvpTalents' | 'interestingAurasJSON' | 'item29' | 'item30' | 'personalRating' | 'highestPvpTier'>
  & { equipment: Array<(
    { __typename?: 'EquippedItem' }
    & ItemInfosFragment
  )> }
);

export type UnitInfosFragment = (
  { __typename?: 'CombatUnitStub' }
  & Pick<CombatUnitStub, 'id' | 'name' | 'type' | 'spec' | 'class' | 'reaction'>
  & { info?: Maybe<(
    { __typename?: 'CombatantInfo' }
    & CombatantInfosFragment
  )> }
);

export type CombatInfosFragment = (
  { __typename?: 'CombatDataStub' }
  & Pick<CombatDataStub, 'id' | 'wowVersion' | 'ownerId' | 'result' | 'logObjectUrl' | 'startTime' | 'endTime' | 'playerTeamId' | 'playerTeamRating' | 'hasAdvancedLogging' | 'utcCorrected'>
  & { units: Array<(
    { __typename?: 'CombatUnitStub' }
    & UnitInfosFragment
  )>, startInfo?: Maybe<(
    { __typename?: 'ArenaMatchStartInfo' }
    & StartInfosFragment
  )>, endInfo?: Maybe<(
    { __typename?: 'ArenaMatchEndInfo' }
    & EndInfosFragment
  )> }
);

export type GetPublicMatchesQueryVariables = Exact<{
  wowVersion: Scalars['String'];
  bracket?: Maybe<Scalars['String']>;
  minRating?: Maybe<Scalars['Float']>;
  compQueryString?: Maybe<Scalars['String']>;
  lhsShouldBeWinner?: Maybe<Scalars['Boolean']>;
  offset?: Maybe<Scalars['Int']>;
  count?: Maybe<Scalars['Int']>;
}>;


export type GetPublicMatchesQuery = (
  { __typename?: 'Query' }
  & { latestMatches: (
    { __typename?: 'CombatQueryResult' }
    & Pick<CombatQueryResult, 'queryLimitReached'>
    & { combats: Array<(
      { __typename?: 'CombatDataStub' }
      & CombatInfosFragment
    )> }
  ) }
);

export type GetMyMatchesQueryVariables = Exact<{
  anonymousUserId?: Maybe<Scalars['String']>;
  offset?: Maybe<Scalars['Int']>;
  count?: Maybe<Scalars['Int']>;
}>;


export type GetMyMatchesQuery = (
  { __typename?: 'Query' }
  & { myMatches: (
    { __typename?: 'CombatQueryResult' }
    & Pick<CombatQueryResult, 'queryLimitReached'>
    & { combats: Array<(
      { __typename?: 'CombatDataStub' }
      & CombatInfosFragment
    )> }
  ) }
);

export type GetUserMatchesQueryVariables = Exact<{
  userId: Scalars['String'];
  offset?: Maybe<Scalars['Int']>;
  count?: Maybe<Scalars['Int']>;
}>;


export type GetUserMatchesQuery = (
  { __typename?: 'Query' }
  & { userMatches: (
    { __typename?: 'CombatQueryResult' }
    & Pick<CombatQueryResult, 'queryLimitReached'>
    & { combats: Array<(
      { __typename?: 'CombatDataStub' }
      & CombatInfosFragment
    )> }
  ) }
);

export type GetMatchesWithCombatantQueryVariables = Exact<{
  playerName: Scalars['String'];
}>;


export type GetMatchesWithCombatantQuery = (
  { __typename?: 'Query' }
  & { matchesWithCombatant: Array<(
    { __typename?: 'CombatDataStub' }
    & CombatInfosFragment
  )> }
);

export type GetProfileQueryVariables = Exact<{ [key: string]: never; }>;


export type GetProfileQuery = (
  { __typename?: 'Query' }
  & { me?: Maybe<(
    { __typename?: 'IUser' }
    & Pick<IUser, 'id' | 'battletag' | 'referrer' | 'subscriptionTier' | 'tags'>
  )> }
);

export type SetUserReferrerMutationVariables = Exact<{
  referrer?: Maybe<Scalars['String']>;
}>;


export type SetUserReferrerMutation = (
  { __typename?: 'Mutation' }
  & { setUserReferrer?: Maybe<(
    { __typename?: 'IUser' }
    & Pick<IUser, 'id' | 'battletag' | 'referrer' | 'subscriptionTier'>
  )> }
);

export const ItemInfosFragmentDoc = gql`
    fragment itemInfos on EquippedItem {
  bonuses
  enchants
  gems
  id
  ilvl
}
    `;
export const CombatantInfosFragmentDoc = gql`
    fragment combatantInfos on CombatantInfo {
  teamId
  strength
  agility
  stamina
  intelligence
  dodge
  parry
  block
  critMelee
  critRanged
  critSpell
  speed
  lifesteal
  hasteMelee
  hasteRanged
  hasteSpell
  avoidance
  mastery
  versatilityDamgeDone
  versatilityHealingDone
  versatilityDamageTaken
  armor
  specId
  talents
  pvpTalents
  equipment {
    ...itemInfos
  }
  interestingAurasJSON
  item29
  item30
  personalRating
  highestPvpTier
}
    ${ItemInfosFragmentDoc}`;
export const UnitInfosFragmentDoc = gql`
    fragment unitInfos on CombatUnitStub {
  id
  name
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
export const CombatInfosFragmentDoc = gql`
    fragment combatInfos on CombatDataStub {
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
  playerTeamId
  playerTeamRating
  hasAdvancedLogging
  utcCorrected
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
      ...combatInfos
    }
    queryLimitReached
  }
}
    ${CombatInfosFragmentDoc}`;

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
        return Apollo.useQuery<GetPublicMatchesQuery, GetPublicMatchesQueryVariables>(GetPublicMatchesDocument, baseOptions);
      }
export function useGetPublicMatchesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetPublicMatchesQuery, GetPublicMatchesQueryVariables>) {
          return Apollo.useLazyQuery<GetPublicMatchesQuery, GetPublicMatchesQueryVariables>(GetPublicMatchesDocument, baseOptions);
        }
export type GetPublicMatchesQueryHookResult = ReturnType<typeof useGetPublicMatchesQuery>;
export type GetPublicMatchesLazyQueryHookResult = ReturnType<typeof useGetPublicMatchesLazyQuery>;
export type GetPublicMatchesQueryResult = Apollo.QueryResult<GetPublicMatchesQuery, GetPublicMatchesQueryVariables>;
export const GetMyMatchesDocument = gql`
    query GetMyMatches($anonymousUserId: String = null, $offset: Int = 0, $count: Int = 50) {
  myMatches(anonymousUserId: $anonymousUserId, offset: $offset, count: $count) {
    combats {
      ...combatInfos
    }
    queryLimitReached
  }
}
    ${CombatInfosFragmentDoc}`;

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
        return Apollo.useQuery<GetMyMatchesQuery, GetMyMatchesQueryVariables>(GetMyMatchesDocument, baseOptions);
      }
export function useGetMyMatchesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetMyMatchesQuery, GetMyMatchesQueryVariables>) {
          return Apollo.useLazyQuery<GetMyMatchesQuery, GetMyMatchesQueryVariables>(GetMyMatchesDocument, baseOptions);
        }
export type GetMyMatchesQueryHookResult = ReturnType<typeof useGetMyMatchesQuery>;
export type GetMyMatchesLazyQueryHookResult = ReturnType<typeof useGetMyMatchesLazyQuery>;
export type GetMyMatchesQueryResult = Apollo.QueryResult<GetMyMatchesQuery, GetMyMatchesQueryVariables>;
export const GetUserMatchesDocument = gql`
    query GetUserMatches($userId: String!, $offset: Int = 0, $count: Int = 50) {
  userMatches(userId: $userId, offset: $offset, count: $count) {
    combats {
      ...combatInfos
    }
    queryLimitReached
  }
}
    ${CombatInfosFragmentDoc}`;

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
        return Apollo.useQuery<GetUserMatchesQuery, GetUserMatchesQueryVariables>(GetUserMatchesDocument, baseOptions);
      }
export function useGetUserMatchesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetUserMatchesQuery, GetUserMatchesQueryVariables>) {
          return Apollo.useLazyQuery<GetUserMatchesQuery, GetUserMatchesQueryVariables>(GetUserMatchesDocument, baseOptions);
        }
export type GetUserMatchesQueryHookResult = ReturnType<typeof useGetUserMatchesQuery>;
export type GetUserMatchesLazyQueryHookResult = ReturnType<typeof useGetUserMatchesLazyQuery>;
export type GetUserMatchesQueryResult = Apollo.QueryResult<GetUserMatchesQuery, GetUserMatchesQueryVariables>;
export const GetMatchesWithCombatantDocument = gql`
    query GetMatchesWithCombatant($playerName: String!) {
  matchesWithCombatant(playerName: $playerName) {
    ...combatInfos
  }
}
    ${CombatInfosFragmentDoc}`;

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
        return Apollo.useQuery<GetMatchesWithCombatantQuery, GetMatchesWithCombatantQueryVariables>(GetMatchesWithCombatantDocument, baseOptions);
      }
export function useGetMatchesWithCombatantLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetMatchesWithCombatantQuery, GetMatchesWithCombatantQueryVariables>) {
          return Apollo.useLazyQuery<GetMatchesWithCombatantQuery, GetMatchesWithCombatantQueryVariables>(GetMatchesWithCombatantDocument, baseOptions);
        }
export type GetMatchesWithCombatantQueryHookResult = ReturnType<typeof useGetMatchesWithCombatantQuery>;
export type GetMatchesWithCombatantLazyQueryHookResult = ReturnType<typeof useGetMatchesWithCombatantLazyQuery>;
export type GetMatchesWithCombatantQueryResult = Apollo.QueryResult<GetMatchesWithCombatantQuery, GetMatchesWithCombatantQueryVariables>;
export const GetProfileDocument = gql`
    query GetProfile {
  me {
    id
    battletag
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
        return Apollo.useQuery<GetProfileQuery, GetProfileQueryVariables>(GetProfileDocument, baseOptions);
      }
export function useGetProfileLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetProfileQuery, GetProfileQueryVariables>) {
          return Apollo.useLazyQuery<GetProfileQuery, GetProfileQueryVariables>(GetProfileDocument, baseOptions);
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
        return Apollo.useMutation<SetUserReferrerMutation, SetUserReferrerMutationVariables>(SetUserReferrerDocument, baseOptions);
      }
export type SetUserReferrerMutationHookResult = ReturnType<typeof useSetUserReferrerMutation>;
export type SetUserReferrerMutationResult = Apollo.MutationResult<SetUserReferrerMutation>;
export type SetUserReferrerMutationOptions = Apollo.BaseMutationOptions<SetUserReferrerMutation, SetUserReferrerMutationVariables>;
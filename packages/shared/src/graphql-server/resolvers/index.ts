import { latestMatches, matchesWithCombatant, myMatches, userMatches } from './matches';
import { me, setUserReferrer } from './profile';

export const resolvers = {
  CombatDataStub: {
    __resolveType(obj: any) {
      if (obj.dataType === 'ShuffleRound') {
        return 'ShuffleRoundStub';
      }
      if (obj.dataType === 'ArenaMatch') {
        return 'ArenaMatchDataStub';
      }
      return null; // GraphQLError is thrown
    },
  },
  Query: {
    me,
    latestMatches,
    myMatches,
    userMatches,
    matchesWithCombatant,
  },
  Mutation: {
    setUserReferrer,
  },
};

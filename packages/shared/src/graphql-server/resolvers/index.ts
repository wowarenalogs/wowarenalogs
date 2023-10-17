import { characterMatches, latestMatches, matchById, matchesWithCombatant, myMatches, userMatches } from './matches';
import { me, myCharacters, setUserReferrer } from './profile';

export const resolvers = {
  CombatDataStub: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    myCharacters,
    userMatches,
    characterMatches,
    matchesWithCombatant,
    matchById,
  },
  Mutation: {
    setUserReferrer,
  },
};

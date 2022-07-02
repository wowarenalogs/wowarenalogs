import { latestMatches, myMatches, matchesWithCombatant, userMatches } from './matches';
import { me, setUserReferrer } from './profile';

export const resolvers = {
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

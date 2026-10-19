import { Constants } from '../utils/constants';
import { logDownloadUrl } from './logs';
import {
  characterMatches,
  latestMatches,
  matchById,
  matchesWithOwnerId,
  myMatches,
  recentMatchesWithCombatant,
  userMatches,
} from './matches';
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
  // Field resolvers that build a canonical, viewer-independent link to the match page.
  // Structural param types match the stored Firestore stub shape (shuffleMatchId is
  // injected at stub-creation time, not present on the parser-derived stub types).
  ArenaMatchDataStub: {
    matchLinkURL(stub: { id: string }) {
      return `${Constants.SITE_BASE_URL}/match?id=${stub.id}`;
    },
  },
  ShuffleRoundStub: {
    matchLinkURL(stub: { id: string; shuffleMatchId?: string | null; sequenceNumber: number }) {
      // Shuffle links point at the parent shuffle match + the 1-based round number.
      // shuffleMatchId is absent on older data; fall back to the round's own id.
      const matchId = stub.shuffleMatchId ?? stub.id;
      return `${Constants.SITE_BASE_URL}/match?id=${matchId}&roundId=${stub.sequenceNumber + 1}`;
    },
  },
  Query: {
    me,
    latestMatches,
    myMatches,
    myCharacters,
    userMatches,
    characterMatches,
    matchesWithOwnerId,
    recentMatchesWithCombatant,
    matchById,
    logDownloadUrl,
  },
  Mutation: {
    setUserReferrer,
  },
};

import { PrismaClient } from '@wowarenalogs/sql';
import _ from 'lodash';

import { Bracket } from '../../components/MatchSearch/BracketSelector';
import { UserCharacterInfo } from '../../graphql/__generated__/graphql';
import { ApolloContext, User } from '../types';
import { getUserProfileAsync } from '../utils/getUserProfileAsync';
import { setUserReferrerAsync } from '../utils/setUserReferrerAsync';

export function me(_parent: unknown, _args: Record<string, unknown>, context: ApolloContext): Promise<User | null> {
  return getUserProfileAsync(context);
}

export function setUserReferrer(
  _: unknown,
  args: { referrer: string | null },
  context: ApolloContext,
): Promise<User | null> {
  return setUserReferrerAsync(context, args.referrer);
}

export async function myCharacters(
  _parent: unknown,
  _args: unknown,
  context: ApolloContext,
): Promise<UserCharacterInfo[]> {
  if (context.user == null || context.user.battlenetId == null) {
    return [];
  }

  const prisma = new PrismaClient();

  const characters = await prisma.userCharacter.findMany({
    where: {
      battlenetId: context.user.battlenetId.toString(),
    },
  });

  const playerStatRecords = await prisma.playerStatRecord.findMany({
    where: {
      unitId: {
        in: characters.map((c) => c.characterGuid),
      },
    },
    include: {
      teamRecord: {
        select: {
          teamId: true,
          combatRecord: {
            select: {
              date: true,
              zoneId: true,
              bracket: true,
              effectiveDurationInSeconds: true,
              averageMMR: true,
              winningTeamId: true,
            },
          },
        },
      },
    },
    orderBy: {
      rowId: 'asc',
    },
  });

  return characters
    .map((c) => ({
      character: c,
      records: playerStatRecords.filter((r) => r.unitId === c.characterGuid),
    }))
    .flatMap((c) => {
      return _.map(
        _.groupBy(c.records, (r) => r.spec),
        (records, spec) => ({
          character: c.character,
          spec,
          records,
        }),
      );
    })
    .map((c) => ({
      characterName: c.character.characterName,
      guid: c.character.characterGuid,
      specId: c.spec,
      bracketStats: _.map(
        _.groupBy(c.records, (r) => r.teamRecord.combatRecord.bracket),
        (records, bracket) => ({
          bracket: bracket as Bracket,
          highestRating: _.maxBy(records, (r) => r.rating)?.rating ?? 0,
          latestRating: _.last(records)?.rating ?? 0,
          wins: records.filter((r) => r.teamRecord.combatRecord.winningTeamId === r.teamRecord.teamId).length,
          losses: records.filter((r) => r.teamRecord.combatRecord.winningTeamId !== r.teamRecord.teamId).length,
        }),
      ),
    }));
}

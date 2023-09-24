import { PrismaClient } from '@wowarenalogs/sql';
import _ from 'lodash';
import moment from 'moment';

import {
  AtomicArenaCombat,
  CombatUnitAffiliation,
  CombatUnitSpec,
  CombatUnitType,
  getBurstDps,
  getEffectiveCombatDuration,
  getEffectiveDps,
  getEffectiveHps,
  IArenaMatch,
  IShuffleMatch,
  WoWCombatLogParser,
  WowVersion,
} from '../../parser/dist/index';
import { FirebaseDTO } from './createMatchStub';

type ParseResult = {
  arenaMatches: IArenaMatch[];
  shuffleMatches: IShuffleMatch[];
};

export function parseFromStringArrayAsync(
  buffer: string[],
  wowVersion: WowVersion,
  timezone?: string,
): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const logParser = new WoWCombatLogParser(wowVersion, timezone);

    const results: ParseResult = {
      arenaMatches: [],
      shuffleMatches: [],
    };

    try {
      logParser.on('arena_match_ended', (data: IArenaMatch) => {
        results.arenaMatches.push(data);
      });

      logParser.on('solo_shuffle_ended', (data: IShuffleMatch) => {
        results.shuffleMatches.push(data);
      });
      // TODO: Handle on error here?

      for (const line of buffer) {
        logParser.parseLine(line);
      }
      logParser.flush();
    } catch (e) {
      reject(e);
    }

    resolve(results);
  });
}

export const logCombatStatsAsync = async (combat: AtomicArenaCombat, stub: FirebaseDTO, ownerId: string) => {
  const prisma = new PrismaClient();

  const averageMMR = stub.extra.matchAverageMMR;
  const players = _.values(combat.units).filter((u) => u.type === CombatUnitType.Player);
  const ownerPlayer = players.find((u) => u.affiliation === CombatUnitAffiliation.Mine);

  if (ownerPlayer && ownerId && ownerId !== 'unknown-uploader') {
    await prisma.userCharacter.upsert({
      where: {
        battlenetId_characterName: {
          battlenetId: ownerId,
          characterName: ownerPlayer.name,
        },
      },
      update: {},
      create: {
        battlenetId: ownerId,
        characterName: ownerPlayer.name,
      },
    });
  }

  const team0specs = players
    .filter((u) => u.info?.teamId === '0')
    .map((u) => (u.spec === CombatUnitSpec.None ? `c${u.class}` : u.spec))
    .sort()
    .join('_');
  const team1specs = players
    .filter((u) => u.info?.teamId === '1')
    .map((u) => (u.spec === CombatUnitSpec.None ? `c${u.class}` : u.spec))
    .sort()
    .join('_');
  const teamSpecs = [team0specs, team1specs];
  const allPlayerDeath = _.sortBy(
    _.flatMap(players, (p) => {
      return p.deathRecords.map((r) => {
        return {
          unit: p,
          deathRecord: r,
        };
      });
    }),
    (r) => r.deathRecord.timestamp,
  );
  const firstBloodUnitId = allPlayerDeath[0]?.unit.id;
  const effectiveDuration = getEffectiveCombatDuration(combat);

  await prisma.combatStatRecord.create({
    data: {
      combatId: combat.id,
      date: moment(combat.startTime).format('YYYY-MM-DD'),
      bracket: combat.startInfo.bracket,
      zoneId: combat.startInfo.zoneId,
      durationInSeconds: combat.durationInSeconds,
      effectiveDurationInSeconds: effectiveDuration,
      averageMMR: averageMMR,
      logOwnerUnitId: combat.playerId,
      logOwnerTeamId: parseInt(combat.playerTeamId),
      logOwnerResult: combat.result,
      winningTeamId: parseInt(combat.winningTeamId),
      teamRecords: {
        create: ['0', '1'].map((teamId) => {
          const teamPlayers = players.filter((u) => u.info?.teamId === teamId);
          const burstDps = getBurstDps(teamPlayers);
          const effectiveDps = getEffectiveDps(teamPlayers, effectiveDuration);
          const effectiveHps = getEffectiveHps(teamPlayers, effectiveDuration);

          const killTargetSpec = teamPlayers.find((p) => p.id === firstBloodUnitId)?.spec ?? CombatUnitSpec.None;

          return {
            specs: teamSpecs[parseInt(teamId)],
            teamId: parseInt(teamId),
            burstDps: burstDps,
            effectiveDps: effectiveDps,
            effectiveHps: effectiveHps,
            killTargetSpec: killTargetSpec,
            playerRecords: {
              create: teamPlayers.map((p) => {
                const burstDps = getBurstDps([p]);
                const effectiveDps = getEffectiveDps([p], effectiveDuration);
                const effectiveHps = getEffectiveHps([p], effectiveDuration);
                const isKillTarget = p.id === firstBloodUnitId;

                return {
                  unitId: p.id,
                  name: p.name,
                  rating: p.info?.personalRating ?? 0,
                  spec: p.spec,
                  burstDps: burstDps,
                  effectiveDps: effectiveDps,
                  effectiveHps: effectiveHps,
                  isKillTarget: isKillTarget,
                };
              }),
            },
          };
        }),
      },
    },
  });

  prisma.$disconnect();
};

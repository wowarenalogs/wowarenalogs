import _ from 'lodash';
import moment from 'moment';

import {
  AtomicArenaCombat,
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
import { CombatStatRecord } from './schema/combat';
import { SQLDB } from './schema/connection';
import { PlayerStatRecord } from './schema/player';
import { TeamStatRecord } from './schema/team';

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

export const logCombatStatsAsync = async (combat: AtomicArenaCombat) => {
  if (!SQLDB.isInitialized) {
    await SQLDB.initialize();
  }

  const averageMMR =
    combat.dataType === 'ArenaMatch'
      ? ((combat.endInfo?.team0MMR || 0) + (combat.endInfo?.team1MMR || 0)) / 2
      : ((combat.shuffleMatchEndInfo?.team0MMR || 0) + (combat.shuffleMatchEndInfo?.team1MMR || 0)) / 2;
  const players = _.values(combat.units).filter((u) => u.type === CombatUnitType.Player);
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

  const combatStatRecord = new CombatStatRecord();
  combatStatRecord.combatId = combat.id;
  combatStatRecord.date = moment(combat.startTime).format('YYYY-MM-DD');
  combatStatRecord.bracket = combat.startInfo.bracket;
  combatStatRecord.zoneId = combat.startInfo.zoneId;
  combatStatRecord.durationInSeconds = combat.durationInSeconds;
  combatStatRecord.effectiveDurationInSeconds = effectiveDuration;
  combatStatRecord.averageMMR = averageMMR;
  combatStatRecord.logOwnerUnitId = combat.playerId;
  combatStatRecord.logOwnerTeamId = parseInt(combat.playerTeamId);
  combatStatRecord.logOwnerResult = combat.result;
  combatStatRecord.winningTeamId = parseInt(combat.winningTeamId);
  combatStatRecord.teamRecords = ['0', '1'].map((teamId) => {
    const teamPlayers = players.filter((u) => u.info?.teamId === teamId);
    const burstDps = getBurstDps(teamPlayers);
    const effectiveDps = getEffectiveDps(teamPlayers, effectiveDuration);
    const effectiveHps = getEffectiveHps(teamPlayers, effectiveDuration);

    const killTargetSpec = teamPlayers.find((p) => p.id === firstBloodUnitId)?.spec ?? CombatUnitSpec.None;

    const teamRecord = new TeamStatRecord();
    teamRecord.specs = teamSpecs[parseInt(teamId)];
    teamRecord.teamId = parseInt(teamId);
    teamRecord.burstDps = burstDps;
    teamRecord.effectiveDps = effectiveDps;
    teamRecord.effectiveHps = effectiveHps;
    teamRecord.killTargetSpec = killTargetSpec;
    teamRecord.playerRecords = teamPlayers.map((p) => {
      const burstDps = getBurstDps([p]);
      const effectiveDps = getEffectiveDps([p], effectiveDuration);
      const effectiveHps = getEffectiveHps([p], effectiveDuration);
      const isKillTarget = p.id === firstBloodUnitId;

      const playerRecord = new PlayerStatRecord();
      playerRecord.unitId = p.id;
      playerRecord.name = p.name;
      playerRecord.rating = p.info?.personalRating ?? 0;
      playerRecord.spec = p.spec;
      playerRecord.burstDps = burstDps;
      playerRecord.effectiveDps = effectiveDps;
      playerRecord.effectiveHps = effectiveHps;
      playerRecord.isKillTarget = isKillTarget;

      return playerRecord;
    });

    return teamRecord;
  });

  await SQLDB.manager.save(combatStatRecord);
};

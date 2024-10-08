import * as Sentry from '@sentry/react';
import {
  AtomicArenaCombat,
  buildQueryHelpers,
  CombatResult,
  CombatUnitSpec,
  CombatUnitType,
  getBurstDps,
  getEffectiveCombatDuration,
  getEffectiveDps,
  getEffectiveHps,
  IActivityStarted,
} from '@wowarenalogs/parser';
import {
  ArenaMatchMetadata,
  canUseFeature,
  features,
  logAnalyticsEvent,
  ShuffleMatchMetadata,
  uploadCombatAsync,
  useAuth,
  useClientContext,
} from '@wowarenalogs/shared';
import _ from 'lodash';
import moment from 'moment';
import React, { useContext, useEffect, useState } from 'react';

import { useAppConfig } from '../AppConfigContext';

interface ILocalCombatsContextData {
  localCombats: AtomicArenaCombat[];
}

const LocalCombatsContext = React.createContext<ILocalCombatsContextData>({
  localCombats: [],
});

interface IProps {
  children: React.ReactNode | React.ReactNode[];
}

/** How long after the ARENA_END_EVENT the recording will continue
 * The default of 0 means the score screen won't show up ;)
 */
const MATCH_OVERRUN_SECONDS = 3;

const logCombatAnalyticsAsync = async (combat: AtomicArenaCombat) => {
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
  const indices = buildQueryHelpers(combat, true);
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

  // google analytics limitations:
  // - event names can be up to 40 characters long
  // - property names must be 40 characters or less
  // - property values must be 100 characters or less
  // - less than 25 properties
  const commonProperties = {
    // increment this version whenever the schema has breaking changes
    eventSchemaVersion: 0,
    wowVersion: combat.wowVersion,
    combatId: combat.id,
    date: moment(combat.startTime).format('YYYY-MM-DD'),
    bracket: combat.startInfo.bracket,
    zoneId: combat.startInfo.zoneId,
    durationInSeconds: combat.durationInSeconds,
    effectiveDurationInSeconds: effectiveDuration,
    averageMMR,
    playerResult: combat.result,
    playerId: combat.playerId,
    playerTeamId: combat.playerTeamId,
    winningTeamId: combat.winningTeamId,
  };

  logAnalyticsEvent('event_NewMatchProcessed', {
    ...commonProperties,
    winningTeamSpecs: combat.winningTeamId === '0' ? team0specs : team1specs,
    losingTeamSpecs: combat.winningTeamId === '1' ? team0specs : team1specs,
    singleSidedSpecIndices: `|${indices.singleSidedSpecs.join('|')}|`,
  });

  // following events are only meaningful if the match has a winner
  if (
    (combat.result !== CombatResult.Win && combat.result !== CombatResult.Lose) ||
    (combat.winningTeamId !== '0' && combat.winningTeamId !== '1')
  ) {
    return;
  }

  ['0', '1'].forEach((teamId) => {
    const teamPlayers = players.filter((u) => u.info?.teamId === teamId);
    const burstDps = getBurstDps(teamPlayers);
    const effectiveDps = getEffectiveDps(teamPlayers, effectiveDuration);
    const effectiveHps = getEffectiveHps(teamPlayers, effectiveDuration);

    const killTargetSpec = teamPlayers.find((p) => p.id === firstBloodUnitId)?.spec ?? '';

    logAnalyticsEvent('event_NewCompRecord', {
      ...commonProperties,
      specs: teamSpecs[parseInt(teamId)],
      teamId,
      isPlayerTeam: combat.playerTeamId === teamId,
      result: combat.winningTeamId === teamId ? 'win' : 'lose',
      burstDps,
      effectiveDps,
      effectiveHps,
      killTargetSpec,
    });
  });

  players.forEach((p) => {
    const burstDps = getBurstDps([p]);
    const effectiveDps = getEffectiveDps([p], effectiveDuration);
    const effectiveHps = getEffectiveHps([p], effectiveDuration);
    const isKillTarget = p.id === firstBloodUnitId;

    logAnalyticsEvent('event_NewPlayerRecord', {
      ...commonProperties,
      name: p.name,
      rating: p.info?.personalRating ?? 0,
      highestPvpTier: p.info?.highestPvpTier ?? 0,
      spec: p.spec,
      teamId: p.info?.teamId ?? '',
      isPlayer: p.id === combat.playerId,
      isPlayerTeam: p.info?.teamId === combat.playerTeamId,
      result: p.info?.teamId === combat.winningTeamId ? 'win' : 'lose',
      burstDps,
      effectiveDps,
      effectiveHps,
      isKillTarget: isKillTarget ? 1 : 0,
    });
  });
};

let currentActivity: IActivityStarted | null = null;

export const LocalCombatsContextProvider = (props: IProps) => {
  const [combats, setCombats] = useState<AtomicArenaCombat[]>([]);
  const auth = useAuth();
  const { wowInstallations } = useAppConfig();
  const { localFlags } = useClientContext();
  const shouldSkipUpload = canUseFeature(features.skipUploads, undefined, localFlags);

  useEffect(() => {
    const cleanups = Array.from(wowInstallations.entries()).map((installRow) => {
      const [wowVersion, wowDirectory] = installRow;
      window.wowarenalogs.logs?.startLogWatcher(wowDirectory, wowVersion);

      window.wowarenalogs.logs?.handleLogReadingTimeout?.((_event, _wowVersion, _timeout) => {
        // Handle cases where parser has failed and not read any valid data in `_timeout` time and we are still
        // recording video
        // when this comment was written _timeout was 60s
        if (currentActivity) {
          window.wowarenalogs.obs?.stopRecording?.({
            startDate: currentActivity.arenaMatchStartInfo?.timestamp
              ? new Date(currentActivity.arenaMatchStartInfo?.timestamp)
              : new Date(),
            endDate: new Date(),
            overrun: MATCH_OVERRUN_SECONDS,
            fileName: `WoW_Arena_Logs_Error_${currentActivity.arenaMatchStartInfo?.timestamp}`,
          });
          currentActivity = null;
        }
      });

      if (window.wowarenalogs.logs?.handleActivityStarted) {
        window.wowarenalogs.logs.handleActivityStarted((_nodeEvent, activityStartedEvent) => {
          // eslint-disable-next-line no-console
          console.log('Started activity', activityStartedEvent);
          if (!currentActivity) {
            if (activityStartedEvent.arenaMatchStartInfo?.zoneId) {
              currentActivity = activityStartedEvent;
              window.wowarenalogs.obs?.startRecording?.();
            }
          }
        });
      }

      window.wowarenalogs.logs?.handleBattlegroundEnded?.((_event, bg) => {
        // eslint-disable-next-line no-console
        console.log(bg);
        logAnalyticsEvent('BattlegroundEnded', {
          instanceId: bg.zoneInEvent.instanceId,
          bgName: bg.zoneInEvent.zoneName,
          playerCount: _.values(bg.units).filter((p) => p.type === CombatUnitType.Player).length,
        });
      });

      window.wowarenalogs.logs?.handleNewCombat((_event, combat) => {
        if (wowVersion === combat.wowVersion) {
          if (currentActivity) {
            const metadata: ArenaMatchMetadata = {
              startInfo: combat.startInfo,
              endInfo: combat.endInfo,
              wowVersion: combat.wowVersion,
              id: combat.id,
              dataType: 'ArenaMatchMetadata',
              timezone: combat.timezone,
              startTime: combat.startTime,
              endTime: combat.endTime,
              playerId: combat.playerId,
              playerTeamId: combat.playerTeamId,
              result: combat.result,
              durationInSeconds: combat.durationInSeconds,
              winningTeamId: combat.endInfo.winningTeamId,
            };

            currentActivity = null;
            window.wowarenalogs.obs?.stopRecording &&
              window.wowarenalogs.obs.stopRecording({
                startDate: new Date(combat.startTime),
                endDate: new Date(combat.endTime),
                metadata,
                overrun: MATCH_OVERRUN_SECONDS,
                fileName: `${combat.startInfo.bracket}_${combat.id}`,
              });
          }
          if (!shouldSkipUpload)
            uploadCombatAsync(combat, auth.battlenetId).then((r) => {
              if (!r.matchExists || process.env.NODE_ENV === 'development') {
                logCombatAnalyticsAsync(combat);
              }
            });

          setCombats((prev) => {
            return prev.concat([combat]);
          });
        }
      });

      window.wowarenalogs.logs?.handleSoloShuffleRoundEnded((_event, combat) => {
        if (wowVersion === combat.wowVersion) {
          setCombats((prev) => {
            return prev.concat([combat]);
          });
        }
      });

      window.wowarenalogs.logs?.handleSoloShuffleEnded((_event, combat) => {
        const metadata: ShuffleMatchMetadata = {
          startInfo: combat.startInfo,
          endInfo: combat.endInfo,
          wowVersion: combat.wowVersion,
          id: combat.id,
          dataType: 'ShuffleMatchMetadata',
          timezone: combat.timezone,
          startTime: combat.startTime,
          endTime: combat.endTime,
          playerId: combat.rounds[0].playerId,
          playerTeamId: combat.rounds[0].playerTeamId,
          result: combat.result,
          roundStarts: combat.rounds.map((r) => ({
            startInfo: r.startInfo,
            sequenceNumber: r.sequenceNumber,
            id: r.id,
          })),
          durationInSeconds: combat.durationInSeconds,
          winningTeamId: combat.endInfo.winningTeamId,
        };

        if (wowVersion === combat.wowVersion) {
          if (currentActivity) {
            // eslint-disable-next-line no-console
            currentActivity = null;
            window.wowarenalogs.obs?.stopRecording &&
              window.wowarenalogs.obs.stopRecording({
                startDate: new Date(combat.startTime),
                endDate: new Date(combat.endTime),
                metadata,
                overrun: MATCH_OVERRUN_SECONDS,
                fileName: `${combat.startInfo.bracket}_${combat.id}`,
              });
          }

          if (!shouldSkipUpload)
            uploadCombatAsync(combat, auth.battlenetId).then((r) => {
              if (!r.matchExists || process.env.NODE_ENV === 'development') {
                combat.rounds.forEach((round) => {
                  round.shuffleMatchEndInfo = combat.endInfo;
                  round.shuffleMatchResult = combat.result;
                  logCombatAnalyticsAsync(round);
                });
              }
            });
        }
      });

      window.wowarenalogs.logs?.handleMalformedCombatDetected((_event, combat) => {
        if (wowVersion === combat.wowVersion) {
          if (currentActivity) {
            currentActivity = null;
            window.wowarenalogs.obs?.stopRecording &&
              window.wowarenalogs.obs.stopRecording({
                startDate: new Date(combat.startTime),
                endDate: new Date(),
                overrun: MATCH_OVERRUN_SECONDS,
                fileName: `WoW_Arena_Logs_Error_${combat.id}`,
              });
          }
          // eslint-disable-next-line no-console
          console.log('Malformed combat');
          // eslint-disable-next-line no-console
          console.log(combat);
        }
      });

      if (window.wowarenalogs.logs?.handleParserError) {
        window.wowarenalogs.logs.handleParserError((_event, error) => {
          Sentry.captureException(error);
        });
      }

      return () => {
        window.wowarenalogs.logs?.stopLogWatcher();
        window.wowarenalogs.logs?.removeAll_handleNewCombat_listeners();
        window.wowarenalogs.logs?.removeAll_handleMalformedCombatDetected_listeners();
        window.wowarenalogs.logs?.removeAll_handleSoloShuffleEnded_listeners();
        window.wowarenalogs.logs?.removeAll_handleSoloShuffleRoundEnded_listeners();
        window.wowarenalogs.logs?.removeAll_handleParserError_listeners?.();
        window.wowarenalogs.logs?.removeAll_handleActivityStarted_listeners?.();
        window.wowarenalogs.logs?.removeAll_handleLogReadingTimeout_listeners?.();
        setCombats([]);
      };
    });
    return () => {
      cleanups.forEach((cleanup) => {
        cleanup();
      });
    };
  }, [wowInstallations, auth.userId, auth.battlenetId, shouldSkipUpload]);

  return (
    <LocalCombatsContext.Provider
      value={{
        localCombats: combats,
      }}
    >
      {props.children}
    </LocalCombatsContext.Provider>
  );
};

export const useLocalCombats = () => {
  return useContext(LocalCombatsContext);
};

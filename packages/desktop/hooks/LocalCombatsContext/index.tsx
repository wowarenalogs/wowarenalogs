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
} from '@wowarenalogs/parser';
import { logAnalyticsEvent, uploadCombatAsync, useAuth } from '@wowarenalogs/shared';
import _ from 'lodash';
import moment from 'moment';
import React, { useContext, useEffect, useState } from 'react';

import { useAppConfig } from '../AppConfigContext';

interface ILocalCombatsContextData {
  localCombats: AtomicArenaCombat[];
  appendCombat: (combat: AtomicArenaCombat) => void;
}

const LocalCombatsContext = React.createContext<ILocalCombatsContextData>({
  localCombats: [],
  appendCombat: () => {
    return;
  },
});

interface IProps {
  children: React.ReactNode | React.ReactNode[];
}

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

export const LocalCombatsContextProvider = (props: IProps) => {
  const [combats, setCombats] = useState<AtomicArenaCombat[]>([]);
  const auth = useAuth();
  const { wowInstallations } = useAppConfig();

  useEffect(() => {
    const cleanups = Array.from(wowInstallations.entries()).map((installRow) => {
      const [wowVersion, wowDirectory] = installRow;
      window.wowarenalogs.logs?.startLogWatcher(wowDirectory, wowVersion);

      window.wowarenalogs.logs?.handleNewCombat((_event, combat) => {
        if (wowVersion === combat.wowVersion) {
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
        if (wowVersion === combat.wowVersion) {
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
          // eslint-disable-next-line no-console
          console.log('Malformed combat');
          // eslint-disable-next-line no-console
          console.log(combat);
        }
      });

      return () => {
        window.wowarenalogs.logs?.stopLogWatcher();
        window.wowarenalogs.logs?.removeAll_handleNewCombat_listeners();
        window.wowarenalogs.logs?.removeAll_handleMalformedCombatDetected_listeners();
        window.wowarenalogs.logs?.removeAll_handleSoloShuffleEnded_listeners();
        window.wowarenalogs.logs?.removeAll_handleSoloShuffleRoundEnded_listeners();
        setCombats([]);
      };
    });
    return () => {
      cleanups.forEach((cleanup) => {
        cleanup();
      });
    };
  }, [wowInstallations, auth.userId, auth.battlenetId]);

  return (
    <LocalCombatsContext.Provider
      value={{
        localCombats: combats,
        appendCombat: (combat) => {
          setCombats((prev) => {
            return prev.concat(combat);
          });
        },
      }}
    >
      {props.children}
    </LocalCombatsContext.Provider>
  );
};

export const useLocalCombats = () => {
  return useContext(LocalCombatsContext);
};

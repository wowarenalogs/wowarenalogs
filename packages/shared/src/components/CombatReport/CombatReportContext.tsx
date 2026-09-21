import { AtomicArenaCombat, CombatUnitReaction, ICombatUnit, IShuffleRound } from '@wowarenalogs/parser';
import _ from 'lodash';
import React, { useContext, useEffect, useMemo, useState } from 'react';

import { computeCombatStats, getCombatPlayers } from '../../utils/combatStats';

interface ICombatReportContextData {
  viewerIsOwner: boolean;
  combat: AtomicArenaCombat | null;
  shuffleRounds: IShuffleRound[];
  navigateToRound: ((round: IShuffleRound) => void) | null;
  canSelectRound: boolean;
  activePlayerId: string | null;
  navigateToPlayerView: (playerId: string) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  players: ICombatUnit[];
  friends: ICombatUnit[];
  enemies: ICombatUnit[];
  maxOutputNumber: number;
  playerTotalDamageOut: Map<string, number>;
  playerTotalHealOut: Map<string, number>;
  playerTotalSupportIn: Map<string, number>;
  playerTimeInCC: Map<string, number>;
  playerCCOutput: Map<string, number>;
  playerInterruptsDone: Map<string, number>;
  playerInterruptsTaken: Map<string, number>;
}

export const CombatReportContext = React.createContext<ICombatReportContextData>({
  combat: null,
  shuffleRounds: [],
  navigateToRound: null,
  canSelectRound: false,
  viewerIsOwner: true,
  activePlayerId: null,
  navigateToPlayerView: (_playerId: string) => {
    return;
  },
  activeTab: 'summary',
  setActiveTab: (_tab: string) => {
    return;
  },
  players: [],
  friends: [],
  enemies: [],
  maxOutputNumber: 0,
  playerTotalDamageOut: new Map<string, number>(),
  playerTotalHealOut: new Map<string, number>(),
  playerTotalSupportIn: new Map<string, number>(),
  playerTimeInCC: new Map<string, number>(),
  playerCCOutput: new Map<string, number>(),
  playerInterruptsDone: new Map<string, number>(),
  playerInterruptsTaken: new Map<string, number>(),
});

interface IProps {
  combat: AtomicArenaCombat;
  shuffleRounds?: IShuffleRound[];
  onRoundSelected?: (round: IShuffleRound) => void;
  viewerIsOwner: boolean;
  children: React.ReactNode | React.ReactNode[];
}

export const CombatReportContextProvider = (props: IProps) => {
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('summary');
  const shuffleRounds = useMemo(() => props.shuffleRounds ?? [], [props.shuffleRounds]);

  const [
    players,
    friends,
    enemies,
    maxOutputNumber,
    playerTotalDamageOut,
    playerTotalHealOut,
    playerTimeInCC,
    playerCCOutput,
    playerInterruptsDone,
    playerInterruptsTaken,
    playerTotalSupportIn,
  ] = useMemo(() => {
    // The same numbers the cloud writes onto the match stub at ingest time.
    const stats = computeCombatStats(props.combat);

    const mPlayers = _.orderBy(getCombatPlayers(props.combat), ['reaction', 'name'], ['desc', 'asc']);
    const mFriends = _.sortBy(
      mPlayers.filter((p) => p.reaction === CombatUnitReaction.Friendly),
      ['class', 'name'],
    );
    const mEnemies = _.sortBy(
      mPlayers.filter((p) => p.reaction === CombatUnitReaction.Hostile),
      ['class', 'name'],
    );
    const mPlayerTotalDamageOut = new Map<string, number>();
    const mPlayerTotalHealOut = new Map<string, number>();
    const mPlayerTotalSupportIn = new Map<string, number>();
    const mPlayerTimeInCC = new Map<string, number>();
    const mPlayerCCOutput = new Map<string, number>();
    const mPlayerInterruptsDone = new Map<string, number>();
    const mPlayerInterruptsTaken = new Map<string, number>();

    let mMaxOutputNumber = 0;
    mPlayers.forEach((p) => {
      const unitStats = stats.units[p.id];
      if (!unitStats) {
        return;
      }

      mPlayerTimeInCC.set(p.id, unitStats.ccTakenInMilliseconds);
      mPlayerCCOutput.set(p.id, unitStats.ccDoneInMilliseconds);
      mPlayerTotalDamageOut.set(p.id, unitStats.damageDone);
      mPlayerTotalSupportIn.set(p.id, unitStats.supportDamageIn);
      mPlayerTotalHealOut.set(p.id, unitStats.healingDone);
      mPlayerInterruptsDone.set(p.id, unitStats.interruptsDone);
      mPlayerInterruptsTaken.set(p.id, unitStats.interruptsTaken);

      // healingDone folds in absorbs; the meters have always scaled on raw healing.
      mMaxOutputNumber = Math.max(mMaxOutputNumber, unitStats.damageDone, unitStats.healingDone - unitStats.absorbDone);
    });
    return [
      mPlayers,
      mFriends,
      mEnemies,
      mMaxOutputNumber,
      mPlayerTotalDamageOut,
      mPlayerTotalHealOut,
      mPlayerTimeInCC,
      mPlayerCCOutput,
      mPlayerInterruptsDone,
      mPlayerInterruptsTaken,
      mPlayerTotalSupportIn,
    ];
  }, [props.combat]);

  useEffect(() => {
    if (players && players.length > 0) {
      setActivePlayerId((prev) => (prev && players.some((p) => p.id === prev) ? prev : players[0].id));
    } else {
      setActivePlayerId(null);
    }
  }, [players]);

  const combatGroupId =
    props.combat.dataType === 'ShuffleRound' && shuffleRounds.length > 0 ? shuffleRounds[0].id : props.combat.id;
  useEffect(() => {
    setActiveTab('summary');
  }, [combatGroupId]);

  return (
    <CombatReportContext.Provider
      value={{
        players,
        friends,
        enemies,
        activePlayerId,
        navigateToPlayerView: (playerId: string) => {
          setActivePlayerId(playerId);
          setActiveTab('players');
        },
        activeTab,
        setActiveTab,
        maxOutputNumber,
        playerTotalDamageOut,
        playerTotalHealOut,
        playerTimeInCC,
        playerCCOutput,
        playerInterruptsDone,
        playerInterruptsTaken,
        playerTotalSupportIn,
        combat: props.combat,
        shuffleRounds,
        navigateToRound: props.onRoundSelected ?? null,
        canSelectRound: props.combat.dataType === 'ShuffleRound' && !!props.onRoundSelected && shuffleRounds.length > 1,
        viewerIsOwner: props.viewerIsOwner,
      }}
    >
      {props.children}
    </CombatReportContext.Provider>
  );
};

export const useCombatReportContext = () => {
  const contextData = useContext(CombatReportContext);
  return contextData;
};

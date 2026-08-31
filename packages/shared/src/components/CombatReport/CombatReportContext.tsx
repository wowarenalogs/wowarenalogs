import {
  AtomicArenaCombat,
  CombatUnitReaction,
  CombatUnitType,
  ICombatUnit,
  IShuffleRound,
  LogEvent,
} from '@wowarenalogs/parser';
import _ from 'lodash';
import React, { useContext, useEffect, useMemo, useState } from 'react';

import { ccSpellIds } from '../../data/spellTags';

interface ICombatReportContextData {
  viewerIsOwner: boolean;
  combat: AtomicArenaCombat | null;
  /**
   * All rounds of the solo shuffle the currently viewed combat belongs to.
   * Empty when the viewer only has a single combat available (or it isn't a shuffle).
   */
  shuffleRounds: IShuffleRound[];
  /**
   * Switches the report to another round of the same shuffle.
   * Null when the host of the report cannot navigate between rounds.
   */
  navigateToRound: ((round: IShuffleRound) => void) | null;
  /**
   * True when the report is showing a shuffle round the viewer can navigate away from.
   */
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
  const shuffleRounds = useMemo(
    () => _.sortBy(props.shuffleRounds ?? [], (r) => r.sequenceNumber),
    [props.shuffleRounds],
  );

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
    const mPlayers = _.orderBy(
      _.values(props.combat.units).filter(
        (u) =>
          u.type === CombatUnitType.Player &&
          (u.reaction === CombatUnitReaction.Friendly || u.reaction === CombatUnitReaction.Hostile),
      ),
      ['reaction', 'name'],
      ['desc', 'asc'],
    );
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
      let totalTimeInCC = 0;
      let ccStartTime = -1;
      let ccStack = 0;
      for (let i = 0; i < p.auraEvents.length; ++i) {
        const event = p.auraEvents[i];
        const spellId = event.spellId || '';
        if (!ccSpellIds.has(spellId)) {
          continue;
        }
        switch (event.logLine.event) {
          case LogEvent.SPELL_AURA_APPLIED:
            if (ccStartTime < 0) {
              ccStartTime = event.logLine.timestamp;
            }
            ccStack++;
            break;
          case LogEvent.SPELL_AURA_REMOVED:
            ccStack--;
            if (ccStack === 0) {
              totalTimeInCC += event.logLine.timestamp - ccStartTime;
              ccStartTime = -1;
            }
            break;
        }
      }
      mPlayerTimeInCC.set(p.id, totalTimeInCC);

      let totalCCOutput = 0;
      mPlayers.forEach((target) => {
        ccStartTime = -1;
        ccStack = 0;
        let targetTimeInCC = 0;
        for (let i = 0; i < target.auraEvents.length; ++i) {
          const event = target.auraEvents[i];
          const spellId = event.spellId || '';
          if (!ccSpellIds.has(spellId) || event.srcUnitId !== p.id) {
            continue;
          }
          switch (event.logLine.event) {
            case LogEvent.SPELL_AURA_APPLIED:
              if (ccStartTime < 0) {
                ccStartTime = event.logLine.timestamp;
              }
              ccStack++;
              break;
            case LogEvent.SPELL_AURA_REMOVED:
              ccStack--;
              if (ccStack === 0) {
                targetTimeInCC += event.logLine.timestamp - ccStartTime;
                ccStartTime = -1;
              }
              break;
          }
        }
        totalCCOutput += targetTimeInCC;
      });
      mPlayerCCOutput.set(p.id, totalCCOutput);

      const totalDamageOut = p.damageOut.reduce((sum, action) => {
        return sum + Math.abs(action.effectiveAmount);
      }, 0);
      mPlayerTotalDamageOut.set(p.id, totalDamageOut);

      const totalSupportIn = p.supportDamageIn.reduce((sum, action) => {
        return sum + Math.abs(action.effectiveAmount);
      }, 0);
      mPlayerTotalSupportIn.set(p.id, totalSupportIn);

      const totalHealOut = p.healOut.reduce((sum, action) => {
        if (action.logLine.event === 'SPELL_PERIODIC_HEAL') {
          // TODO: the parser needs to give us more info about overhealing
          return sum + (action.logLine.parameters[30] - action.logLine.parameters[32]);
        }
        if (action.logLine.event === 'SPELL_HEAL') {
          // TODO: the parser needs to give us more info about overhealing
          return sum + (action.logLine.parameters[30] - action.logLine.parameters[32]);
        }
        return sum + Math.abs(action.effectiveAmount);
      }, 0);
      const totalPrevented = p.absorbsOut.reduce((sum, action) => {
        return sum + Math.abs(action.effectiveAmount);
      }, 0);
      mPlayerTotalHealOut.set(p.id, totalHealOut + totalPrevented);

      mMaxOutputNumber = Math.max(mMaxOutputNumber, totalDamageOut, totalHealOut);

      const totalInterruptsDone = p.actionOut.filter((l) => l.logLine.event === LogEvent.SPELL_INTERRUPT).length;
      mPlayerInterruptsDone.set(p.id, totalInterruptsDone);

      const totalInterruptsTaken = p.actionIn.filter((l) => l.logLine.event === LogEvent.SPELL_INTERRUPT).length;
      mPlayerInterruptsTaken.set(p.id, totalInterruptsTaken);
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
      // The same 6 players appear in every round of a shuffle, so keep the viewer on the
      // player they were looking at when they switch rounds.
      setActivePlayerId((prev) => (prev && players.some((p) => p.id === prev) ? prev : players[0].id));
    } else {
      setActivePlayerId(null);
    }
  }, [players]);

  // Switching between rounds of the same shuffle keeps the current tab - only moving to a
  // different match resets the report back to the summary.
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

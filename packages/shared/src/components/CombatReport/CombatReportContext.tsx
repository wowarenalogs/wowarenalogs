import { CombatUnitReaction, CombatUnitType, ICombatData, ICombatUnit, LogEvent } from '@wowarenalogs/parser';
import _ from 'lodash';
import React, { useContext, useMemo } from 'react';

import { ccSpellIds } from '../../data/spellTags';

interface ICombatReportContextData {
  isAnonymized: boolean;
  combat: ICombatData | null;
  navigateToPlayerView: (unitId: string) => void;
  players: ICombatUnit[];
  friends: ICombatUnit[];
  enemies: ICombatUnit[];
  maxOutputNumber: number;
  playerTotalDamageOut: Map<string, number>;
  playerTotalHealOut: Map<string, number>;
  playerTimeInCC: Map<string, number>;
  playerInterrupts: Map<string, number>;
}

export const CombatReportContext = React.createContext<ICombatReportContextData>({
  combat: null,
  isAnonymized: true,
  navigateToPlayerView: (_unitId) => {
    return;
  },
  players: [],
  friends: [],
  enemies: [],
  maxOutputNumber: 0,
  playerTotalDamageOut: new Map<string, number>(),
  playerTotalHealOut: new Map<string, number>(),
  playerTimeInCC: new Map<string, number>(),
  playerInterrupts: new Map<string, number>(),
});

interface IProps {
  combat: ICombatData;
  isAnonymized: boolean;
  navigateToPlayerView: (unitId: string) => void;
  children: React.ReactNode | React.ReactNode[];
}

export const CombatReportContextProvider = (props: IProps) => {
  const [
    players,
    friends,
    enemies,
    maxOutputNumber,
    playerTotalDamageOut,
    playerTotalHealOut,
    playerTimeInCC,
    playerInterrupts,
  ] = useMemo(() => {
    const mPlayers = _.values(props.combat.units).filter((u) => u.type === CombatUnitType.Player);
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
    const mPlayerTimeInCC = new Map<string, number>();
    const mPlayerInterrupts = new Map<string, number>();

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

      const totalDamageOut = p.damageOut.reduce((sum, action) => {
        return sum + Math.abs(action.amount);
      }, 0);
      mPlayerTotalDamageOut.set(p.id, totalDamageOut);

      const totalHealOut = p.healOut.reduce((sum, action) => {
        if (action.logLine.event === 'SPELL_PERIODIC_HEAL') {
          // TODO: the parser needs to give us more info about overhealing
          return sum + (action.logLine.parameters[28] - action.logLine.parameters[30]);
        }
        if (action.logLine.event === 'SPELL_HEAL') {
          // TODO: the parser needs to give us more info about overhealing
          return sum + (action.logLine.parameters[28] - action.logLine.parameters[30]);
        }
        return sum + Math.abs(action.amount);
      }, 0);
      const totalPrevented = p.absorbsOut.reduce((sum, action) => {
        return sum + Math.abs(action.absorbedAmount);
      }, 0);
      mPlayerTotalHealOut.set(p.id, totalHealOut + totalPrevented);

      mMaxOutputNumber = Math.max(mMaxOutputNumber, totalDamageOut, totalHealOut);

      const totalInterrupts = p.actionOut.filter((l) => l.event === LogEvent.SPELL_INTERRUPT).length;
      mPlayerInterrupts.set(p.id, totalInterrupts);
    });
    return [
      mPlayers,
      mFriends,
      mEnemies,
      mMaxOutputNumber,
      mPlayerTotalDamageOut,
      mPlayerTotalHealOut,
      mPlayerTimeInCC,
      mPlayerInterrupts,
    ];
  }, [props.combat]);

  return (
    <CombatReportContext.Provider
      value={{
        players,
        friends,
        enemies,
        maxOutputNumber,
        playerTotalDamageOut,
        playerTotalHealOut,
        playerTimeInCC,
        playerInterrupts,
        combat: props.combat,
        isAnonymized: props.isAnonymized,
        navigateToPlayerView: props.navigateToPlayerView,
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

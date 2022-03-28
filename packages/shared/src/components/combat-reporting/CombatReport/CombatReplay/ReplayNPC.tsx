import { Container, Sprite } from '@inlet/react-pixi';
import _ from 'lodash';
import { useMemo } from 'react';
import { ICombatUnit, LogEvent, ICombatData, CombatUnitSpec } from 'wow-combat-log-parser';

import { spellIdToPriority } from '../../../../data/spellTags';
import { Utils } from '../../../../utils';
import { ReplayCastBar } from './ReplayCastBar';
import { ReplayHealthBar } from './ReplayHealthBar';
import { ReplayHpNumbers } from './ReplayHpNumbers';
import { ReplaySpellCasts } from './ReplaySpellCasts';

interface IProps {
  combat: ICombatData;
  unit: ICombatUnit;
  currentTimeOffset: number;
  gamePositionToRenderPosition: (gameX: number, gameY: number) => { x: number; y: number };
}

interface IAuraDuration {
  spellId: string;
  spellName: string;
  startTimeOffset: number;
  endTimeOffset: number;
}

interface IAuraState {
  spellName: string;
  count: number;
  startTimeOffset: number;
}

const PLAYER_UNIT_SIZE = 3;

export function ReplayNPC(props: IProps) {
  const pos = (() => {
    if (
      props.unit.advancedActions.length === 0 ||
      props.currentTimeOffset < props.unit.advancedActions[0].timestamp - props.combat.startTime
    ) {
      return {
        x: Number.MIN_SAFE_INTEGER,
        y: Number.MIN_SAFE_INTEGER,
      };
    }
    for (let i = 0; i < props.unit.advancedActions.length; ++i) {
      if (i === props.unit.advancedActions.length - 1) {
        return props.gamePositionToRenderPosition(
          props.unit.advancedActions[i].advancedActorPositionX,
          props.unit.advancedActions[i].advancedActorPositionY,
        );
      }

      const currentActionTimeOffset = props.unit.advancedActions[i].timestamp - props.combat.startTime;
      const nextActionTimeOffset = props.unit.advancedActions[i + 1].timestamp - props.combat.startTime;
      if (currentActionTimeOffset <= props.currentTimeOffset && nextActionTimeOffset > props.currentTimeOffset) {
        const currX = props.unit.advancedActions[i].advancedActorPositionX;
        const currY = props.unit.advancedActions[i].advancedActorPositionY;
        const nextX = props.unit.advancedActions[i + 1].advancedActorPositionX;
        const nextY = props.unit.advancedActions[i + 1].advancedActorPositionY;
        const interpolationPercentage =
          (props.currentTimeOffset - currentActionTimeOffset) / (nextActionTimeOffset - currentActionTimeOffset);
        return props.gamePositionToRenderPosition(
          currX + (nextX - currX) * interpolationPercentage,
          currY + (nextY - currY) * interpolationPercentage,
        );
      }
    }
    return props.gamePositionToRenderPosition(
      props.unit.advancedActions[0].advancedActorPositionX,
      props.unit.advancedActions[0].advancedActorPositionY,
    );
  })();

  const hp = (() => {
    if (
      props.unit.advancedActions.length === 0 ||
      props.currentTimeOffset < props.unit.advancedActions[0].timestamp - props.combat.startTime
    ) {
      return {
        current: 1,
        max: 1,
      };
    }
    for (let i = 0; i < props.unit.advancedActions.length; ++i) {
      if (i === props.unit.advancedActions.length - 1) {
        return {
          current: props.unit.advancedActions[i].advancedActorCurrentHp,
          max: props.unit.advancedActions[i].advancedActorMaxHp,
        };
      }

      const currentActionTimeOffset = props.unit.advancedActions[i].timestamp - props.combat.startTime;
      const nextActionTimeOffset = props.unit.advancedActions[i + 1].timestamp - props.combat.startTime;
      if (currentActionTimeOffset <= props.currentTimeOffset && nextActionTimeOffset > props.currentTimeOffset) {
        return {
          current: props.unit.advancedActions[i].advancedActorCurrentHp,
          max: props.unit.advancedActions[i].advancedActorMaxHp,
        };
      }
    }
    return {
      current: 1,
      max: 1,
    };
  })();

  const auras = useMemo(() => {
    const durations: IAuraDuration[] = [];
    const auraStates = new Map<string, IAuraState>();

    for (let i = 0; i < props.unit.auraEvents.length; ++i) {
      const event = props.unit.auraEvents[i];
      const spellId = event.spellId || '';
      switch (event.logLine.event) {
        case LogEvent.SPELL_AURA_APPLIED:
          {
            const currentState = auraStates.get(spellId) || {
              spellName: event.spellName || '',
              count: 0,
              startTimeOffset: event.logLine.timestamp - props.combat.startTime,
            };
            if (event.spellName) {
              currentState.spellName = event.spellName;
            }
            currentState.count += 1;
            auraStates.set(spellId, currentState);
          }
          break;
        case LogEvent.SPELL_AURA_REMOVED:
          {
            const currentAuraState = auraStates.get(spellId) || {
              spellName: event.spellName || '',
              count: 0,
              startTimeOffset: 0,
            };
            if (currentAuraState.count > 0) {
              const newAuraState = {
                spellName: event.spellName || currentAuraState.spellName,
                count: currentAuraState.count - 1,
                startTimeOffset: currentAuraState.startTimeOffset,
              };
              if (newAuraState.count === 0) {
                durations.push({
                  spellId,
                  spellName: newAuraState.spellName,
                  startTimeOffset: newAuraState.startTimeOffset,
                  endTimeOffset: event.timestamp - props.combat.startTime,
                });
                auraStates.delete(spellId);
              } else {
                auraStates.set(spellId, newAuraState);
              }
            }
          }
          break;
      }
    }

    return durations;
  }, [props.combat, props.unit]);

  const highlightAura = (() => {
    return _.first(
      _.sortBy(
        auras
          .filter(
            (a) =>
              props.currentTimeOffset >= a.startTimeOffset &&
              props.currentTimeOffset < a.endTimeOffset &&
              spellIdToPriority.has(a.spellId),
          )
          .map((a) => ({
            aura: a,
            remainingDuration: a.endTimeOffset - props.currentTimeOffset,
            priority: spellIdToPriority.get(a.spellId) || 0,
          })),
        ['priority', 'remainingDuration'],
      ),
    );
  })();

  console.log(props.unit.name, props);
  if (props.unit.deathRecords.length === 1) {
    if (props.currentTimeOffset > props.unit.deathRecords[0].timestamp) {
      return null;
    }
  }

  return (
    <Container key={props.unit.id} x={pos.x} y={pos.y}>
      {!highlightAura ? (
        <Sprite
          image={
            props.unit.spec === CombatUnitSpec.None
              ? Utils.getClassIcon(props.unit.class)
              : Utils.getSpecIcon(props.unit.spec) || ''
          }
          width={PLAYER_UNIT_SIZE}
          height={PLAYER_UNIT_SIZE}
          anchor={{ x: 0.5, y: 0.5 }}
        />
      ) : null}
      {highlightAura ? (
        <Sprite
          image={`https://images.wowarenalogs.com/spells/${highlightAura.aura.spellId}.jpg`}
          width={PLAYER_UNIT_SIZE}
          height={PLAYER_UNIT_SIZE}
          anchor={{ x: 0.5, y: 0.5 }}
        />
      ) : null}
      <ReplayHealthBar current={hp.current} max={hp.max} reaction={props.unit.reaction} />
      <ReplayCastBar combat={props.combat} unit={props.unit} currentTimeOffset={props.currentTimeOffset} />
      <ReplaySpellCasts combat={props.combat} unit={props.unit} currentTimeOffset={props.currentTimeOffset} />
      <ReplayHpNumbers combat={props.combat} unit={props.unit} currentTimeOffset={props.currentTimeOffset} />
    </Container>
  );
}

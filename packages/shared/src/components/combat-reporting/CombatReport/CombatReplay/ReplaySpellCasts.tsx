import { Container, Sprite } from '@inlet/react-pixi';
import { useMemo } from 'react';
import { CombatAction, ICombatData, ICombatUnit, LogEvent } from 'wow-combat-log-parser';

interface IProps {
  combat: ICombatData;
  unit: ICombatUnit;
  currentTimeOffset: number;
}

interface ISpellCastRenderState {
  event: CombatAction;
  progress: number;
}

const DURATION = 1000;

const X_OFFSET = -3;
const Y_OFFSET = 0;
const MIN_X_VELOCITY = -5;
const MAX_X_VELOCITY = -3;
const MIN_Y_VELOCITY = -5;
const MAX_Y_VELOCITY = -3;
const X_ACCELERATION = 0.1;
const Y_ACCELERATION = 20;
const ICON_SIZE = 3;

const ReplaySpellCast = (props: { renderState: ISpellCastRenderState }) => {
  const initialXVelocity = useMemo(() => {
    return MIN_X_VELOCITY + -1 * (MAX_X_VELOCITY - MIN_X_VELOCITY) * Math.random();
  }, []);
  const initialYVelocity = useMemo(() => {
    return MIN_Y_VELOCITY + -1 * (MAX_Y_VELOCITY - MIN_Y_VELOCITY) * Math.random();
  }, []);

  const x =
    initialXVelocity * props.renderState.progress +
    (X_ACCELERATION * props.renderState.progress * props.renderState.progress) / 2;
  const y =
    initialYVelocity * props.renderState.progress +
    (Y_ACCELERATION * props.renderState.progress * props.renderState.progress) / 2;

  return (
    <Sprite
      x={x}
      y={y}
      width={ICON_SIZE}
      height={ICON_SIZE}
      image={`https://images.wowarenalogs.com/spells/${props.renderState.event.spellId}.jpg`}
      alpha={props.renderState.progress < 0.5 ? 1 : 1 - (props.renderState.progress - 0.5)}
    />
  );
};

export const ReplaySpellCasts = (props: IProps) => {
  const spellCasts = props.unit.spellCastEvents
    .filter((e) => {
      const eventTimeOffset = e.timestamp - props.combat.startTime;
      return (
        e.logLine.event === LogEvent.SPELL_CAST_SUCCESS &&
        props.currentTimeOffset - eventTimeOffset >= 0 &&
        props.currentTimeOffset - eventTimeOffset < DURATION
      );
    })
    .map((e) => ({
      event: e,
      progress: Math.min(1, (props.currentTimeOffset - (e.timestamp - props.combat.startTime)) / DURATION),
    }));

  return (
    <Container x={X_OFFSET} y={Y_OFFSET}>
      {spellCasts.map((s) => {
        return <ReplaySpellCast key={s.event.logLine.id} renderState={s} />;
      })}
    </Container>
  );
};

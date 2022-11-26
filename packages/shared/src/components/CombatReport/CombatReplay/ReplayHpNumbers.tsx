import { Container, Text } from '@inlet/react-pixi';
import { CombatHpUpdateAction, ICombatUnit } from '@wowarenalogs/parser';
import { TextStyle } from 'pixi.js';

import { useCombatReportContext } from '../CombatReportContext';

interface IProps {
  unit: ICombatUnit;
  currentTimeOffset: number;
}

interface IHpNumberRenderState {
  event: CombatHpUpdateAction;
  progress: number;
}

const DURATION = 1500;

const X_OFFSET = 0;
const Y_OFFSET = -4;
const INITIAL_Y_VELOCITY = -10;
const Y_ACCELERATION = 5;

const ReplayHpNumber = (props: { renderState: IHpNumberRenderState }) => {
  const y =
    INITIAL_Y_VELOCITY * props.renderState.progress +
    (Y_ACCELERATION * props.renderState.progress * props.renderState.progress) / 2;

  const isDamage = props.renderState.event.amount < 0;

  return (
    <Text
      text={(isDamage ? '' : '+') + props.renderState.event.amount.toFixed()}
      x={0}
      y={y}
      resolution={4}
      anchor={0.5}
      scale={0.2}
      alpha={props.renderState.progress < 0.5 ? 1 : 1 - (props.renderState.progress - 0.5)}
      style={
        new TextStyle({
          align: 'center',
          fontFamily: 'Impact, "Source Sans Pro", Helvetica, sans-serif',
          fontSize: 14,
          fill: isDamage ? '#a61d24' : '#49aa19',
          wordWrap: false,
        })
      }
    />
  );
};

export const ReplayHpNumbers = (props: IProps) => {
  const { combat } = useCombatReportContext();
  if (!combat) {
    return null;
  }

  const MIN_NUMBER = combat.wowVersion === 'retail' ? 3000 : 300;

  const numbers = props.unit.damageIn
    .concat(props.unit.healIn)
    .filter((e) => {
      const eventTimeOffset = e.timestamp - combat.startTime;
      return (
        Math.abs(e.amount) >= MIN_NUMBER &&
        props.currentTimeOffset - eventTimeOffset >= 0 &&
        props.currentTimeOffset - eventTimeOffset < DURATION
      );
    })
    .map((e) => ({
      event: e,
      progress: Math.min(1, (props.currentTimeOffset - (e.timestamp - combat.startTime)) / DURATION),
    }));

  return (
    <Container x={X_OFFSET} y={Y_OFFSET}>
      {numbers.map((s) => {
        return <ReplayHpNumber key={s.event.logLine.id} renderState={s} />;
      })}
    </Container>
  );
};

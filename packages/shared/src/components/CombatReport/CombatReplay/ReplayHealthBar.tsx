import { Container, Sprite } from '@inlet/react-pixi';
import { CombatUnitReaction } from '@wowarenalogs/parser';

interface IProps {
  current: number;
  max: number;
  reaction: CombatUnitReaction;
}

const BAR_WIDTH = 4;
const BAR_HEIGHT = 1.2;
const BAR_Y_OFFSET = -3;
const BAR_INNER_PADDING = 0.2;

export const ReplayHealthBar = (props: IProps) => {
  const hpPercentage = Math.min(1, props.current / props.max);
  return (
    <Container x={BAR_WIDTH * -0.5} y={BAR_Y_OFFSET - BAR_HEIGHT}>
      <Sprite image="https://images.wowarenalogs.com/common/white.png" width={BAR_WIDTH} height={BAR_HEIGHT} />
      <Sprite
        image="https://images.wowarenalogs.com/common/white.png"
        x={BAR_INNER_PADDING}
        y={BAR_INNER_PADDING}
        width={(BAR_WIDTH - 2 * BAR_INNER_PADDING) * hpPercentage}
        height={BAR_HEIGHT - 2 * BAR_INNER_PADDING}
        tint={props.reaction === CombatUnitReaction.Friendly ? 0x49aa19 : 0xa61d24}
      />
    </Container>
  );
};

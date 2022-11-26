import { Container, Sprite } from '@inlet/react-pixi';
import { ICombatUnit, LogEvent } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useMemo } from 'react';

import { useCombatReportContext } from '../CombatReportContext';

interface IProps {
  unit: ICombatUnit;
  currentTimeOffset: number;
}

interface ISpellCastDuration {
  spellId: string;
  spellName: string;
  startTimeOffset: number;
  endTimeOffset: number;
  succeeded: boolean;
}

interface ISpellCastState {
  spellId: string;
  spellName: string;
  startTimeOffset: number;
}

interface ISpellCastRenderState {
  spellId: string;
  spellName: string;
  progress: number;
  casting: boolean;
  succeeded: boolean;
}

const BAR_WIDTH = 4;
const BAR_HEIGHT = 1.2;
const BAR_Y_OFFSET = 4;
const BAR_INNER_PADDING = 0.2;
const ICON_SIZE = 1.6;

const CAST_BAR_BACKGROUND_COLOR = 0xffffff;
const CAST_BAR_PROGRESS_COLOR = 0xffb200;
const CAST_BAR_SUCCESS_COLOR = 0x49aa19;
const CAST_BAR_FAILURE_COLOR = 0xa61d24;

const FINISHED_CAST_RENDER_DURATION = 600;
const MINIMUM_VALID_CAST_DURATION = 200;

export const ReplayCastBar = (props: IProps) => {
  const { combat } = useCombatReportContext();
  const spellCasts = useMemo(() => {
    const durations: ISpellCastDuration[] = [];
    if (!combat) {
      return durations;
    }

    let castState: ISpellCastState | null = null;

    for (let i = 0; i < props.unit.spellCastEvents.length; ++i) {
      const event = props.unit.spellCastEvents[i];
      const spellId = event.spellId || '';
      switch (event.logLine.event) {
        case LogEvent.SPELL_CAST_START:
          castState = {
            spellId,
            spellName: event.spellName || '',
            startTimeOffset: event.timestamp - combat.startTime,
          };
          break;
        case LogEvent.SPELL_CAST_FAILED:
        case LogEvent.SPELL_CAST_SUCCESS:
          if (
            castState &&
            event.spellId === castState.spellId &&
            event.timestamp - combat.startTime - castState.startTimeOffset >= MINIMUM_VALID_CAST_DURATION
          ) {
            durations.push({
              spellId: event.spellId,
              spellName: castState.spellName || event.spellName || '',
              startTimeOffset: castState.startTimeOffset,
              endTimeOffset: event.timestamp - combat.startTime,
              succeeded: event.logLine.event === LogEvent.SPELL_CAST_SUCCESS,
            });
            castState = null;
          }
          break;
      }
    }

    return durations;
  }, [combat, props.unit]);

  const renderState: ISpellCastRenderState | undefined = (() => {
    const casting = _.first(
      spellCasts
        .filter((s) => props.currentTimeOffset >= s.startTimeOffset && props.currentTimeOffset <= s.endTimeOffset)
        .map((s) => ({
          spellId: s.spellId,
          spellName: s.spellName,
          casting: true,
          progress: (props.currentTimeOffset - s.startTimeOffset) / (s.endTimeOffset - s.startTimeOffset),
          succeeded: false,
        })),
    );

    if (casting) {
      return casting;
    }

    const justFinished = _.first(
      spellCasts
        .filter(
          (s) =>
            props.currentTimeOffset - s.endTimeOffset >= 0 &&
            props.currentTimeOffset - s.endTimeOffset < FINISHED_CAST_RENDER_DURATION,
        )
        .map((s) => ({
          spellId: s.spellId,
          spellName: s.spellName,
          casting: false,
          progress: Math.min(1, (props.currentTimeOffset - s.endTimeOffset) / FINISHED_CAST_RENDER_DURATION),
          succeeded: s.succeeded,
        })),
    );

    return justFinished;
  })();

  if (!renderState) {
    return null;
  }

  return (
    <Container
      x={BAR_WIDTH * -0.5}
      y={BAR_Y_OFFSET - BAR_HEIGHT}
      alpha={renderState.casting ? 1 : 1 - renderState.progress}
    >
      <Sprite
        image="https://images.wowarenalogs.com/common/white.png"
        width={BAR_WIDTH}
        height={BAR_HEIGHT}
        tint={
          renderState.casting
            ? CAST_BAR_BACKGROUND_COLOR
            : renderState.succeeded
            ? CAST_BAR_SUCCESS_COLOR
            : CAST_BAR_FAILURE_COLOR
        }
      />
      <Sprite
        image="https://images.wowarenalogs.com/common/white.png"
        x={BAR_INNER_PADDING}
        y={BAR_INNER_PADDING}
        width={(BAR_WIDTH - 2 * BAR_INNER_PADDING) * (renderState.casting ? renderState.progress : 1)}
        height={BAR_HEIGHT - 2 * BAR_INNER_PADDING}
        tint={
          renderState.casting
            ? CAST_BAR_PROGRESS_COLOR
            : renderState.succeeded
            ? CAST_BAR_SUCCESS_COLOR
            : CAST_BAR_FAILURE_COLOR
        }
      />
      <Sprite
        image={`https://images.wowarenalogs.com/spells/${renderState.spellId}.jpg`}
        width={ICON_SIZE}
        height={ICON_SIZE}
        x={-ICON_SIZE - BAR_INNER_PADDING}
        y={-(ICON_SIZE - BAR_HEIGHT) / 2}
      />
    </Container>
  );
};

import { CombatAction, ICombatUnit, LogEvent } from '@wowarenalogs/parser';
import { TbArrowLeft, TbArrowRight, TbCircleX, TbPlayerStop } from 'react-icons/tb';

import { useCombatReportContext } from '../../CombatReportContext';
import { SpellIcon } from '../../SpellIcon';
import { ReplayEventUnit } from './ReplayEventUnit';

interface IProps {
  event: CombatAction;
  direction: 'left' | 'right' | 'stop' | 'remove';
  expanded?: boolean;
}

export function ReplayEventSpellInfo(props: IProps) {
  const context = useCombatReportContext();
  if (!context.combat) {
    return null;
  }

  const srcUnit: ICombatUnit | undefined = context.combat.units[props.event.srcUnitId];
  const destUnit: ICombatUnit | undefined = context.combat.units[props.event.destUnitId];

  const isDosingEvent =
    props.event.logLine.event === LogEvent.SPELL_AURA_APPLIED_DOSE ||
    props.event.logLine.event === LogEvent.SPELL_AURA_REMOVED_DOSE;

  if (isDosingEvent) {
    const changedText =
      props.event.logLine.event === LogEvent.SPELL_AURA_APPLIED_DOSE ? 'increased to' : 'decreased to';
    // const changedColor = props.event.logLine.event === LogEvent.SPELL_AURA_APPLIED_DOSE ? 'green' : 'red';

    if (props.expanded) {
      return (
        <div className="flex flex-row flex-wrap items-center">
          {srcUnit && <ReplayEventUnit unit={srcUnit} expanded={props.expanded} />}
          <div className="mx-0.5">
            <div className="opacity-60">stacks of</div>
          </div>
          <div className="ml-0.5">
            <SpellIcon spellId={props.event.spellId || '0'} size={24} />
          </div>
          <div className="ml-0.5">{props.event.spellName}</div>
          <div className="mx-0.5">
            <div className="opacity-60">on</div>
          </div>
          {destUnit && <ReplayEventUnit unit={destUnit} expanded={props.expanded} />}
          <div className="mx-0.5">
            <div className="opacity-60">{changedText}</div>
            {
              // TODO: implement doses count in parser
              //<div className="ml-1">{getDosesCount(props.event, context.combat.wowVersion)}</div>
            }
          </div>
        </div>
      );
    } else {
      return (
        <div className="flex flex-row flex-wrap items-center">
          <ReplayEventUnit unit={destUnit} expanded={props.expanded} />
          <div className="ml-0.5">
            <SpellIcon spellId={props.event.spellId || '0'} size={24} />
          </div>
          <div className="mx-0.5">
            {
              // TODO: implement doses count in parser
              // <Text style={{ color: changedColor, marginLeft: 4 }}>{`[${getDosesCount(
              //   props.event,
              //   context.combat.wowVersion,
              // )}]`}</Text>
            }
          </div>
        </div>
      );
    }
  }

  return (
    <div className="flex flex-row flex-wrap items-center">
      {srcUnit && <ReplayEventUnit unit={srcUnit} expanded={props.expanded} />}
      {props.expanded && (
        <div className="mx-0.5">
          <div className="opacity-60">casted</div>
        </div>
      )}
      <div className="ml-0.5">
        <SpellIcon spellId={props.event.spellId || '0'} size={24} />
      </div>
      {props.expanded && <div className="ml-0.5">{props.event.spellName}</div>}
      {srcUnit?.id !== destUnit?.id || props.direction !== 'right' || props.expanded ? (
        <>
          {props.expanded && (
            <div className="mx-0.5">
              <div className="opacity-60">on</div>
            </div>
          )}
          {!props.expanded && (
            <div className="mx-1">
              <div className="opacity-60 text-lg">
                {(() => {
                  switch (props.direction) {
                    case 'left':
                      return <TbArrowLeft />;
                    case 'right':
                      return <TbArrowRight />;
                    case 'stop':
                      return <TbPlayerStop />;
                    case 'remove':
                      return <TbCircleX />;
                  }
                })()}
              </div>
            </div>
          )}
          {destUnit && <ReplayEventUnit unit={destUnit} expanded={props.expanded} />}
        </>
      ) : (
        <div className="ml-0.5" />
      )}
    </div>
  );
}

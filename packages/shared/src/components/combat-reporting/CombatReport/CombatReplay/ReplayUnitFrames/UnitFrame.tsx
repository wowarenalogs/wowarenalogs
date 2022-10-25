import { Tooltip } from 'antd';
import _ from 'lodash';
import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';
import { CombatUnitPowerType, ICombatData, ICombatUnit, LogEvent } from 'wow-combat-log-parser';
import { CombatAdvancedAction } from 'wow-combat-log-parser/dist/actions/CombatAdvancedAction';

import styles from './UnitFrame.module.css';

import { spellEffectData, IMinedSpell } from '../../../../../data/spellEffectData';
import { spellIdToPriority } from '../../../../../data/spellTags';
import { UnitCastBar } from './UnitCastBar';
import { UnitClassIcon } from './UnitClassIcon';
import { UnitHpBar } from './UnitHpBar';
import { UnitPowerBar } from './UnitPowerBar';
import { UnitSpecIcon } from './UnitSpecIcon';
import { UnitSpellTracker, computeTrackableSpellsForUnit } from './UnitSpellTracker';
import { UnitTrinketTracker } from './UnitTrinketTracker';

interface IProps {
  combat: ICombatData;
  unit: ICombatUnit;
  currentTimeOffset: number;
  onClick: () => void;
}

export interface IAuraDuration {
  spellId: string;
  spellName: string;
  startTimeOffset: number;
  endTimeOffset: number;
  auraOwnerId: string;
}

export interface IAuraState {
  spellName: string;
  count: number;
  startTimeOffset: number;
  auraOwnerId: string;
}

const PRIMARY_POWER_TYPES = new Set<CombatUnitPowerType>([
  CombatUnitPowerType.Mana,
  CombatUnitPowerType.Rage,
  CombatUnitPowerType.Focus,
  CombatUnitPowerType.Energy,
  CombatUnitPowerType.RunicPower,
  CombatUnitPowerType.Insanity,
]);

const getMpValues = (action: CombatAdvancedAction) => {
  return _.first(
    _.sortBy(
      action.advancedActorPowers.filter((p) => PRIMARY_POWER_TYPES.has(p.type)),
      ['type'],
    ),
  );
};

interface ISpellCastRenderState {
  spellId: string;
  spellName: string;
  progress: number;
  casting: boolean;
  succeeded: boolean;
}

interface ISpellCastDuration {
  spellId: string;
  spellName: string;
  startTimeOffset: number;
  endTimeOffset: number;
  succeeded: boolean;
}

export interface ISpellCast {
  spellId: string;
  spellName: string;
  startTimeOffset: number;
}

interface ISpellCastState {
  spellId: string;
  spellName: string;
  startTimeOffset: number;
}

const MINIMUM_VALID_CAST_DURATION = 200;
const FINISHED_CAST_RENDER_DURATION = 600;

export interface IUnitFrameRenderData {
  currentTimeOffset: number;
  combat: ICombatData;
  unit: ICombatUnit;
  hp: {
    current: number;
    max: number;
  };
  mp: {
    type: CombatUnitPowerType;
    current: number;
    max: number;
  };
  highlightAura: IAuraDuration | null;
  castingSpell: ISpellCastRenderState | null;
  trackedAuras: IAuraDuration[];
  trackedSpellCasts: ISpellCast[];
  trackedSpellIds: string[];
  trinketSpellCasts: ISpellCast[];
  spellData: Record<string, IMinedSpell>;
}

export const UnitFrame = (props: IProps) => {
  const { t } = useTranslation();

  const spellUses = useMemo(() => {
    const casts: ISpellCast[] = [];
    for (let i = 0; i < props.unit.spellCastEvents.length; ++i) {
      const event = props.unit.spellCastEvents[i];
      if (event.logLine.event === LogEvent.SPELL_CAST_SUCCESS) {
        casts.push({
          spellId: event.spellId || '',
          spellName: event.spellName || '',
          startTimeOffset: event.timestamp - props.combat.startTime,
        });
      }
    }
    return casts;
  }, [props.combat, props.unit]);

  const spellCasts = useMemo(() => {
    const durations: ISpellCastDuration[] = [];
    let castState: ISpellCastState | null = null;

    for (let i = 0; i < props.unit.spellCastEvents.length; ++i) {
      const event = props.unit.spellCastEvents[i];
      const spellId = event.spellId || '';
      switch (event.logLine.event) {
        case LogEvent.SPELL_CAST_START:
          castState = {
            spellId,
            spellName: event.spellName || '',
            startTimeOffset: event.timestamp - props.combat.startTime,
          };
          break;
        case LogEvent.SPELL_CAST_FAILED:
        case LogEvent.SPELL_CAST_SUCCESS:
          if (
            castState &&
            event.spellId === castState.spellId &&
            event.timestamp - props.combat.startTime - castState.startTimeOffset >= MINIMUM_VALID_CAST_DURATION
          ) {
            durations.push({
              spellId: event.spellId,
              spellName: castState.spellName || event.spellName || '',
              startTimeOffset: castState.startTimeOffset,
              endTimeOffset: event.timestamp - props.combat.startTime,
              succeeded: event.logLine.event === LogEvent.SPELL_CAST_SUCCESS,
            });
            castState = null;
          }
          break;
      }
    }

    return durations;
  }, [props.combat, props.unit]);

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
              auraOwnerId: event.srcUnitId,
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
              auraOwnerId: '',
            };
            if (currentAuraState.count > 0) {
              const newAuraState = {
                spellName: event.spellName || currentAuraState.spellName,
                count: currentAuraState.count - 1,
                startTimeOffset: currentAuraState.startTimeOffset,
                auraOwnerId: currentAuraState.auraOwnerId,
              };
              if (newAuraState.count === 0) {
                durations.push({
                  spellId,
                  spellName: newAuraState.spellName,
                  startTimeOffset: newAuraState.startTimeOffset,
                  endTimeOffset: event.timestamp - props.combat.startTime,
                  auraOwnerId: currentAuraState.auraOwnerId,
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

  const spellData = useMemo(() => {
    const spellData = _.keyBy(
      _.keys(spellEffectData)
        .filter((k) => spellUses.find((s) => s.spellId === k))
        .map((k) => _.cloneDeep(spellEffectData[k])),
      'spellId',
    );
    // Section to apply changes to spells for talents
    if (spellData['1022']) {
      // 199454 Blessed Hands
      if (props.unit.info?.pvpTalents.includes('199454')) {
        if (spellData['1022'].charges) {
          spellData['1022'].charges.charges = 2;
        }
      }
    }
    if (spellData['2050']) {
      // 235587 Miracle Worker (Holy Word: Serenity)
      if (props.unit.info?.pvpTalents.includes('235587')) {
        if (spellData['2050'].charges) {
          spellData['2050'].charges.charges = 2;
          spellData['2050'].cooldownSeconds = (spellData['2050'].cooldownSeconds || 60) * 0.8;
        }
      }
    }
    return spellData;
  }, [props.unit, spellUses]);

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

  const mp = (() => {
    if (
      props.unit.advancedActions.length === 0 ||
      props.currentTimeOffset < props.unit.advancedActions[0].timestamp - props.combat.startTime
    ) {
      return {
        type: CombatUnitPowerType.None,
        current: 1,
        max: 1,
      };
    }
    for (let i = 0; i < props.unit.advancedActions.length; ++i) {
      if (i === props.unit.advancedActions.length - 1) {
        return (
          getMpValues(props.unit.advancedActions[i]) || {
            type: CombatUnitPowerType.None,
            current: 0,
            max: 1,
          }
        );
      }

      const currentActionTimeOffset = props.unit.advancedActions[i].timestamp - props.combat.startTime;
      const nextActionTimeOffset = props.unit.advancedActions[i + 1].timestamp - props.combat.startTime;
      if (currentActionTimeOffset <= props.currentTimeOffset && nextActionTimeOffset > props.currentTimeOffset) {
        return (
          getMpValues(props.unit.advancedActions[i]) || {
            type: CombatUnitPowerType.None,
            current: 0,
            max: 1,
          }
        );
      }
    }
    return {
      type: CombatUnitPowerType.None,
      current: 1,
      max: 1,
    };
  })();

  const castingSpell: ISpellCastRenderState | undefined = (() => {
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

  // Auras that will highlight while active in the Spell Tracker (AWC frame)
  const trackedAuras = (() => {
    return auras.filter(
      (a) =>
        a.auraOwnerId === props.unit.id && // Only auras that unit owns
        props.currentTimeOffset >= a.startTimeOffset &&
        props.currentTimeOffset < a.endTimeOffset,
    );
  })();

  // Build list of trackable spells
  const trackableSpells = useMemo(() => computeTrackableSpellsForUnit(props.unit), [props.unit]);

  // Spell casts to track cooldowns for the Spell Tracker (AWC frame)
  const trackedSpellCasts = useMemo(() => {
    return spellUses.filter((evt) => trackableSpells.includes(evt.spellId) || evt.spellId === '336126');
  }, [spellUses, trackableSpells]);

  // Spell Ids the tracker will show -- start with the AWC list then filter to what we actually saw in the match
  const trackedSpellIds = useMemo(() => {
    return trackableSpells.filter((e) => spellUses.some((sc) => sc.spellId === e));
  }, [spellUses, trackableSpells]);

  const trinketSpellIds = ['336126']; // TODO: Add adaptation spell id here
  const trinketSpellCasts = useMemo(() => {
    return spellUses.filter((evt) => trinketSpellIds.includes(evt.spellId));
  }, [spellUses, trinketSpellIds]);

  // Auras that will show over the unit frame class icon (cc typically)
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

  const renderData: IUnitFrameRenderData = {
    currentTimeOffset: props.currentTimeOffset,
    combat: props.combat,
    unit: props.unit,
    hp,
    mp,
    trackedAuras,
    trackedSpellCasts,
    trackedSpellIds,
    trinketSpellCasts,
    highlightAura: highlightAura?.aura || null,
    castingSpell: castingSpell || null,
    spellData,
  };

  return (
    <div className={styles['unit-frame-root']}>
      <div className={styles['unit-frame-name']} onClick={props.onClick}>
        <Tooltip title={t('combat-report-tap-to-filter-events-to-unit')} placement="right">
          {props.unit.name}
        </Tooltip>
      </div>
      <UnitClassIcon {...renderData} />
      <UnitHpBar {...renderData} />
      <UnitPowerBar {...renderData} />
      <UnitCastBar {...renderData} />
      <div className={styles['unit-frame-texture']} />
      {props.combat.wowVersion === 'dragonflight' && <UnitSpecIcon {...renderData} />}
      <UnitSpellTracker {...renderData} />
      <UnitTrinketTracker {...renderData} />
    </div>
  );
};

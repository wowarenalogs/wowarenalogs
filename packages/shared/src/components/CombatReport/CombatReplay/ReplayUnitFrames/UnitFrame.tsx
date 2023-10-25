import {
  AtomicArenaCombat,
  CombatAdvancedAction,
  CombatUnitPowerType,
  CombatUnitSpec,
  ICombatUnit,
  LogEvent,
} from '@wowarenalogs/parser';
import _ from 'lodash';
import { useMemo } from 'react';

import { IMinedSpell, spellEffectData } from '../../../../data/spellEffectData';
import { spellIdToPriority, trinketSpellIds } from '../../../../data/spellTags';
import { computeAuraDurations, IAuraDuration } from '../../../../utils/auras';
import { UnitCastBar } from './UnitCastBar';
import { UnitClassIcon } from './UnitClassIcon';
import styles from './UnitFrame.module.css';
import { UnitHpBar } from './UnitHpBar';
import { UnitPowerBar } from './UnitPowerBar';
import { UnitSpecIcon } from './UnitSpecIcon';
import { computeTrackableSpellsForUnit, UnitSpellTracker } from './UnitSpellTracker';
import { UnitTrinketTracker } from './UnitTrinketTracker';

interface IProps {
  combat: AtomicArenaCombat;
  unit: ICombatUnit;
  currentTimeOffset: number;
  onClick: () => void;
}

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

const POWER_BY_SPEC: Record<CombatUnitSpec, CombatUnitPowerType> = {
  [CombatUnitSpec.None]: CombatUnitPowerType.None,

  [CombatUnitSpec.DeathKnight_Blood]: CombatUnitPowerType.RunicPower,
  [CombatUnitSpec.DeathKnight_Frost]: CombatUnitPowerType.RunicPower,
  [CombatUnitSpec.DeathKnight_Unholy]: CombatUnitPowerType.RunicPower,

  [CombatUnitSpec.DemonHunter_Havoc]: CombatUnitPowerType.Fury,
  [CombatUnitSpec.DemonHunter_Vengeance]: CombatUnitPowerType.Fury,

  [CombatUnitSpec.Druid_Restoration]: CombatUnitPowerType.Mana,
  [CombatUnitSpec.Druid_Balance]: CombatUnitPowerType.LunarPower,
  [CombatUnitSpec.Druid_Feral]: CombatUnitPowerType.Energy,
  [CombatUnitSpec.Druid_Guardian]: CombatUnitPowerType.Rage,

  [CombatUnitSpec.Hunter_BeastMastery]: CombatUnitPowerType.Focus,
  [CombatUnitSpec.Hunter_Marksmanship]: CombatUnitPowerType.Focus,
  [CombatUnitSpec.Hunter_Survival]: CombatUnitPowerType.Focus,

  [CombatUnitSpec.Mage_Arcane]: CombatUnitPowerType.Mana,
  [CombatUnitSpec.Mage_Fire]: CombatUnitPowerType.Mana,
  [CombatUnitSpec.Mage_Frost]: CombatUnitPowerType.Mana,

  [CombatUnitSpec.Monk_Windwalker]: CombatUnitPowerType.Energy,
  [CombatUnitSpec.Monk_BrewMaster]: CombatUnitPowerType.Mana,
  [CombatUnitSpec.Monk_Mistweaver]: CombatUnitPowerType.Mana,

  [CombatUnitSpec.Paladin_Holy]: CombatUnitPowerType.Mana,
  [CombatUnitSpec.Paladin_Protection]: CombatUnitPowerType.Mana,
  [CombatUnitSpec.Paladin_Retribution]: CombatUnitPowerType.Mana,

  [CombatUnitSpec.Priest_Discipline]: CombatUnitPowerType.Mana,
  [CombatUnitSpec.Priest_Holy]: CombatUnitPowerType.Mana,
  [CombatUnitSpec.Priest_Shadow]: CombatUnitPowerType.Insanity,

  [CombatUnitSpec.Rogue_Assassination]: CombatUnitPowerType.Energy,
  [CombatUnitSpec.Rogue_Outlaw]: CombatUnitPowerType.Energy,
  [CombatUnitSpec.Rogue_Subtlety]: CombatUnitPowerType.Energy,

  [CombatUnitSpec.Shaman_Elemental]: CombatUnitPowerType.Maelstrom,
  [CombatUnitSpec.Shaman_Enhancement]: CombatUnitPowerType.Mana,
  [CombatUnitSpec.Shaman_Restoration]: CombatUnitPowerType.Mana,

  [CombatUnitSpec.Warlock_Affliction]: CombatUnitPowerType.Mana,
  [CombatUnitSpec.Warlock_Demonology]: CombatUnitPowerType.Mana,
  [CombatUnitSpec.Warlock_Destruction]: CombatUnitPowerType.Mana,

  [CombatUnitSpec.Warrior_Arms]: CombatUnitPowerType.Rage,
  [CombatUnitSpec.Warrior_Fury]: CombatUnitPowerType.Rage,
  [CombatUnitSpec.Warrior_Protection]: CombatUnitPowerType.Rage,

  [CombatUnitSpec.Evoker_Devastation]: CombatUnitPowerType.Mana,
  [CombatUnitSpec.Evoker_Preservation]: CombatUnitPowerType.Mana,
  [CombatUnitSpec.Evoker_Augmentation]: CombatUnitPowerType.Mana,
};

const MINIMUM_VALID_CAST_DURATION = 200;
const FINISHED_CAST_RENDER_DURATION = 600;

export interface IUnitFrameRenderData {
  currentTimeOffset: number;
  combat: AtomicArenaCombat;
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
    return computeAuraDurations(props.combat, props.unit);
  }, [props.combat, props.unit]);

  console.log(props.unit);
  const spellData = useMemo(() => {
    const sd = _.keyBy(
      _.keys(spellEffectData)
        .filter((k) => spellUses.find((s) => s.spellId === k))
        .map((k) => _.cloneDeep(spellEffectData[k])),
      'spellId',
    );
    // Section to apply changes to spells for talents
    if (sd['1022']) {
      // 199454 Blessed Hands
      if (props.unit.info?.pvpTalents.includes('199454')) {
        if (sd['1022'].charges) {
          sd['1022'].charges.charges = 2;
        }
      }
    }
    if (sd['2050']) {
      // 235587 Miracle Worker (Holy Word: Serenity)
      if (props.unit.info?.talents.find((t) => t?.id2 === 103737)) {
        if (sd['2050'].charges) {
          sd['2050'].charges.charges = 2;
        }
      }
    }
    if (sd['33206']) {
      console.log('inspect', sd['33206']);
      // 33206 pain suppression +1 charge
      // 103714 is the talent id for protector of the frail
      if (props.unit.info?.talents.find((t) => t?.id2 === 103714)) {
        if (sd['33206'].charges) {
          sd['33206'].charges.charges = 2;
        }
      }
    }
    return sd;
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
    const powerType = POWER_BY_SPEC[props.unit.spec];
    const actionsForPower = props.unit.advancedActions
      .map((a) => ({
        action: a,
        mp: a.advancedActorPowers.find((p) => p.type === powerType),
      }))
      .filter((a) => a.mp) as {
      // This cast fixes an issue where TS emitted `| undefined` when it could not happen
      // it is safe because the .filter call ensures the .mp field exists
      action: CombatAdvancedAction;
      mp: {
        type: CombatUnitPowerType;
        current: number;
        max: number;
      };
    }[];

    if (
      actionsForPower.length === 0 ||
      props.currentTimeOffset < actionsForPower[0].action.timestamp - props.combat.startTime
    ) {
      return {
        type: CombatUnitPowerType.None,
        current: 1,
        max: 1,
      };
    }
    for (let i = 0; i < actionsForPower.length; ++i) {
      if (i === actionsForPower.length - 1) {
        return actionsForPower[i].mp;
      }

      const currentActionTimeOffset = actionsForPower[i].action.timestamp - props.combat.startTime;
      const nextActionTimeOffset = actionsForPower[i + 1].action.timestamp - props.combat.startTime;
      if (currentActionTimeOffset <= props.currentTimeOffset && nextActionTimeOffset > props.currentTimeOffset) {
        return actionsForPower[i].mp;
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

  const trinketSpellCasts = useMemo(() => {
    return spellUses.filter((evt) => trinketSpellIds.includes(evt.spellId));
  }, [spellUses]);

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
        <div className="tooltip tooltip-right" data-tip="Tap to only watch events from this unit">
          {props.unit.name}
        </div>
      </div>
      <UnitClassIcon {...renderData} />
      <UnitHpBar {...renderData} />
      <UnitPowerBar {...renderData} />
      <UnitCastBar {...renderData} />
      <div className={styles['unit-frame-texture']} />
      {props.combat.wowVersion === 'retail' && <UnitSpecIcon {...renderData} />}
      <UnitSpellTracker {...renderData} />
      <UnitTrinketTracker {...renderData} />
    </div>
  );
};

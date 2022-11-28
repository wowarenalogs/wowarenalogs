import { CombatAbsorbAction, CombatHpUpdateAction, ICombatUnit } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useEffect, useMemo } from 'react';

import talentIdMap from '../../../data/talentIdMap.json';
import { Utils } from '../../../utils/utils';
import { CombatStatistic } from '../CombatStatistic';
import { CombatUnitName } from '../CombatUnitName';
import { EquipmentInfo } from '../EquipmentInfo';
import { SpellIcon } from '../SpellIcon';
import { PlayerPieChart } from './PlayerPieChart';

interface IProps {
  player: ICombatUnit;
}

const specTalentEntryToSpellId = talentIdMap
  .map((a) => a.specNodes)
  .flat()
  .map((n) => n.entries)
  .flat()
  .reduce((prev, cur) => {
    prev[cur.id] = cur.spellId;
    return prev;
  }, {} as Record<number, number>);

const classTalentEntryToSpellId = talentIdMap
  .map((a) => a.classNodes)
  .flat()
  .map((n) => n.entries)
  .flat()
  .reduce((prev, cur) => {
    prev[cur.id] = cur.spellId;
    return prev;
  }, {} as Record<number, number>);

const maybeGetSpellIdFromTalentId = (talentId: number) => {
  return classTalentEntryToSpellId[talentId] ?? specTalentEntryToSpellId[talentId] ?? 0;
};

const equipmentOrdering = [12, 13, 15, 16, 10, 11, 0, 1, 2, 4, 5, 6, 7, 8, 9, 14, 17, 3];

// Shim to account for overhealing
const getAmountForEvent = (action: CombatHpUpdateAction) => {
  if (action.logLine.event === 'SPELL_PERIODIC_HEAL') {
    // TODO: the parser needs to give us more info about overhealing
    return action.logLine.parameters[28] - action.logLine.parameters[30];
  }
  if (action.logLine.event === 'SPELL_HEAL') {
    // TODO: the parser needs to give us more info about overhealing
    return action.logLine.parameters[28] - action.logLine.parameters[30];
  }
  return Math.abs(action.amount);
};

const compileDataBySpell = (actions: CombatHpUpdateAction[]) => {
  const groups = _.groupBy(
    actions.filter((a) => a.amount !== 0),
    (a) => a.spellId,
  );
  return _.map(groups, (actionsGroup, spellId) => {
    return {
      id: spellId,
      name: _.first(actionsGroup.filter((a) => a.spellName).map((a) => a.spellName)) || 'Auto Attack',
      value: _.sum(actionsGroup.map((a) => getAmountForEvent(a))),
    };
  }).sort((a, b) => b.value - a.value);
};

const compileAbsorbsBySpell = (actions: CombatAbsorbAction[]) => {
  const groups = _.groupBy(
    actions.filter((a) => a.absorbedAmount !== 0),
    (a) => a.shieldSpellId,
  );

  return _.map(groups, (actionsGroup, spellId) => {
    return {
      id: spellId,
      count: actionsGroup.length,
      name: _.first(actionsGroup.filter((a) => a.shieldSpellName).map((a) => a.shieldSpellName)) || 'Auto Attack',
      value: _.sum(actionsGroup.map((a) => a.absorbedAmount)),
    };
  }).sort((a, b) => b.value - a.value);
};

//
const compileAbsorbsByDest = (actions: CombatAbsorbAction[]) => {
  const groups = _.groupBy(
    actions.filter((a) => a.absorbedAmount !== 0),
    (a) => a.destUnitId,
  );
  return _.map(groups, (actionsGroup, destUnitId) => {
    return {
      id: destUnitId,
      name: _.first(actionsGroup.filter((a) => a.destUnitName).map((a) => a.destUnitName)) || 'Unknown',
      value: _.sum(actionsGroup.map((a) => a.absorbedAmount)),
    };
  }).sort((a, b) => b.value - a.value);
};

const compileDataByDest = (actions: CombatHpUpdateAction[]) => {
  const groups = _.groupBy(
    actions.filter((a) => a.amount !== 0),
    (a) => a.destUnitId,
  );
  return _.map(groups, (actionsGroup, destUnitId) => {
    return {
      id: destUnitId,
      name: _.first(actionsGroup.filter((a) => a.destUnitName).map((a) => a.destUnitName)) || 'Unknown',
      value: _.sum(actionsGroup.map((a) => getAmountForEvent(a))),
    };
  }).sort((a, b) => b.value - a.value);
};

export function CombatPlayer(props: IProps) {
  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).$WowheadPower.refreshLinks();
    } catch (e) {
      // oh well
    }
  }, [props.player]);

  const damageDoneBySpells = useMemo(() => {
    return compileDataBySpell(props.player.damageOut);
  }, [props.player]);

  const healsDoneBySpells = useMemo(() => {
    return [...compileDataBySpell(props.player.healOut), ...compileAbsorbsBySpell(props.player.absorbsOut)].sort(
      (a, b) => b.value - a.value,
    );
  }, [props.player]);

  const damageDoneByDest = useMemo(() => {
    return compileDataByDest(props.player.damageOut);
  }, [props.player]);

  const healsDoneByDest = useMemo(() => {
    return [...compileDataByDest(props.player.healOut), ...compileAbsorbsByDest(props.player.absorbsOut)].sort(
      (a, b) => b.value - a.value,
    );
  }, [props.player]);

  if (!props.player.info) {
    return null;
  }

  const orderedEquipment = equipmentOrdering
    .map((o) => ({
      slot: o,
      item: props.player.info?.equipment[o],
    }))
    .filter((i) => i.item?.id !== '0') // Filter out items with no id (empty slots)
    .filter((i) => ![3, 17].includes(i.slot)); // Filter out shirt and tabard

  const orderedEquipmentHalfwayPoint = Math.ceil(orderedEquipment.length / 2);

  return (
    <div className="flex flex-row pb-4 flex-1 flex-wrap">
      <div>
        <div className="flex flex-row items-center">
          <CombatUnitName unit={props.player} isTitle />
          {
            // <ArmoryLink player={props.player} />
            // <CheckPvPLink player={props.player} />
          }
        </div>
        {
          // <div className="flex flex-row items-center mt-1">{<AchievementBadge player={props.player} />}</div>
        }
        <div className="stats bg-base-300 rounded-box mt-4">
          <CombatStatistic title="Rating" value={props.player.info?.personalRating || 0} />
          <CombatStatistic title="Item Level" value={Math.trunc(Utils.getAverageItemLevel(props.player)).toFixed(0)} />
          <CombatStatistic
            title="Crit"
            value={Math.max(
              props.player.info?.critMelee || 0,
              props.player.info?.critRanged || 0,
              props.player.info?.critSpell || 0,
            )}
          />
          <CombatStatistic
            title="Haste"
            value={Math.max(
              props.player.info?.hasteMelee || 0,
              props.player.info?.hasteRanged || 0,
              props.player.info?.hasteSpell || 0,
            )}
          />
          <CombatStatistic title="Mastery" value={props.player.info?.mastery || 0} />
          <CombatStatistic
            title="Versatility"
            value={Math.max(
              props.player.info?.versatilityDamageTaken || 0,
              props.player.info?.versatilityDamgeDone || 0,
              props.player.info?.versatilityHealingDone || 0,
            )}
          />
        </div>
        <div className="mt-4">
          <div className="text-lg font-bold">Talents</div>
          <div className="flex flex-row flex-wrap items-center mt-2">
            {props.player.info?.talents.map((t, i) => (
              <div className="mr-1" key={i}>
                <SpellIcon spellId={maybeGetSpellIdFromTalentId(t?.id2 || 0)} size={32} />
              </div>
            ))}
            <div className="divider divier-vertical" />
            {props.player.info?.pvpTalents
              .filter((t) => t && t !== '0')
              .map((t, i) => (
                <div className="ml-1" key={i}>
                  <SpellIcon spellId={t} size={32} />
                </div>
              ))}
          </div>
        </div>
        <div className="mt-2">
          <div className="text-lg font-bold">Gear</div>
          <div className="flex flex-row mt-2">
            <div className="flex flex-col mr-4">
              {orderedEquipment.slice(0, orderedEquipmentHalfwayPoint).map((d) => (
                <EquipmentInfo key={d.slot} item={d.item} />
              ))}
            </div>
            <div className="flex flex-col">
              {orderedEquipment.slice(orderedEquipmentHalfwayPoint, 18).map((d) => (
                <EquipmentInfo key={d.slot} item={d.item} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {damageDoneBySpells.length > 0 && (
        <div className="mt-4">
          <div className="text-lg font-bold">Damage Done</div>
          <div className="flex flex-row">
            <PlayerPieChart data={damageDoneBySpells} />
            <PlayerPieChart data={damageDoneByDest} />
          </div>
        </div>
      )}
      {healsDoneBySpells.length > 0 && (
        <div className="mt-4">
          <div className="text-lg font-bold">Healing Done</div>
          <div className="flex flex-row">
            <PlayerPieChart data={healsDoneBySpells} />
            <PlayerPieChart data={healsDoneByDest} />
          </div>
        </div>
      )}
    </div>
  );
}

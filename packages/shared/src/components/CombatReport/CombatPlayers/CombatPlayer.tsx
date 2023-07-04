import {
  CombatAbsorbAction,
  CombatAction,
  CombatHpUpdateAction,
  CombatUnitType,
  ICombatUnit,
} from '@wowarenalogs/parser';
import _ from 'lodash';
import { useEffect, useMemo } from 'react';

import talentIdMap from '../../../data/talentIdMap.json';
import { Utils } from '../../../utils/utils';
import { AchievementBadge } from '../AchievementBadge';
import { useCombatReportContext } from '../CombatReportContext';
import { CombatUnitName } from '../CombatUnitName';
import { EquipmentInfo } from '../EquipmentInfo';
import { SpellIcon } from '../SpellIcon';
import { ArmoryLink } from './ArmoryLink';
import { CheckPvPLink } from './CheckPvPLink';
import { TalentDisplay } from './TalentDisplay';

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

export const maybeGetSpellIdFromTalentId = (talentId: number) => {
  return classTalentEntryToSpellId[talentId] ?? specTalentEntryToSpellId[talentId] ?? 0;
};

const equipmentOrdering = [12, 13, 15, 16, 10, 11, 0, 1, 2, 4, 5, 6, 7, 8, 9, 14, 17, 3];

const compileDamageBySpell = (actions: CombatHpUpdateAction[], ownerActorId: string) => {
  const groups = _.groupBy(
    actions.filter((a) => a.effectiveAmount !== 0),
    (a) => {
      return a.srcUnitName + '-' + (a.spellId || 'swing');
    },
  );
  return _.map(groups, (actionsGroup, _groupKey) => {
    const spellName = _.first(actionsGroup.filter((a) => a.spellName).map((a) => a.spellName)) || 'Auto Attack';
    const spellId = _.first(actionsGroup.filter((a) => a.spellId).map((a) => a.spellId)) || '0';
    const maybeActorId = _.first(actionsGroup.filter((a) => a.srcUnitId).map((a) => a.srcUnitId));
    let maybeActorName = _.first(actionsGroup.filter((a) => a.srcUnitName).map((a) => a.srcUnitName));
    maybeActorName = maybeActorId === ownerActorId ? '' : `(Pet) ${maybeActorName}: `;
    console.log({ groups });
    return {
      id: spellId,
      name: maybeActorName + spellName,
      value: _.sum(actionsGroup.map((a) => Math.abs(a.effectiveAmount))),
    };
  }).sort((a, b) => b.value - a.value);
};

// vs compileDamageBySpell:
// no effectiveAmount required
// heals or damage are allowed
const compileCastsBySpell = (actions: CombatAction[]) => {
  const groups = _.groupBy(actions, (a) => a.spellId);
  return _.map(groups, (actionsGroup, spellId) => {
    return {
      id: spellId,
      name: _.first(actionsGroup.filter((a) => a.spellName).map((a) => a.spellName)) || 'Auto Attack',
      value: actionsGroup.filter((a) => a.logLine.event === 'SPELL_CAST_SUCCESS').length,
    };
  }).sort((a, b) => b.value - a.value);
};

const compileDamageByDest = (actions: CombatHpUpdateAction[]) => {
  const groups = _.groupBy(
    actions.filter((a) => a.effectiveAmount !== 0),
    (a) => a.destUnitId,
  );
  return _.map(groups, (actionsGroup, destUnitId) => {
    return {
      id: destUnitId,
      name: _.first(actionsGroup.filter((a) => a.destUnitName).map((a) => a.destUnitName)) || 'Unknown',
      value: _.sum(actionsGroup.map((a) => Math.abs(a.effectiveAmount))),
    };
  }).sort((a, b) => b.value - a.value);
};

const compileHealsBySpell = (heals: CombatHpUpdateAction[], absorbs: CombatAbsorbAction[]) => {
  const actions = _.concat(
    heals.map((a) => {
      return {
        spellId: a.spellId,
        spellName: a.spellName,
        effectiveAmount: a.effectiveAmount,
      };
    }),
    absorbs.map((a) => {
      return {
        spellId: a.shieldSpellId,
        spellName: a.shieldSpellName,
        effectiveAmount: a.effectiveAmount,
      };
    }),
  );
  const groups = _.groupBy(
    actions.filter((a) => a.effectiveAmount !== 0),
    (a) => a.spellId,
  );

  return _.map(groups, (actionsGroup, spellId) => {
    return {
      id: spellId,
      count: actionsGroup.length,
      name: _.first(actionsGroup.filter((a) => a.spellName).map((a) => a.spellName)) || 'Auto Attack',
      value: _.sum(actionsGroup.map((a) => a.effectiveAmount)),
    };
  }).sort((a, b) => b.value - a.value);
};

const compileHealsByDest = (heals: CombatHpUpdateAction[], absorbs: CombatAbsorbAction[]) => {
  const actions = _.concat(
    heals.map((a) => {
      return {
        destUnitId: a.destUnitId,
        destUnitName: a.destUnitName,
        effectiveAmount: a.effectiveAmount,
      };
    }),
    absorbs.map((a) => {
      return {
        destUnitId: a.destUnitId,
        destUnitName: a.destUnitName,
        effectiveAmount: a.effectiveAmount,
      };
    }),
  );
  const groups = _.groupBy(
    actions.filter((a) => a.effectiveAmount !== 0),
    (a) => a.destUnitId,
  );
  return _.map(groups, (actionsGroup, destUnitId) => {
    return {
      id: destUnitId,
      name: _.first(actionsGroup.filter((a) => a.destUnitName).map((a) => a.destUnitName)) || 'Unknown',
      value: _.sum(actionsGroup.map((a) => a.effectiveAmount)),
    };
  }).sort((a, b) => b.value - a.value);
};

function compileAuraApplicationsBySpell(player: ICombatUnit) {
  const aurasUpdated = _.groupBy(
    player.auraEvents.filter((a) => ['SPELL_AURA_REMOVED', 'SPELL_AURA_APPLIED'].includes(a.logLine.event)),
    (a) => a.spellId,
  );
  const applications: Record<
    string,
    {
      spellName: string | null;
      spellId: string;
      spellSchoolId: string | null;
      durationInSeconds: number;
    }[]
  > = {};
  _.keys(aurasUpdated).forEach((spellId) => {
    const updates = aurasUpdated[spellId];
    let isActive = false;
    let timeApplied = 0;
    updates.forEach((update) => {
      if (!isActive && update.logLine.event === 'SPELL_AURA_APPLIED') {
        isActive = true;
        timeApplied = update.timestamp;
      }
      if (isActive && update.logLine.event === 'SPELL_AURA_REMOVED') {
        isActive = false;
        if (!applications[spellId]) {
          applications[spellId] = [];
        }
        applications[spellId].push({
          spellName: update.spellName,
          spellId,
          spellSchoolId: update.spellSchoolId,
          durationInSeconds: (update.timestamp - timeApplied) / 1000,
        });
      }
    });
  });
  return applications;
}
export function CombatPlayer(props: IProps) {
  const { combat } = useCombatReportContext();

  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).$WowheadPower.refreshLinks();
    } catch (e) {
      // oh well
    }
  }, [props.player]);

  const auraUptimes = useMemo(() => {
    const applications = compileAuraApplicationsBySpell(props.player);
    const updates = _.keys(applications)
      .map((spellId) => {
        const auraUpdates = applications[spellId];
        const totalTimeInSeconds = _.sum(auraUpdates.map((u) => u.durationInSeconds));
        return {
          spellId,
          spellName: auraUpdates[0].spellName,
          spellSchoolId: auraUpdates[0].spellSchoolId,
          totalTimeInSeconds,
          uptime: (100 * totalTimeInSeconds) / (combat?.durationInSeconds || 1),
        };
      })
      .sort((a, b) => b.uptime - a.uptime);
    return updates;
  }, [props.player, combat?.durationInSeconds]);

  const castsDoneBySpells = useMemo(() => {
    return compileCastsBySpell(props.player.spellCastEvents);
  }, [props.player]);

  const damageDoneBySpells = useMemo(() => {
    return compileDamageBySpell(props.player.damageOut, props.player.id);
  }, [props.player]);
  const damageDoneBySpellsMax = _.max(damageDoneBySpells.map((s) => s.value)) || 1;
  const damageDoneBySpellsSum = _.sum(damageDoneBySpells.map((s) => s.value));

  const healsDoneBySpells = useMemo(() => {
    return compileHealsBySpell(props.player.healOut, props.player.absorbsOut);
  }, [props.player]);
  const healsDoneBySpellsMax = _.max(healsDoneBySpells.map((s) => s.value)) || 1;
  const healsDoneBySpellsSum = _.sum(healsDoneBySpells.map((s) => s.value));

  const damageDoneByDest = useMemo(() => {
    return compileDamageByDest(props.player.damageOut).filter((d) =>
      combat ? combat.units[d.id].type === CombatUnitType.Player : false,
    );
  }, [props.player, combat]);
  const damageDoneByDestMax = _.max(damageDoneByDest.map((s) => s.value)) || 1;
  const damageDoneByDestSum = _.sum(damageDoneByDest.map((s) => s.value));

  const healsDoneByDest = useMemo(() => {
    return compileHealsByDest(props.player.healOut, props.player.absorbsOut).filter((d) =>
      combat ? combat.units[d.id].type === CombatUnitType.Player : false,
    );
  }, [props.player, combat]);
  const healsDoneByDestMax = _.max(healsDoneByDest.map((s) => s.value)) || 1;
  const healsDoneByDestSum = _.sum(healsDoneByDest.map((s) => s.value));

  if (!props.player.info || !combat) {
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
    <div className="flex flex-col flex-1 pb-4">
      <div className="flex flex-row items-start gap-2">
        <CombatUnitName unit={props.player} isTitle />
        <div className="flex-1" />
        <ArmoryLink player={props.player} />
        <CheckPvPLink player={props.player} />
      </div>
      <div className="mt-2">
        <AchievementBadge player={props.player} />
      </div>
      <table className="table rounded-box mt-4 self-start">
        <thead>
          <tr>
            <th className="bg-base-300">Rating</th>
            <th className="bg-base-300">Item Level</th>
            <th className="bg-base-300">Crit</th>
            <th className="bg-base-300">Haste</th>
            <th className="bg-base-300">Mastery</th>
            <th className="bg-base-300">Versatility</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="bg-base-200">{props.player.info?.personalRating || 0}</td>
            <td className="bg-base-200">{Math.trunc(Utils.getAverageItemLevel(props.player)).toFixed(0)}</td>
            <td className="bg-base-200">
              {Math.max(
                props.player.info?.critMelee || 0,
                props.player.info?.critRanged || 0,
                props.player.info?.critSpell || 0,
              )}
            </td>
            <td className="bg-base-200">
              {Math.max(
                props.player.info?.hasteMelee || 0,
                props.player.info?.hasteRanged || 0,
                props.player.info?.hasteSpell || 0,
              )}
            </td>
            <td className="bg-base-200">{props.player.info?.mastery || 0}</td>
            <td className="bg-base-200">
              {Math.max(
                props.player.info?.versatilityDamageTaken || 0,
                props.player.info?.versatilityDamgeDone || 0,
                props.player.info?.versatilityHealingDone || 0,
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="mt-4">
        <TalentDisplay player={props.player} />
      </div>
      <div className="mt-4">
        <div className="text-lg font-bold">Gear</div>
        <div className="flex flex-row mt-2">
          <div className="flex flex-col mr-4">
            {orderedEquipment.slice(0, orderedEquipmentHalfwayPoint).map((d) => (
              <EquipmentInfo key={d.slot} item={d.item} size="medium" />
            ))}
          </div>
          <div className="flex flex-col">
            {orderedEquipment.slice(orderedEquipmentHalfwayPoint, 18).map((d) => (
              <EquipmentInfo key={d.slot} item={d.item} size="medium" />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4">
        <div className="text-lg font-bold">Stats</div>
        <table className="table table-compact mt-2 max-w-3xl">
          <thead>
            <tr>
              <th colSpan={4} className="bg-base-300">
                DAMAGE SPELLS
              </th>
            </tr>
          </thead>
          <tbody>
            {damageDoneBySpells.map((d) => (
              <tr key={d.id}>
                <td className="bg-base-200 flex flex-row items-center">
                  <SpellIcon spellId={d.id} size={24} />
                  <div className="ml-1">{d.name}</div>
                </td>
                <td className="bg-base-200 w-full">
                  <progress
                    className="progress w-full progress-error"
                    value={Math.floor(((d.value || 0) * 100) / damageDoneBySpellsMax)}
                    max={100}
                  />
                </td>
                <td className="bg-base-200">{(((d.value || 0) * 100) / damageDoneBySpellsSum).toFixed(1)}%</td>
                <td className="bg-base-200">{Utils.printCombatNumber(d.value)}</td>
              </tr>
            ))}
            <tr>
              <th colSpan={4} className="bg-base-300">
                DAMAGE TARGETS
              </th>
            </tr>
            {damageDoneByDest.map((d) => (
              <tr key={d.id}>
                <td className="bg-base-200">
                  <CombatUnitName unit={combat.units[d.id]} navigateToPlayerView />
                </td>
                <td className="bg-base-200 w-full">
                  <progress
                    className="progress w-full progress-error"
                    value={Math.floor(((d.value || 0) * 100) / damageDoneByDestMax)}
                    max={100}
                  />
                </td>
                <td className="bg-base-200">{(((d.value || 0) * 100) / damageDoneByDestSum).toFixed(1)}%</td>
                <td className="bg-base-200">{Utils.printCombatNumber(d.value)}</td>
              </tr>
            ))}
            <tr>
              <th colSpan={4} className="bg-base-300">
                HEALING SPELLS
              </th>
            </tr>
            {healsDoneBySpells.map((d) => (
              <tr key={d.id}>
                <td className="bg-base-200 flex flex-row items-center">
                  <SpellIcon spellId={d.id} size={24} />
                  <div className="ml-1">{d.name}</div>
                </td>
                <td className="bg-base-200 w-full">
                  <progress
                    className="progress w-full progress-success"
                    value={Math.floor(((d.value || 0) * 100) / healsDoneBySpellsMax)}
                    max={100}
                  />
                </td>
                <td className="bg-base-200">{(((d.value || 0) * 100) / healsDoneBySpellsSum).toFixed(1)}%</td>
                <td className="bg-base-200">{Utils.printCombatNumber(d.value)}</td>
              </tr>
            ))}
            <tr>
              <th colSpan={4} className="bg-base-300">
                HEALING TARGETS
              </th>
            </tr>
            {healsDoneByDest.map((d) => (
              <tr key={d.id}>
                <td className="bg-base-200">
                  <CombatUnitName unit={combat.units[d.id]} navigateToPlayerView />
                </td>
                <td className="bg-base-200 w-full">
                  <progress
                    className="progress w-full progress-success"
                    value={Math.floor(((d.value || 0) * 100) / healsDoneByDestMax)}
                    max={100}
                  />
                </td>
                <td className="bg-base-200">{(((d.value || 0) * 100) / healsDoneByDestSum).toFixed(1)}%</td>
                <td className="bg-base-200">{Utils.printCombatNumber(d.value)}</td>
              </tr>
            ))}
            <tr>
              <th colSpan={4} className="bg-base-300">
                CAST FREQUENCY
              </th>
            </tr>
            {castsDoneBySpells.map((d) => (
              <tr key={d.id}>
                <td className="bg-base-200 flex flex-row items-center">
                  <SpellIcon spellId={d.id} size={24} />
                  <div className="ml-1">{d.name}</div>
                </td>
                <td className="bg-base-200 w-full"></td>
                <td className="bg-base-200">{d.value} casts</td>
                <td className="bg-base-200">{((60 * d.value) / combat.durationInSeconds).toFixed(1)}/min</td>
              </tr>
            ))}
            <tr>
              <th colSpan={4} className="bg-base-300">
                AURA UPTIMES
              </th>
            </tr>
            {auraUptimes.map((a) => (
              <tr key={a.spellId}>
                <td className="bg-base-200 flex flex-row items-center">
                  <SpellIcon spellId={a.spellId} size={24} />
                  <div className="ml-1">{a.spellName}</div>
                </td>
                <td className="bg-base-200 w-full"></td>
                <td className="bg-base-200">{a.totalTimeInSeconds.toFixed(1)}s</td>
                <td className="bg-base-200">{a.uptime.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { getApolloContext } from '@apollo/client';
import { Divider } from 'antd';
import Title from 'antd/lib/typography/Title';
import _ from 'lodash';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { useContext, useEffect, useMemo } from 'react';
import {
  CombatAbsorbAction,
  CombatHpUpdateAction,
  CombatUnitClass,
  getClassColor,
  ICombatUnit,
} from 'wow-combat-log-parser';

import { useGetProfileQuery } from '../../../../graphql/__generated__/graphql';
import { Utils } from '../../../../utils';
import { canUseFeature } from '../../../../utils/features';
import { Box } from '../../../common/Box';
import { AchievementBadge } from '../AchievementBadge';
import { ArmoryLink } from '../ArmoryLink';
import { CheckPvPLink } from '../CheckPvPLink';
import { useCombatReportContext } from '../CombatReportContext';
import { CombatStatistic } from '../CombatStatistic';
import { CombatUnitName } from '../CombatUnitName';
import { EquipmentInfo } from '../EquipmentInfo';
import { SpellIcon } from '../SpellIcon';

const Pie = dynamic(
  () => {
    const promise = import('@ant-design/charts').then((mod) => mod.Pie);
    return promise;
  },
  { ssr: false },
);

const PIE_CHART_CONFIG = {
  angleField: 'amount',
  radius: 1,
  innerRadius: 0.54,
  width: 450,
  height: 350,
  padding: 24,
  label: {
    type: 'outer',
    autoRotate: false,
    content: '{name} {percentage}',
    style: {
      fill: '#aaa',
    },
  },
  interactions: [{ type: 'pie-statistic-active' }],
};

interface IProps {
  player: ICombatUnit;
}

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

const compileDataBySpell = (actions: CombatHpUpdateAction[], autoAttackName: string) => {
  const groups = _.groupBy(
    actions.filter((a) => a.amount !== 0),
    (a) => a.spellId,
  );
  return _.map(groups, (actions, spellId) => {
    return {
      spellId,
      spellName: _.first(actions.filter((a) => a.spellName).map((a) => a.spellName)) || autoAttackName,
      amount: _.sum(actions.map((a) => getAmountForEvent(a))),
    };
  }).sort((a, b) => b.amount - a.amount);
};

const compileAbsorbsBySpell = (actions: CombatAbsorbAction[], autoAttackName: string) => {
  const groups = _.groupBy(
    actions.filter((a) => a.absorbedAmount !== 0),
    (a) => a.shieldSpellId,
  );

  return _.map(groups, (actions, spellId) => {
    return {
      spellId,
      count: actions.length,
      spellName: _.first(actions.filter((a) => a.shieldSpellName).map((a) => a.shieldSpellName)) || autoAttackName,
      amount: _.sum(actions.map((a) => a.absorbedAmount)),
    };
  }).sort((a, b) => b.amount - a.amount);
};

//
const compileAbsorbsByDest = (actions: CombatAbsorbAction[], unknownSpellName: string) => {
  const groups = _.groupBy(
    actions.filter((a) => a.absorbedAmount !== 0),
    (a) => a.destUnitId,
  );
  return _.map(groups, (actions, destUnitId) => {
    return {
      destUnitId,
      destUnitName: _.first(actions.filter((a) => a.destUnitName).map((a) => a.destUnitName)) || unknownSpellName,
      amount: _.sum(actions.map((a) => a.absorbedAmount)),
    };
  }).sort((a, b) => b.amount - a.amount);
};

const compileDataByDest = (actions: CombatHpUpdateAction[], unknownSpellName: string) => {
  const groups = _.groupBy(
    actions.filter((a) => a.amount !== 0),
    (a) => a.destUnitId,
  );
  return _.map(groups, (actions, destUnitId) => {
    return {
      destUnitId,
      destUnitName: _.first(actions.filter((a) => a.destUnitName).map((a) => a.destUnitName)) || unknownSpellName,
      amount: _.sum(actions.map((a) => getAmountForEvent(a))),
    };
  }).sort((a, b) => b.amount - a.amount);
};

export function CombatPlayer(props: IProps) {
  const { t, i18n } = useTranslation();
  const combatReportContext = useCombatReportContext();
  const context = useContext(getApolloContext());
  const { data } = useGetProfileQuery({
    client: context.client,
  });

  useEffect(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).$WowheadPower.refreshLinks();
    } catch (e) {
      // oh well
    }
  }, [props.player]);

  const damageDoneBySpells = useMemo(() => {
    return compileDataBySpell(props.player.damageOut, t('combat-report-auto-attack'));
  }, [props.player, t]);

  const healsDoneBySpells = useMemo(() => {
    return [
      ...compileDataBySpell(props.player.healOut, t('combat-report-auto-attack')),
      ...compileAbsorbsBySpell(props.player.absorbsOut, t('combat-report-auto-attack')),
    ].sort((a, b) => b.amount - a.amount);
  }, [props.player, t]);

  const damageDoneByDest = useMemo(() => {
    return compileDataByDest(props.player.damageOut, t('unknown'));
  }, [props.player, t]);

  const healsDoneByDest = useMemo(() => {
    return [
      ...compileDataByDest(props.player.healOut, t('unknown')),
      ...compileAbsorbsByDest(props.player.absorbsOut, t('unknown')),
    ].sort((a, b) => b.amount - a.amount);
  }, [props.player, t]);

  if (!props.player.info) {
    return null;
  }

  const orderedEquipment = equipmentOrdering
    .map((o, i) => ({
      slot: o,
      item: props.player.info?.equipment[o],
    }))
    .filter((i) => i.item?.id !== '0') // Filter out items with no id (empty slots)
    .filter((i) => ![3, 17].includes(i.slot)); // Filter out shirt and tabard

  const orderedEquipmentHalfwayPoint = Math.ceil(orderedEquipment.length / 2);

  return (
    <Box display="flex" flexDirection="row" pb={4} flexWrap={'wrap'}>
      <Box>
        <Box display="flex" flexDirection="row" alignItems="center">
          <CombatUnitName unit={props.player} isTitle />
          {i18n.language !== 'zh-CN' && <ArmoryLink player={props.player} />}
          {canUseFeature(data?.me, 'check-pvp-link') && i18n.language !== 'zh-CN' && (
            <CheckPvPLink player={props.player} />
          )}
        </Box>
        <Box display="flex" flexDirection="row" alignItems="center" mt={1}>
          {<AchievementBadge player={props.player} />}
        </Box>
        <Box display="flex" flexDirection="row" mt={2} flexWrap="wrap">
          {combatReportContext.combat?.wowVersion === 'dragonflight' && (
            <CombatStatistic title={t('combat-report-rating')} value={props.player.info?.personalRating || 0} mr={5} />
          )}
          <CombatStatistic
            title={t('combat-report-item-level')}
            value={Math.trunc(Utils.getAverageItemLevel(props.player)).toFixed(0)}
            mr={7}
          />
          {combatReportContext.combat?.wowVersion === 'dragonflight' && (
            <>
              <CombatStatistic
                title={t('combat-report-crit')}
                value={Math.max(
                  props.player.info?.critMelee || 0,
                  props.player.info?.critRanged || 0,
                  props.player.info?.critSpell || 0,
                )}
                mr={5}
              />
              <CombatStatistic
                title={t('combat-report-haste')}
                value={Math.max(
                  props.player.info?.hasteMelee || 0,
                  props.player.info?.hasteRanged || 0,
                  props.player.info?.hasteSpell || 0,
                )}
                mr={5}
              />
              <CombatStatistic title={t('combat-report-mastery')} value={props.player.info?.mastery || 0} mr={5} />
              <CombatStatistic
                title={t('combat-report-versatility')}
                value={Math.max(
                  props.player.info?.versatilityDamageTaken || 0,
                  props.player.info?.versatilityDamgeDone || 0,
                  props.player.info?.versatilityHealingDone || 0,
                )}
                mr={5}
              />
            </>
          )}
        </Box>
        {combatReportContext.combat?.wowVersion === 'dragonflight' && (
          <Box mt={2}>
            <div style={{ fontSize: 20 }}>Warning: Talents are currently broken!</div>
            <Box display="flex" flexDirection="row" flexWrap="wrap" alignItems="center">
              {props.player.info?.talents.map((t, i) => (
                <Box key={i} mr={1}>
                  <SpellIcon spellId={t.id1} size={32} />
                </Box>
              ))}
              <Divider type="vertical" style={{ height: 32 }} />
              {props.player.info?.pvpTalents
                .filter((t) => t && t !== '0')
                .map((t, i) => (
                  <Box key={i} ml={1}>
                    <SpellIcon spellId={t} size={32} />
                  </Box>
                ))}
            </Box>
          </Box>
        )}
        {combatReportContext.combat?.wowVersion === 'dragonflight' && (
          <Box mt={2}>
            <Title level={5}>{t('combat-report-gear')}</Title>
            <Box display="flex" flexDirection="row">
              <Box display="flex" flexDirection="column" mr={4}>
                {orderedEquipment.slice(0, orderedEquipmentHalfwayPoint).map((d) => (
                  <EquipmentInfo key={d.slot} item={d.item} />
                ))}
              </Box>
              <Box display="flex" flexDirection="column">
                {orderedEquipment.slice(orderedEquipmentHalfwayPoint, 18).map((d) => (
                  <EquipmentInfo key={d.slot} item={d.item} />
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </Box>

      {damageDoneBySpells.length > 0 && (
        <Box mt={4}>
          <Title level={5}>{t('combat-report-damage-done')}</Title>
          <Box display="flex" flexDirection="row">
            <Box>
              <Pie
                {...PIE_CHART_CONFIG}
                colorField={'spellName'}
                legend={false}
                data={damageDoneBySpells}
                statistic={{
                  title: {
                    style: {
                      color: '#aaa',
                    },
                    formatter: (v, all) => {
                      if (v) {
                        return v.spellName || '';
                      }
                      return t('combat-report-damage-done');
                    },
                  },
                  content: {
                    style: {
                      color: '#aaa',
                    },
                    formatter: (v, all) => {
                      if (v) {
                        return Utils.printCombatNumber(v?.amount) || '0';
                      }
                      return Utils.printCombatNumber(_.sum(all?.map((i) => i.amount)));
                    },
                  },
                }}
              />
            </Box>
            <Box>
              <Pie
                {...PIE_CHART_CONFIG}
                colorField={'destUnitId'}
                color={(v) => {
                  return getClassColor(combatReportContext.combat?.units[v.destUnitId].class || CombatUnitClass.None);
                }}
                legend={false}
                data={damageDoneByDest}
                label={{
                  type: 'outer',
                  autoRotate: false,
                  content: '{percentage}',
                  style: {
                    fill: '#aaa',
                  },
                }}
                statistic={{
                  title: {
                    style: {
                      color: '#aaa',
                    },
                    formatter: (v, all) => {
                      if (v) {
                        return v.destUnitName || '';
                      }
                      return t('combat-report-damage-targets');
                    },
                  },
                  content: {
                    style: {
                      color: '#aaa',
                    },
                    formatter: (v, all) => {
                      if (v) {
                        return Utils.printCombatNumber(v?.amount) || '0';
                      }
                      return Utils.printCombatNumber(all?.length || 0);
                    },
                  },
                }}
              />
            </Box>
          </Box>
        </Box>
      )}
      {healsDoneBySpells.length > 0 && (
        <Box mt={4}>
          <Title level={5}>{t('combat-report-heals-done')}</Title>
          <Box display="flex" flexDirection="row">
            <Box>
              <Pie
                {...PIE_CHART_CONFIG}
                colorField={'spellName'}
                legend={false}
                data={healsDoneBySpells}
                statistic={{
                  title: {
                    style: {
                      color: '#aaa',
                    },
                    formatter: (v, all) => {
                      if (v) {
                        return v.spellName || '';
                      }
                      return t('combat-report-heals-done');
                    },
                  },
                  content: {
                    style: {
                      color: '#aaa',
                    },
                    formatter: (v, all) => {
                      if (v) {
                        return Utils.printCombatNumber(v?.amount) || '0';
                      }
                      return Utils.printCombatNumber(_.sum(all?.map((i) => i.amount)));
                    },
                  },
                }}
              />
            </Box>
            <Box>
              <Pie
                {...PIE_CHART_CONFIG}
                colorField={'destUnitId'}
                color={(v) => {
                  return getClassColor(combatReportContext.combat?.units[v.destUnitId].class || CombatUnitClass.None);
                }}
                legend={false}
                data={healsDoneByDest}
                label={{
                  type: 'outer',
                  autoRotate: false,
                  content: '{percentage}',
                  style: {
                    fill: '#aaa',
                  },
                }}
                statistic={{
                  title: {
                    style: {
                      color: '#aaa',
                    },
                    formatter: (v, all) => {
                      if (v) {
                        return v.destUnitName || '';
                      }
                      return t('combat-report-heals-targets');
                    },
                  },
                  content: {
                    style: {
                      color: '#aaa',
                    },
                    formatter: (v, all) => {
                      if (v) {
                        return Utils.printCombatNumber(v?.amount) || '0';
                      }
                      return Utils.printCombatNumber(all?.length || 0);
                    },
                  },
                }}
              />
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

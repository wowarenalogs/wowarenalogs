import { Card, Divider } from 'antd';
import _ from 'lodash';
import React from 'react';
import { CombatUnitClass, CombatUnitType, ICombatData } from 'wow-combat-log-parser';

import { Box } from '../../../common/Box';
import { SpellIcon } from '../SpellIcon';

interface IProps {
  combat: ICombatData;
}

/**
 * [playerUnitId] casts [spellId] successfully
 */
function getSpellCasts(combat: ICombatData, playerUnitId: string, spellId: string) {
  return combat.units[playerUnitId].spellCastEvents.filter(
    (e) => e.logLine.event === 'SPELL_CAST_SUCCESS' && e.spellId === spellId,
  );
}

/**
 * [playerUnitId] casts a spell that causes [spellId] aura to apply against any other unit
 */
function getAuraApplications(combat: ICombatData, playerUnitId: string, spellId: string) {
  return _.values(combat.units)
    .map((sc) =>
      sc.auraEvents.filter(
        (ae) => ae.srcUnitId === playerUnitId && ae.logLine.event === 'SPELL_AURA_APPLIED' && ae.spellId === spellId,
      ),
    )
    .flat();
}

// Helper to parse some data the parser isnt extracting yet
function getBreakingSpell(rawLog: string[]) {
  return rawLog[12];
}

/**
 [playerUnitId] breaks an aura identified by [spellId] - note that we dont have direct info about the auras caster
 */
function getAuraBreaks(combat: ICombatData, playerUnitId: string, spellId: string) {
  return _.values(combat.units)
    .map((sc) =>
      sc.auraEvents.filter(
        (ae) =>
          ae.srcUnitId === playerUnitId && ae.logLine.event === 'SPELL_AURA_BROKEN_SPELL' && ae.spellId === spellId,
      ),
    )
    .flat();
}

export const FreezingTraps = (props: IProps) => {
  const players = _.sortBy(
    _.values(props.combat.units).filter((u) => u.type === CombatUnitType.Player),
    ['reaction'],
  );

  const numHunters = players.filter((d) => d.class === CombatUnitClass.Hunter).length;

  if (numHunters === 0) return null;

  const trapData = players
    .map((p) => ({
      unit: p,
      hits: getAuraApplications(props.combat, p.id, '3355'),
      casts: getSpellCasts(props.combat, p.id, '187650'),
    }))
    .filter((d) => d.unit.class === CombatUnitClass.Hunter);

  const trapDataWithStats = trapData.map((td) => ({
    castsPerMinute: (60 * td.casts.length) / props.combat.endInfo.matchDurationInSeconds,
    hitRate: (100 * td.hits.length) / td.casts.length,
    ...td,
  }));

  const trapBreaks = _.values(props.combat.units)
    .map((p) => getAuraBreaks(props.combat, p.id, '3355'))
    .flat();

  return (
    <Card>
      <Box display="flex" flexDirection="row">
        <SpellIcon spellId={'187650'} size={32} />
        <Box ml={2}>
          {trapDataWithStats.map((t, i) => {
            return (
              <div key={i}>
                {t.unit.name} {t.casts.length} casts ({t.castsPerMinute.toFixed(1)}/min) {t.hitRate.toFixed(1)}%
              </div>
            );
          })}
          {trapBreaks.length > 0 && <Divider />}
          {trapBreaks.map((b) => {
            return (
              <div key={b.timestamp}>
                {b.srcUnitName} broke {b.spellName} on {b.destUnitName} with {getBreakingSpell(b.logLine.parameters)}
              </div>
            );
          })}
        </Box>
      </Box>
    </Card>
  );
};

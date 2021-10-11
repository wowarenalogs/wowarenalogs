import _ from 'lodash';
import { ICombatData } from 'wow-combat-log-parser';

import { CombatDataStub } from '../../../graphql/__generated__/graphql';
import { CombatDataStubList } from '../CombatDataStubList';

export interface IProps {
  combats: ICombatData[];
  header: string;
  combatUrlFactory: (id: string) => string;
  goBack?: () => void;
  viewerName?: string;
}

function stubFromCombat(combat: ICombatData): CombatDataStub {
  const stub = {
    id: combat.id,
    endTime: combat.endTime,
    startTime: combat.startTime,
    result: combat.result,
    logObjectUrl: combat.id,
    playerTeamId: combat.playerTeamId,
    playerTeamRating: combat.playerTeamRating,
    hasAdvancedLogging: combat.hasAdvancedLogging,
    startInfo: combat.startInfo,
    endInfo: combat.endInfo,
    units:
      _.values(combat.units).map((u) => ({
        id: u.id,
        name: u.name,
        info: u.info || undefined,
        type: u.type,
        spec: u.spec,
        class: u.class,
        reaction: u.reaction,
      })) || [],
  };
  return stub;
}

export function MatchList({ combats, header, combatUrlFactory }: IProps) {
  const sortedCombats = _.sortBy(combats, (combat) => -combat.endTime).map((c) => stubFromCombat(c));
  return <CombatDataStubList combats={sortedCombats} header={header} combatUrlFactory={combatUrlFactory} />;
}

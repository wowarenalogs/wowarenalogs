import moment from 'moment';

import { Utils } from '../../../utils/utils';
import { useCombatReportContext } from '../CombatReportContext';
import { CombatStatistic } from '../CombatStatistic';

export const CombatSummary = () => {
  const { combat, isAnonymized, enemies, friends, players } = useCombatReportContext();
  if (!combat) {
    return null;
  }

  const deadPlayers = players
    .filter((u) => u.deathRecords.length > 0)
    .sort((a, b) => a.deathRecords[0].timestamp - b.deathRecords[0].timestamp);

  const enemyAvgItemLevel = enemies.length ? _.sumBy(enemies, (u) => Utils.getAverageItemLevel(u)) / enemies.length : 0;
  const friendsAvgItemLevel = enemies.length
    ? _.sumBy(friends, (u) => Utils.getAverageItemLevel(u)) / friends.length
    : 0;
  const iLvlAdvantage = friendsAvgItemLevel - enemyAvgItemLevel;

  return (
    <div className="flex flex-col">
      <div className="stats">
        <CombatStatistic title="Duration" value={moment.utc(combat.endTime - combat.startTime).format('mm:ss')} />
        <CombatStatistic title="Team MMR" value={combat.playerTeamRating.toFixed()} />
        {isAnonymized ? (
          <CombatStatistic title="iLvl Difference" value={Math.abs(iLvlAdvantage).toFixed(1)} />
        ) : (
          <CombatStatistic
            title="iLvl Advantage"
            value={iLvlAdvantage.toFixed(1)}
            valueColor={iLvlAdvantage >= 0 ? 'text-success' : 'text-error'}
          />
        )}
      </div>
    </div>
  );
};

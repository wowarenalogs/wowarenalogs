import { getEffectiveCombatDuration } from '@wowarenalogs/parser';
import _ from 'lodash';
import moment from 'moment';

import { getDampeningPercentage } from '../../../utils/dampening';
import { Utils } from '../../../utils/utils';
import { TimestampDisplay } from '../../common/TimestampDisplay';
import { useCombatReportContext } from '../CombatReportContext';
import { CombatUnitName } from '../CombatUnitName';

export const Meters = () => {
  const {
    viewerIsOwner,
    combat,
    enemies,
    friends,
    players,
    playerTotalDamageOut,
    playerTotalHealOut,
    playerTotalSupportIn,
  } = useCombatReportContext();

  if (!combat) {
    return null;
  }

  const playersSortedByDamage = players.slice();
  playersSortedByDamage.sort((a, b) => {
    const ad = playerTotalDamageOut.get(a.id) || 0;
    const bd = playerTotalDamageOut.get(b.id) || 0;
    return bd - ad;
  });

  const playersSortedByHeals = players.slice();
  playersSortedByHeals.sort((a, b) => {
    const ad = playerTotalHealOut.get(a.id) || 0;
    const bd = playerTotalHealOut.get(b.id) || 0;
    return bd - ad;
  });

  const maxDam = Math.max(...Array.from(playerTotalDamageOut.values()));
  const maxHeal = Math.max(...Array.from(playerTotalHealOut.values()));

  const enemyAvgItemLevel = enemies.length ? _.sumBy(enemies, (u) => Utils.getAverageItemLevel(u)) / enemies.length : 0;
  const friendsAvgItemLevel = enemies.length
    ? _.sumBy(friends, (u) => Utils.getAverageItemLevel(u)) / friends.length
    : 0;
  const iLvlAdvantage = friendsAvgItemLevel - enemyAvgItemLevel;
  const effectiveDuration = getEffectiveCombatDuration(combat);
  const latestDampening = getDampeningPercentage(combat.startInfo.bracket, players, combat.endTime);

  const damageBarWidths = playersSortedByDamage.map((u) =>
    Math.round(Math.floor((playerTotalDamageOut.get(u.id) || 0) * 100) / maxDam),
  );
  const supportedBarWidths = playersSortedByDamage.map((u) =>
    Math.round(Math.floor((playerTotalSupportIn.get(u.id) || 0) * 100) / maxDam),
  );

  return (
    <div className="flex flex-col">
      <div className="flex flex-col rounded-box bg-base-300">
        <table className="table table-compact">
          <tbody>
            <tr>
              <th colSpan={4} className="bg-base-300">
                STATS
              </th>
            </tr>
            <tr>
              <td colSpan={2} className="bg-base-200">
                Start Time
              </td>
              <td colSpan={2} className="text-right bg-base-200">
                <TimestampDisplay timestamp={combat.startTime} timezone={combat.timezone} />
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="bg-base-200">
                Duration
              </td>
              <td colSpan={2} className="text-right bg-base-200">
                {moment.utc(combat.endTime - combat.startTime).format('mm:ss')}
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="bg-base-200">
                Dampening
              </td>
              <td colSpan={2} className="text-right bg-base-200">
                {latestDampening.toFixed()}%
              </td>
            </tr>
            {combat.playerTeamRating ? (
              <tr>
                <td colSpan={2} className="bg-base-200">
                  Team MMR
                </td>
                <td colSpan={2} className="text-right bg-base-200">
                  {combat.playerTeamRating?.toFixed()}
                </td>
              </tr>
            ) : null}
            {!viewerIsOwner ? (
              <tr>
                <td colSpan={2} className="bg-base-200">
                  Item Level Difference
                </td>
                <td colSpan={2} className="text-right bg-base-200">
                  {Math.abs(iLvlAdvantage).toFixed(1)}
                </td>
              </tr>
            ) : (
              <tr>
                <td colSpan={2} className="bg-base-200">
                  Item Level Advantage
                </td>
                <td
                  colSpan={2}
                  className={`text-right bg-base-200 ${iLvlAdvantage >= 0 ? 'text-success' : 'text-error'}`}
                >
                  {iLvlAdvantage.toFixed(1)}
                </td>
              </tr>
            )}
            <tr>
              <th colSpan={4} className="bg-base-300">
                DAMAGE
              </th>
            </tr>
            {playersSortedByDamage.map((u, _i) => (
              <tr key={`${u.id}`}>
                <td className="bg-base-200">
                  <CombatUnitName unit={u} navigateToPlayerView />
                </td>
                <td className="bg-base-200">{`${Utils.printCombatNumber(playerTotalDamageOut.get(u.id) || 0)}`}</td>
                <td className="bg-base-200">
                  {`${Utils.printCombatNumber((playerTotalDamageOut.get(u.id) || 0) / (effectiveDuration || 1))}/s`}
                </td>
                <td className="bg-base-200 items-center">
                  <div className="h-2 relative">
                    <div
                      className={`inline-block h-2 bg-error rounded-lg absolute left-0`}
                      style={{
                        width: `${damageBarWidths[_i]}%`,
                      }}
                    />
                    <div
                      className={`inline-block h-2 bg-secondary rounded-lg absolute left-0`}
                      style={{
                        width: `${supportedBarWidths[_i]}%`,
                      }}
                      title={`${supportedBarWidths[_i]}% added from supporting classes (${Utils.printCombatNumber(
                        playerTotalSupportIn.get(u.id) || 0,
                      )})`}
                    />
                  </div>
                </td>
              </tr>
            ))}
            <tr>
              <th colSpan={4} className="bg-base-300">
                HEALING
              </th>
            </tr>
            {playersSortedByHeals.map((u, _i) => (
              <tr key={`${u.id}`}>
                <td className="bg-base-200">
                  <CombatUnitName unit={u} navigateToPlayerView />
                </td>
                <td className="bg-base-200">{`${Utils.printCombatNumber(playerTotalHealOut.get(u.id) || 0)}`}</td>
                <td className="bg-base-200">
                  {`${Utils.printCombatNumber((playerTotalHealOut.get(u.id) || 0) / (effectiveDuration || 1))}/s`}
                </td>
                <td className="bg-base-200">
                  <progress
                    className="progress w-20 progress-success"
                    value={Math.floor(((playerTotalHealOut.get(u.id) || 0) * 100) / maxHeal)}
                    max={100}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

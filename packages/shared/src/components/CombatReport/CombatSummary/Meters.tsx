import _ from 'lodash';
import moment from 'moment';

import { Utils } from '../../../utils/utils';
import { TimestampDisplay } from '../../common/TimestampDisplay';
import { useCombatReportContext } from '../CombatReportContext';
import { CombatUnitName } from '../CombatUnitName';

export const Meters = () => {
  const { isAnonymized, combat, enemies, friends, players, playerTotalDamageOut, playerTotalHealOut } =
    useCombatReportContext();

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
              <td colSpan={3} className="bg-base-200">
                Start Time
              </td>
              <td className="text-right bg-base-200">
                <TimestampDisplay timestamp={combat.startTime} timezone={combat.timezone} />
              </td>
            </tr>
            <tr>
              <td colSpan={3} className="bg-base-200">
                Duration
              </td>
              <td className="text-right bg-base-200">
                {moment.utc(combat.endTime - combat.startTime).format('mm:ss')}
              </td>
            </tr>
            {combat.playerTeamRating ? (
              <tr>
                <td colSpan={3} className="bg-base-200">
                  Team MMR
                </td>
                <td className="text-right bg-base-200">{combat.playerTeamRating?.toFixed()}</td>
              </tr>
            ) : null}
            {isAnonymized ? (
              <tr>
                <td colSpan={3} className="bg-base-200">
                  Item Level Difference
                </td>
                <td className="text-right bg-base-200">{Math.abs(iLvlAdvantage).toFixed(1)}</td>
              </tr>
            ) : (
              <tr>
                <td colSpan={3} className="bg-base-200">
                  Item Level Advantage
                </td>
                <td className={`text-right bg-base-200 ${iLvlAdvantage >= 0 ? 'text-success' : 'text-error'}`}>
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
                  {`${Utils.printCombatNumber(
                    (playerTotalDamageOut.get(u.id) || 0) / (combat?.durationInSeconds || 1),
                  )}/s`}
                </td>
                <td className="bg-base-200">
                  <progress
                    className="progress w-32 progress-error"
                    value={Math.floor(((playerTotalDamageOut.get(u.id) || 0) * 100) / maxDam)}
                    max={100}
                  />
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
                  {`${Utils.printCombatNumber(
                    (playerTotalHealOut.get(u.id) || 0) / (combat?.durationInSeconds || 1),
                  )}/s`}
                </td>
                <td className="bg-base-200">
                  <progress
                    className="progress w-32 progress-success"
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

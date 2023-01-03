import { useCombatReportContext } from '../CombatReportContext';
import { CombatUnitName } from '../CombatUnitName';

export const CombatScoreboard = () => {
  const { combat } = useCombatReportContext();
  if (!combat) {
    return null;
  }
  if (combat.dataType !== 'ShuffleRound') {
    return null;
  }
  const sortedBoard = combat.scoreboard.slice().sort((a, b) => b.wins - a.wins);
  return (
    <div className="animate-fadein flex">
      <table className="flex-1 table table-compact">
        <tbody>
          <tr>
            <th colSpan={3} className="bg-base-300">
              Shuffle Scoreboard
            </th>
          </tr>
          {sortedBoard.map((u) => {
            const unit = combat.units[u.unitId];
            const color = u.wins >= 3 ? 'progress-success' : 'progress-warning';
            return (
              <tr key={`${unit.id}`}>
                <td className="bg-base-200">
                  <CombatUnitName unit={unit} navigateToPlayerView />
                </td>
                <td className="bg-base-200 w-full">
                  <progress className={`progress ${color} w-full`} value={u.wins} max={6} />
                </td>
                <td className="bg-base-200">{u.wins}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

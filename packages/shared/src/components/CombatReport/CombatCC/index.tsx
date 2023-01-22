import { useCombatReportContext } from '../CombatReportContext';
import { CombatUnitName } from '../CombatUnitName';

export const CombatCC = () => {
  const { combat, players, playerInterruptsDone, playerInterruptsTaken, playerTimeInCC, playerCCOutput } =
    useCombatReportContext();
  if (!combat) {
    return null;
  }
  return (
    <div className="animate-fadein flex flex-col">
      <table className="table table-compact">
        <thead>
          <tr>
            <th className="bg-base-300">Player</th>
            <th className="bg-base-300" colSpan={2}>
              Kicks Taken
            </th>
            <th className="bg-base-300" colSpan={2}>
              Kicks Done
            </th>
            <th className="bg-base-300" colSpan={2}>
              CC Taken
            </th>
            <th className="bg-base-300">CC Done</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={player.id}>
              <td className="bg-base-200">
                <CombatUnitName unit={player} />
              </td>
              <td className="bg-base-200">{(playerInterruptsTaken.get(player.id) ?? 0).toFixed()}</td>
              <td className="bg-base-200">
                {(((playerInterruptsTaken.get(player.id) ?? 0) * 60) / combat.durationInSeconds).toFixed(1)}/min
              </td>
              <td className="bg-base-200">{(playerInterruptsDone.get(player.id) ?? 0).toFixed()}</td>
              <td className="bg-base-200">
                {(((playerInterruptsDone.get(player.id) ?? 0) * 60) / combat.durationInSeconds).toFixed(1)}/min
              </td>
              <td className="bg-base-200">{((playerTimeInCC.get(player.id) ?? 0) / 1000).toFixed(1) ?? 0}s</td>
              <td className="bg-base-200">
                {((playerTimeInCC.get(player.id) ?? 0) / 10 / combat.durationInSeconds).toFixed(1) ?? 0}%
              </td>
              <td className="bg-base-200">{((playerCCOutput.get(player.id) ?? 0) / 1000).toFixed(1) ?? 0}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

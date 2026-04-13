import { useMemo } from 'react';

import { useCombatReportContext } from '../CombatReportContext';
import { CombatUnitName } from '../CombatUnitName';
import { SpellIcon } from '../SpellIcon';
import { analyzeMistakes, DetectedMistake } from './analyzeMistakes';
import { MistakeSeverity } from './mistakeKnowledgeBase';

function severityBadge(severity: MistakeSeverity) {
  switch (severity) {
    case 'HIGH':
      return <span className="badge badge-error badge-sm">High</span>;
    case 'MEDIUM':
      return <span className="badge badge-warning badge-sm">Med</span>;
    case 'LOW':
      return <span className="badge badge-info badge-sm">Low</span>;
  }
}

function formatTimestamp(timestampMs: number, combatStartMs: number): string {
  const elapsedSec = Math.max(0, (timestampMs - combatStartMs) / 1000);
  const min = Math.floor(elapsedSec / 60);
  const sec = Math.floor(elapsedSec % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export const CombatMistakes = () => {
  const { combat, players } = useCombatReportContext();

  const mistakes = useMemo(() => {
    if (!combat) return [];
    return analyzeMistakes(combat);
  }, [combat]);

  if (!combat) {
    return null;
  }

  // Group mistakes by player
  const mistakesByPlayer = new Map<string, DetectedMistake[]>();
  for (const mistake of mistakes) {
    const existing = mistakesByPlayer.get(mistake.playerId) ?? [];
    existing.push(mistake);
    mistakesByPlayer.set(mistake.playerId, existing);
  }

  const totalMistakes = mistakes.length;

  return (
    <div className="animate-fadein flex flex-col gap-4">
      {totalMistakes === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-base-content/60">
          <p className="text-lg font-semibold">No mistakes detected</p>
          <p className="text-sm mt-1">
            Either this was a clean match, or the detected patterns did not trigger. Mistake detection covers: damage
            into immunities, unused defensives before death, trinket waste, and CC DR overlap.
          </p>
        </div>
      ) : (
        <>
          <div className="text-sm text-base-content/70">
            {totalMistakes} mistake{totalMistakes !== 1 ? 's' : ''} detected across {mistakesByPlayer.size} player
            {mistakesByPlayer.size !== 1 ? 's' : ''}
          </div>
          {players.map((player) => {
            const playerMistakes = mistakesByPlayer.get(player.id);
            if (!playerMistakes || playerMistakes.length === 0) return null;

            return (
              <div key={player.id} className="bg-base-200 rounded-lg p-3">
                <div className="flex flex-row items-center mb-2">
                  <CombatUnitName unit={player} />
                  <span className="ml-2 text-sm text-base-content/60">
                    ({playerMistakes.length} mistake{playerMistakes.length !== 1 ? 's' : ''})
                  </span>
                </div>
                <table className="table table-compact w-full">
                  <thead>
                    <tr>
                      <th className="bg-base-300 w-16">Time</th>
                      <th className="bg-base-300 w-16">Severity</th>
                      <th className="bg-base-300 w-10"></th>
                      <th className="bg-base-300">Mistake</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerMistakes.map((mistake, idx) => (
                      <tr key={`${mistake.id}-${idx}`}>
                        <td className="bg-base-100 font-mono text-sm">
                          {formatTimestamp(mistake.timestamp, combat.startTime)}
                        </td>
                        <td className="bg-base-100">{severityBadge(mistake.severity)}</td>
                        <td className="bg-base-100">
                          {mistake.spellId && <SpellIcon spellId={mistake.spellId} size={24} />}
                        </td>
                        <td className="bg-base-100">
                          <div className="font-semibold text-sm">{mistake.title}</div>
                          <div className="text-xs text-base-content/60 mt-0.5">{mistake.tip}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};

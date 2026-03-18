import { CombatResult, CombatUnitType } from '@wowarenalogs/parser';

import { CombatUnitStub } from '../../graphql/__generated__/graphql';
import { PlayerIcon } from '../common/PlayerIcon';

export function durationString(durationInSeconds: number) {
  if (durationInSeconds < 60) {
    return `${Math.round(durationInSeconds)}s`;
  }
  const min = Math.floor(durationInSeconds / 60);
  const sec = Math.round(durationInSeconds - min * 60);
  return `${min}m ${sec}s`;
}

export function ResultBadge({ result }: { result: CombatResult }) {
  return (
    <div
      className={`badge ${result === CombatResult.Win ? 'badge-success' : CombatResult.Lose ? 'badge-error' : ''} w-4`}
    >
      {result === CombatResult.Win ? 'W' : result === CombatResult.Lose ? 'L' : '?'}
    </div>
  );
}

export function RatingBadge({ text }: { text: string | number }) {
  return <div className="badge badge-lg badge-outline">{text}</div>;
}

export function TeamSpecs({
  units,
  playerTeamId,
  winningTeamId,
}: {
  units: CombatUnitStub[];
  playerTeamId: string;
  winningTeamId?: string | null;
}) {
  const teamLeft = units.filter((u) => u.type === CombatUnitType.Player).filter((u) => u.info?.teamId === playerTeamId);
  const teamRight = units
    .filter((u) => u.type === CombatUnitType.Player)
    .filter((u) => u.info?.teamId !== playerTeamId);
  const leftExtraClasses = winningTeamId && winningTeamId === playerTeamId ? 'border-2' : '';
  const rightExtraClasses = winningTeamId && winningTeamId !== playerTeamId ? 'border-2' : '';
  return (
    <div className="flex flex-wrap items-center gap-1 sm:flex-nowrap">
      <div className={`flex flex-wrap items-center gap-2 rounded-lg px-1 py-1 ${leftExtraClasses}`}>
        {teamLeft.map((p) => (
          <PlayerIcon key={p.id} player={p} />
        ))}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-50">VS</div>
      <div className={`flex flex-wrap items-center gap-2 rounded-lg px-1 py-1 ${rightExtraClasses}`}>
        {teamRight.map((p) => (
          <PlayerIcon key={p.id} player={p} />
        ))}
      </div>
    </div>
  );
}

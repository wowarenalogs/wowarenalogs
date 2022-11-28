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

export function ResultBadge({
  result,
  text,
  nocolor,
}: {
  result?: number | null;
  text: string | number;
  nocolor: boolean;
}) {
  if (nocolor) {
    return <div className="badge badge-lg badge-neutral badge-outline">{text}</div>;
  }
  const resultEnum = result as CombatResult;
  switch (resultEnum) {
    case CombatResult.Win:
      return <div className="badge badge-lg badge-success badge-outline">{text}</div>;
    case CombatResult.Lose:
      return <div className="badge badge-lg badge-outline border-gray-500 text-gray-500">{text}</div>;
    default:
      return <div className="badge badge-lg badge-warning badge-outline">??? {text}</div>;
  }
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
  const leftExtraClasses = winningTeamId === playerTeamId ? 'border-2 border-green-700' : '';
  const rightExtraClasses = winningTeamId !== playerTeamId ? 'border-2 border-green-700' : '';
  return (
    <>
      <div className={`flex flex-row items-center pl-1 pr-1 space-x-2 rounded-lg ${leftExtraClasses}`}>
        {teamLeft.map((p) => (
          <PlayerIcon key={p.id} player={p} />
        ))}
      </div>
      <div className="w-1" />
      <div className={`flex flex-row items-center pl-1 pr-1 space-x-2 rounded-lg ${rightExtraClasses}`}>
        {teamRight.map((p) => (
          <PlayerIcon key={p.id} player={p} />
        ))}
      </div>
    </>
  );
}

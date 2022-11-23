import { CombatResult, CombatUnitType } from '@wowarenalogs/parser';
import { PlayerIcon, TimestampDisplay, zoneMetadata } from '@wowarenalogs/shared';
import {
  ArenaMatchDataStub,
  CombatUnitStub,
  ShuffleRoundStub,
  useGetMyMatchesQuery,
} from '@wowarenalogs/shared/src/graphql/__generated__/graphql';
import { TbLoader, TbRefresh } from 'react-icons/tb';

function durationString(durationInSeconds: number) {
  if (durationInSeconds < 60) {
    return `${Math.round(durationInSeconds)}s`;
  }
  const min = Math.floor(durationInSeconds / 60);
  const sec = Math.round(durationInSeconds - min * 60);
  return `${min}m ${sec}s`;
}

function ResultBadge({ result, text }: { result?: number | null; text: string | number }) {
  const resultEnum = result as CombatResult;
  switch (resultEnum) {
    case CombatResult.Win:
      return <div className="badge badge-success">{text}</div>;
    case CombatResult.Lose:
      return <div className="badge badge-error">{text}</div>;
    default:
      return <div className="badge badge-warning">??? {text}</div>;
  }
}

function TeamSpecs({
  units,
  playerTeamId,
  winningTeamId,
}: {
  units: CombatUnitStub[];
  playerTeamId: string;
  winningTeamId: string;
}) {
  const teamLeft = units.filter((u) => u.type === CombatUnitType.Player).filter((u) => u.info?.teamId === playerTeamId);
  const teamRight = units
    .filter((u) => u.type === CombatUnitType.Player)
    .filter((u) => u.info?.teamId === playerTeamId);
  const leftExtraClasses = winningTeamId === playerTeamId ? 'border-2 border-green-700' : '';
  const rightExtraClasses = winningTeamId !== playerTeamId ? 'border-2 border-green-700' : '';
  return (
    <>
      <div className={`flex flex-row items-center rounded ${leftExtraClasses}`}>
        {teamLeft.map((p) => (
          <PlayerIcon key={p.id} player={p} />
        ))}
      </div>
      <div className={`w-2 `} />
      <div className={`flex flex-row items-center rounded ${rightExtraClasses}`}>
        {teamRight.map((p) => (
          <PlayerIcon key={p.id} player={p} />
        ))}
      </div>
    </>
  );
}

function ArenaMatchRow({ match }: { match: ArenaMatchDataStub }) {
  return (
    <div key={match.id} title={match.id} className="flex flex-row gap-1 w-full items-center">
      <TimestampDisplay timestamp={match.startTime} />
      <div className="badge">{durationString(match.durationInSeconds)}</div>
      <div className="badge">{zoneMetadata[match.startInfo?.zoneId || '0']?.name}</div>
      <div className="flex flex-1" />
      <ResultBadge result={match.result} text={match.playerTeamRating || '???'} />
      <div className="flex flex-row align-middle items-center ml-2">
        <TeamSpecs
          units={match.units}
          playerTeamId={match.playerTeamId}
          winningTeamId={match.endInfo?.winningTeamId || '0'}
        />
      </div>
    </div>
  );
}

function ShuffleRoundRow({ round }: { round: ShuffleRoundStub }) {
  return (
    <div title={round.id} className="flex flex-row gap-1 w-full items-center">
      <TimestampDisplay timestamp={round.startTime} />
      <div className="badge">{durationString(round.durationInSeconds)}</div>
      <div className="badge">{zoneMetadata[round.startInfo?.zoneId || '0']?.name}</div>
      <div className="flex flex-1" />
      <ResultBadge result={round.shuffleMatchResult} text={round.playerTeamRating} />
      <div className={`badge ${round.result === CombatResult.Win ? 'badge-success' : 'badge-error'}`}>
        Round {round.sequenceNumber}
      </div>
      <div className="flex flex-row align-middle ml-2">
        <TeamSpecs units={round.units} playerTeamId={round.playerTeamId} winningTeamId={round.winningTeamId} />
      </div>
    </div>
  );
}

const Page = () => {
  const matchesQuery = useGetMyMatchesQuery();

  if (matchesQuery.loading) {
    return (
      <div className="flex flex-row justify-center items-center h-full transition-all">
        <TbLoader size={60} className="h-100 animate-spin-slow" />
      </div>
    );
  }
  if (matchesQuery.error) {
    return (
      <div className="flex flex-row justify-center items-center h-full transition-all">
        <div>An error has occurred</div>
      </div>
    );
  }
  return (
    <div className="transition-all w-full h-full">
      <div className="hero">
        <div className="hero-content flex flex-col items-center">
          <h1 className="text-5xl font-bold">Match History</h1>
          <TbRefresh onClick={() => matchesQuery.refetch()}></TbRefresh>
        </div>
      </div>
      <ul className="pl-2 pr-2 space-y-3">
        {matchesQuery.data?.myMatches.combats.map((c) => {
          if (c.__typename === 'ArenaMatchDataStub') {
            return <ArenaMatchRow match={c} key={c.id} />;
          }
          if (c.__typename === 'ShuffleRoundStub') {
            return <ShuffleRoundRow round={c} key={c.id} />;
          }
          return <div key={c.id}>Error loading {c.id}</div>;
        })}
      </ul>
    </div>
  );
};

export default Page;

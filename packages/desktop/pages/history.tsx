import { CombatResult, CombatUnitType } from '@wowarenalogs/parser';
import { PlayerIcon, TimestampDisplay, zoneMetadata } from '@wowarenalogs/shared';
import {
  ArenaMatchDataStub,
  CombatUnitStub,
  ShuffleRoundStub,
  useGetMyMatchesQuery,
} from '@wowarenalogs/shared/src/graphql/__generated__/graphql';
import _ from 'lodash';
import { useState } from 'react';
import { TbLoader } from 'react-icons/tb';

let colorIndex = 0;
function getNextColor() {
  return ['bg-red-800', 'bg-green-800', 'bg-purple-800', 'bg-cyan-800'][colorIndex++ % 4];
}
const colorGenerator = _.memoize((_s: string) => getNextColor());

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
      return <div className="badge badge-lg badge-success">{text}</div>;
    case CombatResult.Lose:
      return <div className="badge badge-lg badge-error">{text}</div>;
    default:
      return <div className="badge badge-lg badge-warning">??? {text}</div>;
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
      <a href={`/match?id=${round.id}&logId=${round.shuffleMatchId}`}>
        <TimestampDisplay timestamp={round.startTime} />
      </a>
      <div className="badge">{durationString(round.durationInSeconds)}</div>
      <div className={`badge ${colorGenerator(round.shuffleMatchId || 'none')}`}>
        {zoneMetadata[round.startInfo?.zoneId || '0']?.name}
      </div>
      <div className="flex flex-1" />
      <ResultBadge result={round.shuffleMatchResult} text={round.playerTeamRating} />
      <div className={`badge badge-lg ${round.result === CombatResult.Win ? 'badge-success' : 'badge-error'}`}>
        {round.sequenceNumber}
      </div>
      <div className="flex flex-row align-middle ml-2">
        <TeamSpecs units={round.units} playerTeamId={round.playerTeamId} winningTeamId={round.winningTeamId} />
      </div>
    </div>
  );
}

const Page = () => {
  const matchesQuery = useGetMyMatchesQuery();
  const [fakeLoad, setFakeLoad] = useState(false);

  return (
    <div className="transition-all mx-4 overflow-y-auto">
      <div className="hero">
        <div className="hero-content flex flex-col items-center">
          <h1 onClick={() => setFakeLoad(!fakeLoad)} className="text-5xl font-bold">
            Match History
          </h1>
        </div>
      </div>
      {matchesQuery.loading && (
        <div className="flex flex-row items-center justify-center animate-loader h-[300px]">
          <TbLoader onClick={() => setFakeLoad(!fakeLoad)} color="gray" size={60} className="animate-spin-slow" />
        </div>
      )}
      {matchesQuery.error && (
        <div className="flex flex-row justify-center items-center h-full transition-all animate-fadein">
          <div>An error has occurred</div>
        </div>
      )}
      {!matchesQuery.loading && (
        <div className="animate-fadein mt-4">
          <ul className="space-y-3">
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
      )}
    </div>
  );
};

export default Page;

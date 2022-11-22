import { CombatResult, CombatUnitClass, CombatUnitSpec } from '@wowarenalogs/parser';
import {
  ArenaMatchDataStub,
  CombatUnitStub,
  ShuffleRoundStub,
  useGetMyMatchesQuery,
} from '@wowarenalogs/shared/src/graphql/__generated__/graphql';
import { Utils } from '@wowarenalogs/shared/src/utils/utils';
import Image from 'next/image';
import { TbLoader } from 'react-icons/tb';

function PlayerIcon({
  player,
}: {
  player: {
    spec: string;
    class: CombatUnitClass;
  };
}) {
  const spec = player.spec as CombatUnitSpec;
  return (
    <Image
      src={(player.spec === CombatUnitSpec.None ? Utils.getClassIcon(player.class) : Utils.getSpecIcon(spec)) ?? ''}
      alt={(player.spec === CombatUnitSpec.None ? Utils.getClassName(player.class) : Utils.getSpecName(spec)) ?? ''}
      width={48}
      height={48}
    />
  );
}

function TeamSpecs({ units }: { units: CombatUnitStub[] }) {
  const team0 = units.filter((u) => u.info?.teamId === '0');
  const team1 = units.filter((u) => u.info?.teamId === '1');
  return (
    <div>
      {team0.map((p) => (
        <PlayerIcon key={p.id} player={p} />
      ))}{' '}
      {team1.map((p) => (
        <PlayerIcon key={p.id} player={p} />
      ))}
    </div>
  );
}

function ArenaMatchRow({ match }: { match: ArenaMatchDataStub }) {
  return (
    <div key={match.id} title={match.id} className="flex flex-row gap-4">
      <div>{match.startInfo?.bracket}</div>
      <TeamSpecs units={match.units} />
      <div>{match.playerTeamRating}</div>
      <div>{CombatResult[match.result]}</div>
      <div>{Math.round(match.durationInSeconds)}s</div>
    </div>
  );
}

function ShuffleRoundRow({ round }: { round: ShuffleRoundStub }) {
  return (
    <div key={round.id} title={round.id} className="flex flex-row gap-4">
      <div>
        {round.startInfo?.bracket} {round.sequenceNumber}
      </div>
      <div>{round.playerTeamRating}</div>
      <div>{CombatResult[round.result]}</div>
      <div>{Math.round(round.durationInSeconds)}s</div>
      <div>matchId={round.shuffleMatchId?.slice(0, 5)}</div>
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
    <div className="transition-all">
      <ul>
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

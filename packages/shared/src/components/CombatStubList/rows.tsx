import { CombatResult } from '@wowarenalogs/parser';
import _ from 'lodash';
import Link from 'next/link';
import { zoneMetadata } from '../../data/zoneMetadata';
import { ArenaMatchDataStub, ShuffleRoundStub } from '../../graphql/__generated__/graphql';
import { TimestampDisplay } from '../common/TimestampDisplay';
import { durationString, ResultBadge, TeamSpecs } from './bits';

let colorIndex = 0;
function getNextColor() {
  return ['bg-red-800/50', 'bg-green-800/50', 'bg-purple-800/50', 'bg-cyan-800/50'][colorIndex++ % 4];
}
const colorGenerator = _.memoize((_s: string) => getNextColor());

export function ArenaMatchRow({
  match,
  viewerIsOwner,
  combatUrlFactory,
}: {
  match: ArenaMatchDataStub;
  viewerIsOwner: boolean;
  combatUrlFactory: (combatId: string, logId: string) => string;
}) {
  return (
    <Link href={combatUrlFactory(match.id, match.id)}>
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
    </Link>
  );
}

export function ShuffleRoundRow({
  round,
  viewerIsOwner,
  combatUrlFactory,
}: {
  round: ShuffleRoundStub;
  viewerIsOwner: boolean;
  combatUrlFactory: (combatId: string, logId: string) => string;
}) {
  return (
    <Link href={combatUrlFactory(round.id, round.shuffleMatchId || 'error')}>
      <div
        title={round.id}
        className="flex pt-1 pb-1 flex-row gap-1 w-full items-center hover:bg-gray-700 transition-colors duration-200"
      >
        <TimestampDisplay timestamp={round.startTime} />
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
    </Link>
  );
}

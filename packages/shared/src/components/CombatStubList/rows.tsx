import { CombatResult } from '@wowarenalogs/parser';
import _ from 'lodash';
import Link from 'next/link';
import { TbDice1, TbDice2, TbDice3, TbDice4, TbDice5, TbDice6 } from 'react-icons/tb';

import { zoneMetadata } from '../../data/zoneMetadata';
import { ArenaMatchDataStub, ShuffleRoundStub } from '../../graphql/__generated__/graphql';
import { TimestampDisplay } from '../common/TimestampDisplay';
import { durationString, ResultBadge, TeamSpecs } from './bits';

export function ArenaMatchRow({
  match,
  viewerIsOwner,
  combatUrlFactory,
}: {
  match: ArenaMatchDataStub;
  viewerIsOwner?: boolean;
  combatUrlFactory: (combatId: string, combatBracket: string) => string;
}) {
  return (
    <Link href={combatUrlFactory(match.id, match.startInfo?.bracket || '')}>
      <div
        key={match.id}
        title={match.id}
        className="btn btn-ghost flex flex-row py-1 gap-1 w-full items-center transition-colors duration-200 rounded"
      >
        <TimestampDisplay timestamp={match.startTime} timezone={match.timezone} />
        <div className="badge">{match.durationInSeconds ? durationString(match.durationInSeconds) : '??'}</div>
        <div className="badge">{zoneMetadata[match.startInfo?.zoneId || '0']?.name}</div>
        <div className="flex flex-1" />
        <ResultBadge result={match.result} text={match.playerTeamRating || '???'} nocolor={!viewerIsOwner} />
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
  viewerIsOwner?: boolean;
  combatUrlFactory: (combatId: string, logId: string) => string;
}) {
  const roundTitle = `Round ${round.sequenceNumber + 1} ${round.result === CombatResult.Win ? 'win' : 'loss'}`;
  let roundColor = round.result === CombatResult.Win ? 'green' : 'gray';

  if (!viewerIsOwner) {
    roundColor = 'gray';
  }

  let RoundWidget = <TbDice1 color={roundColor} size={32} title={roundTitle} />;
  switch (round.sequenceNumber) {
    case 1:
      RoundWidget = <TbDice2 color={roundColor} size={32} title={roundTitle} />;
      break;
    case 2:
      RoundWidget = <TbDice3 color={roundColor} size={32} title={roundTitle} />;
      break;
    case 3:
      RoundWidget = <TbDice4 color={roundColor} size={32} title={roundTitle} />;
      break;
    case 4:
      RoundWidget = <TbDice5 color={roundColor} size={32} title={roundTitle} />;
      break;
    case 5:
      RoundWidget = <TbDice6 color={roundColor} size={32} title={roundTitle} />;
      break;
  }
  return (
    <Link href={combatUrlFactory(round.id, round.startInfo?.bracket || '')}>
      <div
        title={roundTitle}
        className="btn btn-ghost flex flex-row py-1 gap-1 w-full items-center transition-colors duration-200 rounded"
      >
        <TimestampDisplay timestamp={round.startTime} timezone={round.timezone} />
        <div className="badge">{round.durationInSeconds ? durationString(round.durationInSeconds) : '??'}</div>
        <div className={`badge`}>{zoneMetadata[round.startInfo?.zoneId || '0']?.name}</div>
        <div className="flex flex-1" />
        <ResultBadge nocolor={!viewerIsOwner} result={round.shuffleMatchResult} text={round.playerTeamRating} />
        {RoundWidget}
        <div className="flex flex-row align-middle ml-2">
          <TeamSpecs units={round.units} playerTeamId={round.playerTeamId} winningTeamId={round.winningTeamId} />
        </div>
      </div>
    </Link>
  );
}

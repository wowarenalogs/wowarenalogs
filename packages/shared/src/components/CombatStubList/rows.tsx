import { CombatResult, IArenaMatch, IShuffleRound } from '@wowarenalogs/parser';
import _ from 'lodash';
import Link from 'next/link';
import { TbDice1, TbDice2, TbDice3, TbDice4, TbDice5, TbDice6 } from 'react-icons/tb';

import { zoneMetadata } from '../../data/zoneMetadata';
import { ArenaMatchDataStub, ShuffleRoundStub } from '../../graphql/__generated__/graphql';
import { TimestampDisplay } from '../common/TimestampDisplay';
import { durationString, RatingBadge, ResultBadge, TeamSpecs } from './bits';

export type CombatStubListSource = 'history' | 'search';

export type LocalRemoteHybridArenaMatch =
  | {
      isLocal: true;
      isShuffle: false;
      match: IArenaMatch;
    }
  | {
      isLocal: false;
      isShuffle: false;
      match: ArenaMatchDataStub;
    };
export type LocalRemoteHybridShuffleRound =
  | {
      isLocal: true;
      isShuffle: true;
      match: IShuffleRound;
    }
  | {
      isLocal: false;
      isShuffle: true;
      match: ShuffleRoundStub;
    };

export type LocalRemoteHybridCombat = LocalRemoteHybridArenaMatch | LocalRemoteHybridShuffleRound;

export function ArenaMatchRow({
  combat,
  viewerIsOwner,
  source,
}: {
  combat: LocalRemoteHybridArenaMatch;
  viewerIsOwner?: boolean;
  source: CombatStubListSource;
}) {
  const match = combat.match;
  return (
    <Link href={`/match?id=${match.id}&viewerIsOwner=${viewerIsOwner ? 'true' : 'false'}&source=${source}`}>
      <div
        key={match.id}
        title={match.startInfo?.bracket}
        className="btn btn-ghost flex flex-row py-1 gap-1 w-full items-center transition-colors duration-200 rounded"
      >
        {viewerIsOwner ? (
          <div className="mr-1">
            <ResultBadge result={match.result} />
          </div>
        ) : null}
        <TimestampDisplay timestamp={match.startTime} timezone={match.timezone} />
        <div className="badge">{match.durationInSeconds ? durationString(match.durationInSeconds) : '??'}</div>
        <div className="badge">{zoneMetadata[match.startInfo?.zoneId || '0']?.name}</div>
        <div className="flex flex-1" />
        <RatingBadge text={match.playerTeamRating || '???'} />
        <div className="flex flex-row align-middle items-center ml-2">
          <TeamSpecs
            units={combat.isLocal ? Object.values(combat.match.units) : combat.match.units}
            playerTeamId={match.playerTeamId}
            winningTeamId={match.endInfo?.winningTeamId || '0'}
          />
        </div>
      </div>
    </Link>
  );
}

export function ShuffleRoundRow({
  combat,
  viewerIsOwner,
  source,
}: {
  combat: LocalRemoteHybridShuffleRound;
  viewerIsOwner?: boolean;
  source: CombatStubListSource;
}) {
  const maybeShuffleId = !combat.isLocal ? combat.match?.shuffleMatchId : undefined;
  const round = combat.match;
  const roundTitle = `Round ${round.sequenceNumber + 1} ${round.result === CombatResult.Win ? 'win' : 'loss'}`;

  let RoundWidget = <TbDice1 size={32} title={roundTitle} />;
  switch (round.sequenceNumber) {
    case 1:
      RoundWidget = <TbDice2 size={32} title={roundTitle} />;
      break;
    case 2:
      RoundWidget = <TbDice3 size={32} title={roundTitle} />;
      break;
    case 3:
      RoundWidget = <TbDice4 size={32} title={roundTitle} />;
      break;
    case 4:
      RoundWidget = <TbDice5 size={32} title={roundTitle} />;
      break;
    case 5:
      RoundWidget = <TbDice6 size={32} title={roundTitle} />;
      break;
  }
  return (
    <Link
      href={`/match?id=${maybeShuffleId}&viewerIsOwner=${viewerIsOwner ? 'true' : 'false'}&source=${source}&roundId=${
        round.sequenceNumber + 1
      }`}
    >
      <div
        title={roundTitle}
        className="btn btn-ghost flex flex-row py-1 gap-2 w-full items-center transition-colors duration-200 rounded"
      >
        {viewerIsOwner ? <ResultBadge result={round.result} /> : null}
        <TimestampDisplay timestamp={round.startTime} timezone={round.timezone} />
        <div className="badge">{round.durationInSeconds ? durationString(round.durationInSeconds) : '??'}</div>
        <div className={`badge`}>{zoneMetadata[round.startInfo?.zoneId || '0']?.name}</div>
        <div className="flex flex-1" />
        {round.playerTeamRating ? <RatingBadge text={round.playerTeamRating} /> : null}
        {RoundWidget}
        <div className="flex flex-row align-middle">
          <TeamSpecs
            units={combat.isLocal ? Object.values(combat.match.units) : combat.match.units}
            playerTeamId={round.playerTeamId}
            winningTeamId={round.winningTeamId}
          />
        </div>
      </div>
    </Link>
  );
}

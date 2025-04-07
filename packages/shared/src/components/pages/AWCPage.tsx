/* eslint-disable no-console */
import { CombatUnitSpec, CombatUnitType } from '@wowarenalogs/parser';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { CombatDataStub, useGetPublicMatchesQuery } from '../..';
import EU_TWW_S2C1 from '../../data/awc/EU_TWW_S2C1.json';
import NA_TWW_S2C1 from '../../data/awc/NA_TWW_S2C1.json';
import { AWCMetadata, Game } from '../../data/awc/types';
import { Utils } from '../../utils/utils';

/**
 * Used to quickly pair the match metadata with log files in dev mode
 * Still being done by hand until I have a good way of automating
 *
 * Since it seems like we only get ~30 matches per weekend this shouldn't be too insane
 * short term
 */
const enableEditor = false;

const AWCTeam = ({
  roster,
  teamName,
}: {
  teamName: string;
  roster?: { class: string; spec: string; name: string }[] | null;
}) => {
  return (
    <div className="flex flex-col items-center">
      <div>{teamName}</div>
      <div className="flex flex-row gap-1 items-center">
        {roster?.map((player) => {
          const specEnum = `${player.class.replace(/ /g, '')}_${player.spec.replace(
            / /g,
            '',
          )}` as keyof typeof CombatUnitSpec;
          const specValue = CombatUnitSpec[specEnum] || 'Unknown';
          return (
            <div key={player.name} className="flex flex-row gap-1 items-center">
              <Image
                className="rounded"
                src={Utils.getSpecIcon(specValue) || 'no-image'}
                alt={'no'}
                width={16}
                height={16}
              />
              <div>{player.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const matchMap = {
  '15116': '162a77a14c42b802152570eb9917e102', // OlD REMOVE THIS
};
const matchesWithLogs = Object.keys(matchMap);

const metadataMap: Record<string, Record<string, AWCMetadata | null>> = {
  NA: {
    'Season 2 Cup 1': NA_TWW_S2C1,
  },
  EU: {
    'Season 2 Cup 1': EU_TWW_S2C1,
  },
};

const regions = ['NA', 'EU'];
const cups = ['Season 1 Cup 1', 'Season 1 Cup 2', 'Season 1 Cup 3', 'Season 1 Cup 4'];

function findClosest(timedEvents: CombatDataStub[], game: Game): CombatDataStub[] {
  if (timedEvents.length === 0) return [];

  const gamefingerPrint = [
    game.dungeon?.wowInstanceId,
    game.firstTeamRoster?.map((p) => [p.class, p.spec]),
    game.secondTeamRoster?.map((p) => [p.class, p.spec]),
  ]
    .flat(5)
    .sort()
    .join('')
    .replaceAll(' ', '');
  // console.log({ gamefingerPrint });

  return timedEvents.filter((event) => {
    const fingerItems = [
      event.startInfo?.zoneId,
      Object.values(event.units)
        .filter((u) => u.type === CombatUnitType.Player)
        .map((u) => [
          Utils.getClassName(u.class),
          Utils.getSpecName(u.spec as CombatUnitSpec)
            .replace(Utils.getClassName(u.class), '')
            .replace(' ', ''),
        ]),
    ]
      .flat(6)
      .sort();
    const eventFingerprint = fingerItems.join('');
    // console.log({ eventFingerprint });
    return eventFingerprint === gamefingerPrint;
  });
}

export const AWCPage = () => {
  const [gameToMatchMap, setGameToMatchMap] = useState<Record<string, string>>(matchMap);
  const matchesQuery = useGetPublicMatchesQuery({
    skip: !enableEditor,
    variables: {
      wowVersion: 'retail',
      bracket: 'AWC 3v3',
      minRating: 0,
      offset: 0,
      count: 50,
    },
  });

  const [region, setRegion] = useState('NA');
  const [cup, setCup] = useState('Season 1 Cup 1');

  const data = metadataMap[region][cup];
  const allGames = [
    ...Object.values(data?.segments.upper.rounds || []).flat(),
    ...Object.values(data?.segments.lower.rounds || []).flat(),
  ]
    .flatMap((match) => match.games.map((game) => ({ ...game, match })))
    .filter((game) => game.dungeon !== null)
    .filter((game) => matchesWithLogs.includes(`${game.id}`) || enableEditor)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const router = useRouter();
  return (
    <div className="px-4 py-2 overflow-y-auto">
      <h1 className="text-2xl text-center">AWC: The War Within</h1>
      <h2 className="text-xl text-center">{cup}</h2>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div className="flex flex-row space-x-4 m-0 p-0 items-center">
          {regions.map((o) => {
            return (
              <div className="form-control" key={o}>
                <label className="label cursor-pointer space-x-2">
                  <input
                    type="radio"
                    name="radio-region"
                    className="radio checked:bg-primary"
                    onClick={() => setRegion(o)}
                    defaultChecked={region === o}
                  />
                  <span className="label-text">{o}</span>
                </label>
              </div>
            );
          })}
        </div>
        <div className="flex flex-row space-x-4 m-0 p-0 items-center">
          {cups.map((o) => {
            return (
              <div className="form-control" key={o}>
                <label className="label cursor-pointer space-x-2 disabled">
                  <input
                    type="radio"
                    name="radio-seasoncup"
                    className="radio checked:bg-primary"
                    onClick={() => setCup(o)}
                    defaultChecked={o === cup}
                  />
                  <span className="label-text">{o}</span>
                </label>
              </div>
            );
          })}
        </div>
      </div>
      {enableEditor && <div onClick={() => console.log({ gameToMatchMap })}>Show Map</div>}
      <ul className="space-y-1 flex flex-col gap-2 w-full justify-items-stretch">
        {allGames.length === 0 && <div>No data is available for this event yet!</div>}
        {allGames.map((game) => {
          const match = game.match;
          const team1 = match.firstTeam;
          const team2 = match.secondTeam;
          const winnerTeam = game.winnerTeamId === team1.id ? team1 : team2;
          const loserTeam = game.winnerTeamId === team1.id ? team2 : team1;
          const winnerRoster = game.winnerTeamId === team1.id ? game.firstTeamRoster : game.secondTeamRoster;
          const loserRoster = game.winnerTeamId === team1.id ? game.secondTeamRoster : game.firstTeamRoster;
          const gameDate = new Date(game.updatedAt).toLocaleString();

          const closestMatches = findClosest(matchesQuery.data?.latestMatches.combats || [], game);
          const names = closestMatches.map((a) =>
            Object.values(a.units)
              .filter((p) => p.type === CombatUnitType.Player)
              .map((p) => p.name),
          );

          if (closestMatches.length > 1) {
            console.log({ game, closestMatches, names });
          }
          return (
            <div
              key={`${match.id}-${game.id}`}
              onClick={() => {
                if (!enableEditor) router.push(`/match?id=${gameToMatchMap[game.id]}&viewerIsOwner=false`);
              }}
              className="rounded-md transition-all hover:text-primary hover:bg-base-300 cursor-pointer flex flex-row gap-2 items-center px-2"
            >
              <div className="text-center">{gameDate}</div>
              <div className="text-center flex-1">
                <AWCTeam teamName={winnerTeam.name} roster={winnerRoster} />
              </div>
              <div className="flex-2">
                <AWCTeam teamName={loserTeam.name} roster={loserRoster} />
              </div>
              <div className="text-center flex-1">
                #{match.games.findIndex((g) => g.id === game.id) + 1}: {game.dungeon?.name}
                {enableEditor && (
                  <>
                    <input
                      type="text"
                      value={gameToMatchMap[game.id]}
                      onChange={(e) => {
                        setGameToMatchMap({ ...gameToMatchMap, [game.id]: e.target.value });
                      }}
                    />
                    <div>gameid {game.id}</div>
                    <div>{!gameToMatchMap[game.id] ? 'NO MAPPED GAME' : ''}</div>
                    <div>
                      {!closestMatches[0] ? 'NO MATCH' : closestMatches[0]?.id}
                      {closestMatches.length > 1 && ' WARNING: MULTIPLE MATCHES'}
                    </div>
                    <div>{(closestMatches[0]?.id === gameToMatchMap[game.id]).toString()}</div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </ul>
    </div>
  );
};

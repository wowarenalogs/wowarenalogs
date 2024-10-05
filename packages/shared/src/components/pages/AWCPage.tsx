/* eslint-disable no-console */
import { CombatUnitSpec } from '@wowarenalogs/parser';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useState } from 'react';

import EU_TWW_S1C1 from '../../data/awc/EU_TWW_S1C1.json';
import NA_TWW_S1C1 from '../../data/awc/NA_TWW_S1C1.json';
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
  roster: { class: string; spec: string; name: string }[];
}) => {
  return (
    <div className="flex flex-col items-center">
      <div>{teamName}</div>
      <div className="flex flex-row gap-1 items-center">
        {roster.map((player) => {
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
  '15116': '162a77a14c42b802152570eb9917e102',
  '15117': '0b39a6dffd320b833b5e340815e80aaf',
  '15118': 'e755fd36553e5af5a422adc0fbc3d224',
  '15121': '2fdd435625d055a062bd11cc6cf414d2',
  '15122': 'f6c9032332cc6966f7a851d770aa6382',
  '15123': '6373cb5dd76ae9bcf32c5d04ee8ec344',
  '15136': '253373bba6458e36f3bcbe6c0d611586',
  '15137': '14788a1d45973af1308b657cc37ff4e1',
  '15138': '1ebd4124c8e1cb8368409be69769a54a',
  '15166': '0efe46f6e8ab9086ef315be8add35039',
  '15167': '09b3b337286f59ce7e23f4d2c973a8b6',
  '15168': 'ba2bd55ca0db88673c8122d0bf10e2d0',
  '15171': '7fa93cd92dfe9b33868116b44e32b768',
  '15172': 'c0b43906cac7f1c471ebe1a0dd4cedc9',
  '15173': 'b6f070eab89e8763a7ab85cc352f23bd',
  '15174': 'ee165487073d81d3f4d3b37d11705a18',
  '15186': '900f856438709708c9db6f6a7b7280ba',
  '15187': 'ea147895b2ef9aba0558d572502e335f',
  '15188': '3cc0e05f84e001353fd78eb153198dd5',
  '15196': '5f58938e87d2d338210e463581748bbb',
  '15197': '536560c7dbf67534105e2421a899b01d',
  '15198': '02eb75da930da2296a6e3f124149489f',
  '15199': 'ea253b4d66581a02b5fd03ba4398e622',
  '15200': 'aefd3f3bf603aed1cf62dc991640ebfb',
  '15201': '972de4929eabf382b5d96a8df0b707ea',
  '15203': 'afaad5eb1cb27cdf179e2410251bae64',
  '15204': '3949ec91ecb815c0af0299950cdc898e',
  '15205': '6e397a0db18040e2ba32efd9d2d65e0d',
  '15206': '201400d769e7300ee1d8685ff8ae689d',
  '15207': '658be86d61d284cf8b843665d994fcbf',
  '15208': '2e14304594f54ebc6705a9ee93f261ec',
  '15209': '6fd94a3dc270f6d4f553523a56fe0761',
};
const matchesWithLogs = Object.keys(matchMap);

export const AWCPage = () => {
  const [gameToMatchMap, setGameToMatchMap] = useState<Record<string, string>>(matchMap);

  const [region, setRegion] = useState('EU');

  const data = region === 'NA' ? NA_TWW_S1C1 : EU_TWW_S1C1;

  const allGames = [
    ...Object.values(data.segments.upper.rounds).flat(),
    ...Object.values(data.segments.lower.rounds).flat(),
  ]
    .flatMap((match) => match.games.map((game) => ({ ...game, match })))
    .filter((game) => game.dungeon !== null)
    .filter((game) => matchesWithLogs.includes(`${game.id}`) || enableEditor)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const router = useRouter();
  return (
    <div className="px-4 py-2 overflow-y-auto">
      <h1 className="text-2xl text-center">AWC: The War Within Season 1 Cup 1</h1>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div className="flex flex-row space-x-4 m-0 p-0 items-center">
          {['NA', 'EU'].map((o) => {
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
          {['Season 1 Cup 1', 'Season 1 Cup 2'].map((o) => {
            return (
              <div className="form-control" key={o}>
                <label className="label cursor-pointer space-x-2 disabled">
                  <input
                    disabled
                    type="radio"
                    name="radio-seasoncup"
                    className="radio checked:bg-primary"
                    onClick={() => setRegion(o)}
                    defaultChecked={o === 'Season 1 Cup 1'}
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
        {allGames.map((game) => {
          const match = game.match;
          const team1 = match.firstTeam;
          const team2 = match.secondTeam;
          const winnerTeam = game.winnerTeamId === team1.id ? team1 : team2;
          const loserTeam = game.winnerTeamId === team1.id ? team2 : team1;
          const winnerRoster = game.winnerTeamId === team1.id ? game.firstTeamRoster : game.secondTeamRoster;
          const loserRoster = game.winnerTeamId === team1.id ? game.secondTeamRoster : game.firstTeamRoster;
          const gameDate = new Date(game.updatedAt).toLocaleString();

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
                #{match.games.findIndex((g) => g.id === game.id) + 1}: {game.dungeon.name}
                {enableEditor && (
                  <input
                    type="text"
                    value={gameToMatchMap[game.id]}
                    onChange={(e) => {
                      setGameToMatchMap({ ...gameToMatchMap, [game.id]: e.target.value });
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </ul>
    </div>
  );
};

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
          const specValue = (specEnum as string) === '' ? null : CombatUnitSpec[specEnum];
          return (
            <div key={player.name} className="flex flex-row gap-1 items-center">
              <>
                {specValue && (
                  <Image
                    className="rounded"
                    src={Utils.getSpecIcon(specValue) || 'no-image'}
                    alt={'no'}
                    width={16}
                    height={16}
                  />
                )}
                <div>{player.name}</div>
              </>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const matchMap = {
  '22848': '470490745232f06ca183b1fb65e9f7e2',
  '22849': '0ef24fbba036bcbedfcc38f6f73b3b4f',
  '22850': '1c6bb07aac2f989c45cbec4b435e2f5f',
  '22851': '39b052c5a79b2184159d05a22caf3247',
  '22852': '604568af563e119c00f0c5f8acd40dcc',
  '22853': 'a865865fc5513995e49076699617a4f',
  '22854': '4eca5cece34bdac9ec39f87a5f1c34dd',
  '22855': '7be2c39a5bac64296b106a644f27f9a7',
  '22858': 'bf0c361ab5029e48151a69a040b70e31',
  '22859': '69e35c3ce85a9bdcfd2361e0c65ec2c4',
  '22860': 'a6aded48bcb402ef8a4e15c660652f74',
  '22863': '2f19d0aabde6c0914c0d532a95710708',
  '22864': '3a55f3ea405aedc78c1ad7f4f10596c6',
  '22865': '30317e0b43ad685855e64943d2334cb9',
  '22868': '5438cd82c246d3058ca6111832ec98c2',
  '22869': '5de7faeb484b326fbaa86f986629a621',
  '22870': 'f1645750641587a99798f29fa57ea7e0',
  '22871': 'b302e2c04e1ff90eba85aa48d01863b0',
  '22873': 'fc666feb2a862d4ce38d7127f7643b0c',
  '22874': '4d5ae1b52b900478ed16f372c13f89a6',
  '22875': 'bea98fe63e647f799caa9b820fa6d7ec',
  '22876': '9f251cd4435cbcc4bfda1be473fe984b',
  '22878': '87a32ce6e3fbdf01b1799ca17e00427a',
  '22879': 'bb64b010d0d50f0b522b8a496fa0cdb1',
  '22880': '32fc5f0f1c3de520e28e251ed4f02041',
  '22881': '8ddb42ef049da7218bb85204549df417',
  '22882': 'f4ac8e219310da174cb170278c3b66ca',
  '22883': '87a32ce6e3fbdf01b1799ca17e00427a',
  '22884': '156444aacdbfd65cc1af136f18d89395',
  '22885': '6ce7887aa2627c6205eaa271f3230ca3',
  '22886': 'ff04d3dbb764c5036a6ffa4c0c48a2e2',
  '22887': '4d5ae1b52b900478ed16f372c13f89a6',
  '22888': '5d52a841e69fce087326c7a9bfd20ff1',
  '22889': '94e7732890d4b5cd576944b898bd072c',
  '22890': 'a531413eba68fe015cee085ba57a237b',
  '25378': 'c0225ba02666d647cf291dc25b505d2d',
  '25379': '2284e6dc288b787b1fc9e5d810b2d696',
  '25380': '2c9574920ac5c7f286a04ed963e1118d',
  '25383': '0844aaaaf928279c0ec8669a59394173',
  '25384': 'f3beadfb036251235accd0643eb7cde3',
  '25386': '9d805deb1b62e93ddb0444e0d66bf8b8',
  '25388': '4207fc9f1abaff9789b1c7ae78095bf5',
  '25389': 'f2cac4268b33a83a3a27269c7fe979ee',
  '25391': 'c2f928a4523b97aa6c7fa188122a1106',
  '25392': '74f886025e9698985d488071576f75da',
  '25393': '41932400822db5ad58efacd30069cca3',
  '25394': 'bc7ff2f65774a2c3e69ab3bcf0841d0b',
  '25395': '6d98c4318bc8c620ac5e51ca941ac825',
  '25398': 'e3626d236f016ed77574578bf2d96498',
  '25399': 'dda4e2227d06e6bc366120f1a8f9697b',
  '25400': '96a213a8a2cdf2e826265ae68518dc8f',
  '25403': 'b1e9b884de5b18d59d2d3f443468072d',
  '25404': '1a4229948afd209a18cf7ee52bad2949',
  '25405': '056063ae24e6dc75e7b81aded38fac87',
  '25406': '6b95c92db65c5b55c02857372602553a',
  '25407': '3037b0e8ff647032b5679be89bc970c1',
  '25409': 'd84953ecbb66eca86e888077163a6347',
  '25410': '173bc85b88db71523b1b919ebeb6c6a4',
  '25414': 'd8d65e65670bfb678cef134d02279daf',
  '25415': '6c43891b00b08158c6f2e415067845a1',
  '25416': '1716eb6bbeb00ad1a5cf284b51c349cf',
  '25418': '836b36d8ccaeed94dde387c5324a53bb',
  '25419': 'd064f14ac93e38940a6701bccac63283',
  '25420': '5057ea6d958d5161913dc342a977c53c',
  '25421': '75886025153c2abef08a66ffeab230d6',
  '25422': '2719edeb755404a06620ecb0447bc650',
  '25428': '9dd86b3ea2cabc013978a5ff1c6110ec',
  '25429': '1758beecf067da466d501d96bb819e25',
  '25430': 'a263480517a2655677a60f78f69d36ce',
  '25431': 'b734ba0756e050f29f2957f425916aa9',
  '25432': 'd58ce252245c7f1356058858dafcc005',
  '25433': '0e2d9a492848202fd2f7eb7e5341fb9f',
  '25435': 'd84adac34e4fbc2d2b572b4524eef052',
  '25436': 'a86a71bf4e828fc02d2e7adec0f845e8',
  '25437': 'afc501b0e6b55d4559cec594910790af',
  '25438': '9fac0a1e50199e2d40ee9076ddbf2551',
  '25439': '017ddc51a525994cd41abbf7009eb2a3',
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
const cups = ['Season 2 Cup 1'];

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

  const matches = timedEvents.filter((event) => {
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
  return matches;
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
  const [cup, setCup] = useState('Season 2 Cup 1');

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
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              .sort((a, b) => a.info!.teamId.localeCompare(b.info!.teamId))
              .map((p) => p.name),
          );

          if (closestMatches.length > 1) {
            console.log('N>1:', gameDate);
            console.log({
              game,
              gameRoster1: game.firstTeamRoster?.map((p) => p.name),
              gameRoster2: game.secondTeamRoster?.map((p) => p.name),
              closestMatches,
              names,
            });
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
                    <div>mapped? {(closestMatches[0]?.id === gameToMatchMap[game.id]).toString()}</div>
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

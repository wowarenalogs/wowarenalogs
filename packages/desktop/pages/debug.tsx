import { CombatResult } from '@wowarenalogs/parser';
import { useAuth } from '@wowarenalogs/shared';
import { useClientContext } from '@wowarenalogs/shared';
import { useGetMyMatchesQuery, useGetProfileQuery } from '@wowarenalogs/shared/src/graphql/__generated__/graphql';

import { LoginButton } from '../components/Login/LoginButton';
import { LogoutButton } from '../components/Login/LogoutButton';
import { useAppConfig } from '../hooks/AppConfigContext';
import { useLocalCombats } from '../hooks/LocalCombatsContext';

const Debug = () => {
  const auth = useAuth();

  const platform = typeof window !== 'undefined' ? window.wowarenalogs.platform : '';

  const client = useClientContext();
  const { updateAppConfig, wowInstallations } = useAppConfig();
  const combats = useLocalCombats();

  const profileQuery = useGetProfileQuery();
  const matchesQuery = useGetMyMatchesQuery();

  return (
    <div className="mt-8 text-base-content">
      <div className="flex flex-row justify-between">
        <div className="flex flex-col">
          <div>Platform: {platform}</div>
          <div>Auth: {auth.isLoadingAuthData ? 'loading' : auth.battleTag || 'not-logged-in'}</div>
          <div>
            {wowInstallations.size} Installations
            {Array.from(wowInstallations).map((v) => (
              <div key={v[0]}>{v.join(': ')}</div>
            ))}
          </div>
          <div>Local combat logs: ({combats.localCombats.length} total)</div>
          {combats.localCombats.map((e) => (
            <div key={e.id}>
              start-{e.startTime} zone-{e.startInfo.zoneId} bracket-{e.startInfo.bracket} result-{e.result}
            </div>
          ))}
        </div>
        <div className="flex flex-col">
          <b>GQL</b>
          <div>
            useGetProfile
            <ul>
              <li>loading:{profileQuery.loading.toString()}</li>
              <li>
                data: <pre>{JSON.stringify(profileQuery.data?.me || {}, null, 2)}</pre>
              </li>
            </ul>
          </div>
          <div>
            matchesQuery
            <ul>
              <li>loading:{matchesQuery.loading.toString()}</li>
              <li>data: {matchesQuery.data?.myMatches.combats.length} entries</li>
              {matchesQuery.data?.myMatches.combats.map((c) => {
                if (c.__typename === 'ArenaMatchDataStub') {
                  return (
                    <div key={c.id} title={c.id} className="flex flex-row gap-4">
                      <div>ArenaMatch</div>
                      <div>{c.playerTeamRating}</div>
                      <div>{CombatResult[c.result]}</div>
                      <div>{c.durationInSeconds ? Math.round(c.durationInSeconds) : '??'}s</div>
                    </div>
                  );
                }
                if (c.__typename === 'ShuffleRoundStub') {
                  return (
                    <div key={c.id} title={c.id} className="flex flex-row gap-4">
                      <div>ShuffleRound {c.sequenceNumber}</div>
                      <div>{c.playerTeamRating}</div>
                      <div>{CombatResult[c.result]}</div>
                      <div>{c.durationInSeconds ? Math.round(c.durationInSeconds) : '??'}s</div>
                      <div>matchId={c.shuffleMatchId?.slice(0, 5)}</div>
                    </div>
                  );
                }
                return <div key={c.id}>error {c.id}</div>;
              })}
            </ul>
          </div>
        </div>
        <div className="flex flex-col">
          <LoginButton />
          <LogoutButton />
          <button
            className="btn"
            onClick={() => {
              window.wowarenalogs.links?.openExternalURL('https://worldofwarcraft.com/en-us/');
            }}
          >
            Test Open External URL
          </button>
          <button
            className="btn"
            onClick={() => {
              window.wowarenalogs.fs
                ?.selectFolder()
                .then((folder) => {
                  updateAppConfig((prev) => {
                    return { ...prev, wowDirectory: folder };
                  });
                })
                .catch(() => {});
            }}
          >
            Select WoW Folder (installs addon, starts loggers)
          </button>
          <button
            className="btn"
            onClick={() => {
              updateAppConfig((prev) => {
                return { ...prev, wowDirectory: undefined };
              });
            }}
          >
            Clear WoW Folder Setting
          </button>
          <button
            className="btn"
            onClick={() => {
              client.saveWindowPosition();
            }}
          >
            Save Window Pos
          </button>
        </div>
      </div>
    </div>
  );
};

export default Debug;

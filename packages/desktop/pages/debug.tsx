import TitleBar from '../components/TitleBar';
import { LoginButton } from '../components/Login/LoginButton';
import { useSession } from 'next-auth/client';
import { LogoutButton } from '../components/Login/LogoutButton';
import { Button } from '@wowarenalogs/shared';
import { useClientContext } from '@wowarenalogs/shared';
import { useLocalCombatsContext } from '../hooks/localCombats';
import { useGetProfileQuery, useGetMyMatchesQuery } from '@wowarenalogs/shared/src/graphql/__generated__/graphql';

export default () => {
  const [session, loading] = useSession();

  const platform = typeof window !== 'undefined' ? window.wowarenalogs.platform : '';

  const client = useClientContext();
  const combats = useLocalCombatsContext();

  const profileQuery = useGetProfileQuery();
  const matchesQuery = useGetMyMatchesQuery();

  return (
    <div className="mt-8 text-white">
      <TitleBar />
      <div className="flex flex-row justify-between">
        <div className="flex flex-col">
          <div>Platform: {platform}</div>
          <div>
            Session: {(session?.user as any)?.battletag || 'not-logged-in'} {loading ? 'loading' : null}
          </div>
          <div>
            {client.wowInstallations.size} Installations
            {Array.from(client.wowInstallations).map((v) => (
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
              <li>data: {matchesQuery.data?.myMatches.combats.length} matches</li>
            </ul>
          </div>
        </div>
        <div className="flex flex-col">
          <LoginButton />
          <LogoutButton />
          <Button
            onClick={() => {
              window.wowarenalogs.links?.openExternalURL('https://worldofwarcraft.com/en-us/');
            }}
          >
            Test Open External URL
          </Button>
          <Button
            onClick={() => {
              window.wowarenalogs.fs?.folderSelected((_event, folder) =>
                client.updateAppConfig((prev) => {
                  return { ...prev, wowDirectory: folder };
                }),
              );
              window.wowarenalogs.fs?.selectFolder({
                'setup-page-locate-wow-mac': '',
                'setup-page-locate-wow-windows': '',
                'setup-page-invalid-location': '',
                'setup-page-invalid-location-message': '',
                confirm: 'confirm-message',
              });
            }}
          >
            Select WoW Folder (installs addon, starts loggers)
          </Button>
          <Button
            onClick={() => {
              client.updateAppConfig((prev) => {
                return { ...prev, wowDirectory: undefined };
              });
            }}
          >
            Clear WoW Folder Setting
          </Button>
          <Button
            onClick={() => {
              client.saveWindowPosition();
            }}
          >
            Save Window Pos
          </Button>
        </div>
      </div>
    </div>
  );
};

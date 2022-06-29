import TitleBar from '../components/TitleBar';
import { LoginButton } from '../components/Login/LoginButton';
import { useSession } from 'next-auth/client';
import { LogoutButton } from '../components/Login/LogoutButton';
import { Button } from '@wowarenalogs/shared';
import { useClientContext } from '@wowarenalogs/shared';
import { useLocalCombatsContext } from '../hooks/localCombats';

export default () => {
  const [session, loading] = useSession();

  const platform = typeof window !== 'undefined' ? window.wowarenalogs.platform : '';

  const client = useClientContext();
  const combats = useLocalCombatsContext();

  return (
    <div className="mt-8 text-white">
      <TitleBar />
      <div className="flex flex-col">
        <div>Platform: {platform}</div>
        <div>
          Session: {(session?.user as any)?.battletag} {loading ? 'loading' : null}
        </div>
        <div>
          {client.wowInstallations.size} Installations
          {Array.from(client.wowInstallations).map((v) => (
            <div>{v.join(': ')}</div>
          ))}
        </div>
        <div>Local combat logs: ({combats.localCombats.length} total)</div>
        {combats.localCombats.map((e) => (
          <div>
            start-{e.startTime} zone-{e.startInfo.zoneId} bracket-{e.startInfo.bracket} result-{e.result}
          </div>
        ))}
        <LoginButton />
        <LogoutButton />
        <Button
          onClick={() => {
            window.wowarenalogs.links?.openExternalURL('https://worldofwarcraft.com/en-us/');
            window.wowarenalogs.win?.onWindowResized((_event, width, height) => console.log('R', width, height));
            window.wowarenalogs.win?.onWindowMoved((_event, x, y) => console.log('M', x, y));
          }}
        >
          Test Armory and Window Callbacks
        </Button>
        <Button
          onClick={() => {
            window.wowarenalogs.fs?.folderSelected((_event, folder) => console.log('selected', folder));
            window.wowarenalogs.fs?.selectFolder({
              'setup-page-locate-wow-mac': '',
              'setup-page-locate-wow-windows': '',
              'setup-page-invalid-location': '',
              'setup-page-invalid-location-message': '',
              confirm: '',
            });
          }}
        >
          Test Select Folder (Installs Addon)
        </Button>
        <Button
          onClick={() => {
            client.updateAppConfig((prev) => {
              return { ...prev, wowDirectory: 'C:\\Program Files (x86)\\World of Warcraft\\_retail_' };
            });
          }}
        >
          Set Install Dir (hardcoded)
        </Button>
        <Button
          onClick={() => {
            client.updateAppConfig((prev) => {
              return { ...prev, wowDirectory: undefined };
            });
          }}
        >
          Clear Install Dir
        </Button>
      </div>
    </div>
  );
};
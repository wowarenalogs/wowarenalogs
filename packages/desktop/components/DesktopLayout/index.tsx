import { useState, useEffect } from 'react';
import { ICombatData } from '@wowarenalogs/parser';
import TitleBar from '../TitleBar';
import { LoginButton } from '../Login/LoginButton';
import { useSession } from 'next-auth/client';
import { LogoutButton } from '../Login/LogoutButton';

export const DesktopLayout = () => {
  const [platform, setPlatform] = useState('');
  const [logWatcherRunning, setLogWatcherRunning] = useState(false);
  const [logs, setLogs] = useState<ICombatData[]>([]);
  const [session, loading] = useSession();

  useEffect(() => {
    if (window.wowarenalogs.app.getPlatform) window.wowarenalogs.app.getPlatform().then((p) => setPlatform(p));
  });

  return (
    <div className="mt-8 text-white">
      <TitleBar />
      <div className="flex flex-col">
        <div>Platform: {platform}</div>
        <div>
          Session: {(session?.user as any)?.battletag} {loading ? 'loading' : null}
        </div>
        <LoginButton />
        <LogoutButton />
        <button
          onClick={() => {
            console.log(window);
            console.log(window.wowarenalogs);
            window.wowarenalogs.win.onWindowResized((a) => console.log('R', a));
            window.wowarenalogs.win.onWindowMoved((a) => console.log('M', a));
          }}
        >
          Test Armory and Window Callbacks
        </button>

        <button
          onClick={() => {
            console.log(window.wowarenalogs);
            window.wowarenalogs.bnet.onLoggedIn((e) => console.log('loggedIn', e));
            window.wowarenalogs.bnet.login('https://google.com', 'Some title');
          }}
        >
          Test Bnet Login
        </button>

        <button
          onClick={() => {
            console.log(window.wowarenalogs);
            window.wowarenalogs.fs.folderSelected((_event, folder) => console.log('selected', folder));
            window.wowarenalogs.fs.selectFolder({
              'setup-page-locate-wow-mac': '',
              'setup-page-locate-wow-windows': '',
              'setup-page-invalid-location': '',
              'setup-page-invalid-location-message': '',
              confirm: '',
            });
          }}
        >
          Test Select Folder (Installs Addon)
        </button>
        <button
          onClick={() => {
            console.log(window.wowarenalogs);
            window.wowarenalogs.logs.startLogWatcher(
              'C:\\Program Files (x86)\\World of Warcraft\\_retail_',
              'shadowlands',
            );
            window.wowarenalogs.logs.handleNewCombat((_event, combat) => {
              console.log('New Combat', combat);
              setLogs([...logs, combat]);
            });
            setLogWatcherRunning(true);
          }}
        >
          Start Log Watcher
        </button>
        <button
          onClick={() => {
            console.log(window.wowarenalogs);

            window.wowarenalogs.logs.stopLogWatcher();
            setLogWatcherRunning(false);
          }}
        >
          Stop Log Watcher
        </button>
      </div>
      <div>Log Watcher Running: {logWatcherRunning.toString()}</div>
      <div>Logs ({logs.length} total)</div>
      {logs.map((e) => (
        <div>
          start-{e.startTime} zone-{e.startInfo.zoneId} bracket-{e.startInfo.bracket} result-{e.result}
        </div>
      ))}
    </div>
  );
};

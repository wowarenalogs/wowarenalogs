import TitleBar from '../TitleBar';

export const DesktopLayout = () => {
  return (
    <div className="mt-8 text-white">
      <TitleBar />
      <div className="flex flex-col">
        <button
          onClick={() => {
            console.log(window);
            console.log(window.wowarenalogs);
            // window.wowarenalogs.armoryLinks.openArmoryLink('us', 'us', 'stormrage', 'armsperson');

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
            });
          }}
        >
          Start Log Watcher
        </button>
        <button
          onClick={() => {
            console.log(window.wowarenalogs);
            window.wowarenalogs.logs.startLogWatcher(
              'C:\\Program Files (x86)\\World of Warcraft\\_retail_',
              'shadowlands',
            );
            window.wowarenalogs.logs.stopLogWatcher();
          }}
        >
          Stop Log Watcher
        </button>
      </div>
    </div>
  );
};

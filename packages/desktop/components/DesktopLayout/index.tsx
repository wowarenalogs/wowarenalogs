import TitleBar from '../TitleBar';

export const DesktopLayout = () => {
  return (
    <div className="mt-8 text-white">
      <TitleBar />
      <button
        onClick={() => {
          console.log(window);
          console.log(window.wowarenalogs);
          // window.wowarenalogs.armoryLinks.openArmoryLink('us', 'us', 'stormrage', 'armsperson');
          window.wowarenalogs.fs.handleFolderSelected((_event, folder) => console.log('selected', folder));
          window.wowarenalogs.fs.selectFolder();
        }}
      >
        TEST ARMORY LINK
      </button>

      <button
        onClick={() => {
          console.log(window.wowarenalogs);
          window.wowarenalogs.bnet.onLoggedIn((e) => console.log('loggedIn', e));
          window.wowarenalogs.bnet.login('https://google.com', 'Some title');
        }}
      >
        TEST BNET LOGIN
      </button>
    </div>
  );
};

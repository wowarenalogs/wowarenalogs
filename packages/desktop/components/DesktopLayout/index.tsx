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
          window.wowarenalogs.folderSelect.handleFolderSelected((e, b) => console.log('selected', e, b, c));
          window.wowarenalogs.folderSelect.selectFolder();
        }}
      >
        TEST ARMORY LINK
      </button>
    </div>
  );
};

import TitleBar from '../TitleBar';

export const DesktopLayout = () => {
  return (
    <div className="mt-8 text-white">
      <TitleBar />
      <button
        onClick={() => {
          if (window.wowarenalogs.openArmoryLink) {
            window.wowarenalogs.openArmoryLink('us', 'us', 'stormrage', 'armsperson');
          }
        }}
      >
        TEST ARMORY LINK
      </button>
    </div>
  );
};

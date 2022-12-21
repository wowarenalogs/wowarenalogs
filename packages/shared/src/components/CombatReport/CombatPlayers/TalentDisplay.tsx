import { ICombatUnit } from '@wowarenalogs/parser';
import { TbCopy } from 'react-icons/tb';

import { useClientContext } from '../../../hooks/ClientContext';
import { SpellIcon } from '../SpellIcon';
import { createExportString } from './talentStrings';

export const TalentDisplay = ({ player }: { player: ICombatUnit }) => {
  const clientContext = useClientContext();

  let exportString = '';

  try {
    exportString = createExportString(
      parseInt(player.info?.specId || '0'),
      player.info?.talents as {
        id1: number;
        id2: number;
        count: number;
      }[],
    );
  } catch (error) {
    exportString = 'Error loading talent string!';
    console.error(error);
  }

  if (exportString.startsWith('Error')) {
    return <div>Error loading</div>;
  }

  return (
    <div>
      <div className="text-lg font-bold">Talents</div>
      <iframe
        width={750}
        height={530}
        src={`https://www.raidbots.com/simbot/render/talents/${exportString}?width=700&level=70&hideExport=off`}
      />
      <div className="flex flex-row gap-2">
        <button
          className="btn btn-outline btn-sm gap-2"
          onClick={() => {
            navigator.clipboard.writeText(exportString);
          }}
        >
          <TbCopy size={24} />
          Export String
        </button>
        <button
          className="btn btn-outline btn-sm gap-2"
          onClick={() => {
            clientContext.openExternalURL(`https://www.wowhead.com/talent-calc/blizzard/${exportString}`);
          }}
        >
          View this build on Wowhead
        </button>
      </div>
      <div className="text-lg font-bold mt-2">PvP Talents</div>
      <div className="flex flex-row flex-wrap items-center mt-2 mb-2">
        {player.info?.pvpTalents
          .filter((t) => t && t !== '0')
          .map((t, i) => (
            <div className="ml-1" key={i}>
              <SpellIcon spellId={t} size={32} />
            </div>
          ))}
      </div>
    </div>
  );
};

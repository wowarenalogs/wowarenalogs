import { ICombatUnit } from '@wowarenalogs/parser';
import { TbCopy } from 'react-icons/tb';

import { useClientContext } from '../../../hooks/ClientContext';
import { createExportString } from './talentStrings';

export const TalentExport = ({ player }: { player: ICombatUnit }) => {
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
    <div className="flex flex-row gap-2">
      <button
        className="btn btn-outline btn-primary btn-sm gap-2"
        onClick={() => {
          navigator.clipboard.writeText(exportString);
        }}
      >
        <TbCopy size={24} />
        Export String
      </button>
      <button
        className="btn btn-outline btn-primary btn-sm gap-2"
        onClick={() => {
          clientContext.openExternalURL(`https://www.wowhead.com/talent-calc/blizzard/${exportString}`);
        }}
      >
        View this tree on WoWHead{' '}
      </button>
    </div>
  );
};

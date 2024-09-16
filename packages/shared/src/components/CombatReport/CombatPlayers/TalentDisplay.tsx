import { CombatUnitClass, ICombatUnit } from '@wowarenalogs/parser';
import { TbCopy } from 'react-icons/tb';

import { SpellIcon } from '../SpellIcon';
import { createExportString } from './talentStrings';

const classHeight = {
  [CombatUnitClass.None]: 500,
  [CombatUnitClass.Warrior]: 390,
  [CombatUnitClass.Evoker]: 490,
  [CombatUnitClass.Hunter]: 480,
  [CombatUnitClass.Shaman]: 420,
  [CombatUnitClass.Paladin]: 430,
  [CombatUnitClass.Warlock]: 490,
  [CombatUnitClass.Priest]: 430,
  [CombatUnitClass.Rogue]: 480,
  [CombatUnitClass.Mage]: 480,
  [CombatUnitClass.Druid]: 420,
  [CombatUnitClass.DeathKnight]: 420,
  [CombatUnitClass.DemonHunter]: 490,
  [CombatUnitClass.Monk]: 430,
};

export const TalentDisplay = ({ player }: { player: ICombatUnit }) => {
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
      <div className="flex flex-row gap-2">
        <div className="text-lg font-bold">Talents</div>
        <button
          className="btn btn-link btn-sm text-base-content"
          onClick={() => {
            navigator.clipboard.writeText(exportString);
          }}
        >
          <TbCopy size={24} />
          Export String
        </button>
      </div>
      <iframe
        width={700}
        height={classHeight[player.class]}
        src={`https://www.raidbots.com/simbot/render/talents/${exportString}?&width=700&hideexport=off&hideheader=true`}
      />
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

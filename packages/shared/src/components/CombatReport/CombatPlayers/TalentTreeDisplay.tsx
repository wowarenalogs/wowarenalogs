import { nodeMaps } from '@wowarenalogs/shared/src/components/CombatReport/CombatPlayers/talentStrings';
import { SpellIcon } from '@wowarenalogs/shared/src/components/CombatReport/SpellIcon';

interface IProps {
  specId: string;
  chosenTalents: ({ id1: number; id2: number; count: number } | null)[];
}

export const TalentTree = ({ specId, chosenTalents }: IProps) => {
  const talentTree = nodeMaps[parseInt(specId)];
  const SCALE = 22;

  const minPosX = Math.min(...talentTree.classNodes.map((x) => x.posX));
  const minPosY = Math.min(...talentTree.classNodes.map((x) => x.posY));
  const specTreeXOffset = 50;

  const unselectedOpacity = 0.15;

  // shim to make up for the weird nullability that's coming out of the parser atm
  const chsTalents = chosenTalents as unknown as { id2: number; id1: number; count: number }[];

  const selectedTalents = chsTalents.map((t) => t.id1);
  const countById = chsTalents.reduce((prev, cur) => {
    prev[cur.id1] = cur.count;
    return prev;
  }, {} as Record<number, number>);

  return (
    <div
      style={{
        position: 'relative',
        width: 600,
        height: 284,
      }}
    >
      {talentTree.classNodes.map((c) => {
        const isPartiallySelected = countById[c.id] && countById[c.id] < c.maxRanks;
        return (
          <div
            style={{
              padding: 8,
              position: 'absolute',
              top: c.posY / SCALE - minPosY / SCALE,
              left: c.posX / SCALE - minPosX / SCALE,
              color: 'black',
              zIndex: 10,
            }}
            key={c.id}
          >
            <SpellIcon
              spellId={c.entries[0].spellId}
              size={24}
              opacity={selectedTalents.includes(c.id) ? 1 : unselectedOpacity}
            />
            {isPartiallySelected && (
              <div
                style={{ pointerEvents: 'none', position: 'absolute', top: 12, left: 12, fontSize: 10, color: 'white' }}
              >
                1/2
              </div>
            )}
          </div>
        );
      })}
      {talentTree.specNodes.map((c) => {
        const isPartiallySelected = countById[c.id] && countById[c.id] < c.maxRanks;
        return (
          <div
            style={{
              padding: 8,
              position: 'absolute',
              top: c.posY / SCALE - minPosY / SCALE,
              left: c.posX / SCALE - minPosX / SCALE - specTreeXOffset,
              color: 'black',
              zIndex: 10,
            }}
            key={c.id}
          >
            <SpellIcon
              spellId={c.entries[0].spellId}
              size={24}
              opacity={selectedTalents.includes(c.id) ? 1 : unselectedOpacity}
            />
            {isPartiallySelected && (
              <div
                style={{ pointerEvents: 'none', position: 'absolute', top: 12, left: 12, fontSize: 10, color: 'white' }}
              >
                1/2
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

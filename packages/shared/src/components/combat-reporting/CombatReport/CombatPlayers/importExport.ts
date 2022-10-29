import { talentIdMap } from './betaTalents';

const emptyTreeHash = [
  {
    value: 0,
    bitWidth: 8,
  },
  {
    value: 0,
    bitWidth: 8,
  },
  {
    value: 0,
    bitWidth: 8,
  },
  {
    value: 0,
    bitWidth: 8,
  },
  {
    value: 0,
    bitWidth: 8,
  },
  {
    value: 0,
    bitWidth: 8,
  },
  {
    value: 0,
    bitWidth: 8,
  },
  {
    value: 0,
    bitWidth: 8,
  },
  {
    value: 0,
    bitWidth: 8,
  },
  {
    value: 0,
    bitWidth: 8,
  },
  {
    value: 0,
    bitWidth: 8,
  },
  {
    value: 0,
    bitWidth: 8,
  },
  {
    value: 0,
    bitWidth: 8,
  },
  {
    value: 0,
    bitWidth: 8,
  },
  {
    value: 0,
    bitWidth: 8,
  },
  {
    value: 0,
    bitWidth: 8,
  },
];

const nodeMap: Record<number, any> = {};

talentIdMap
  .map((a) => a.specNodes)
  .flat()
  .forEach((cur) => {
    nodeMap[cur.id] = cur;
  });

talentIdMap
  .map((a) => a.classNodes)
  .flat()
  .forEach((cur) => {
    nodeMap[cur.id] = cur;
  });

const BitsPerChar = 6;
const bitWidthRanksPurchased = 6;

const b64Table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wowExportTo64(dataEntries: any[]) {
  let exportString = '';
  let currentValue = 0;
  let currentReservedBits = 0;
  let totalBits = 0;
  for (let i = 0; i < dataEntries.length; i++) {
    const dataEntry = dataEntries[i];

    let remainingValue = dataEntry.value;
    let remainingRequiredBits = dataEntry.bitWidth;
    const maxValue = 1 << remainingRequiredBits;
    if (remainingValue >= maxValue) {
      throw new Error('max val fail');
    }

    totalBits = totalBits + remainingRequiredBits;
    while (remainingRequiredBits > 0) {
      const spaceInCurrentValue = BitsPerChar - currentReservedBits;
      const maxStorableValue = 1 << spaceInCurrentValue;
      const remainder = remainingValue % maxStorableValue;
      remainingValue = remainingValue >> spaceInCurrentValue;
      currentValue = currentValue + (remainder << currentReservedBits);

      if (spaceInCurrentValue > remainingRequiredBits) {
        currentReservedBits = (currentReservedBits + remainingRequiredBits) % BitsPerChar;
        remainingRequiredBits = 0;
      } else {
        exportString = exportString + b64Table[currentValue];
        currentValue = 0;
        currentReservedBits = 0;
        remainingRequiredBits = remainingRequiredBits - spaceInCurrentValue;
      }
    }
  }
  if (currentReservedBits > 0) {
    exportString = exportString + b64Table[currentValue];
  }
  return exportString;
}

function addValue(exportStream: any, bitWidth: number, value: number) {
  exportStream.push({
    bitWidth,
    value,
  });
}

function writeLoadoutContent(treeNodes: any, talentsPicked: { id1: number; id2: number; count: number }[]) {
  const exportStream: any[] = [];
  for (let i = 0; i < treeNodes.length; i++) {
    const treeNode = treeNodes[i];

    if (!treeNode) continue;

    const talentSelection = talentsPicked.find((i) => i.id1 === treeNode?.id);

    const isNodeSelected = talentSelection !== undefined;

    const isPartiallyRanked = talentSelection && talentSelection.count < treeNode.maxRanks;
    const isChoiceNode = treeNode?.type === 'choice';

    addValue(exportStream, 1, isNodeSelected ? 1 : 0);

    if (treeNode.maxRanks > 1) {
      console.log('maxR', treeNode.name, treeNode.id, {
        treeNode,
        isNodeSelected,
        isPartiallyRanked,
        isChoiceNode,
        talentSelection,
      });
    }
    if (isNodeSelected) {
      addValue(exportStream, 1, isPartiallyRanked ? 1 : 0);

      if (isPartiallyRanked) {
        addValue(exportStream, bitWidthRanksPurchased, talentSelection.count);
      }

      addValue(exportStream, 1, isChoiceNode ? 1 : 0);

      if (isChoiceNode) {
        const entryIndex = treeNode.entries.findIndex((t) => t.id === talentSelection?.id2); // GET ACTIVE ENTRY TODO
        if (entryIndex <= 0 || entryIndex > 4) {
          // error("Error exporting tree node " .. treeNode.ID .. ". The active choice node entry index (" .. entryIndex .. ") is out of bounds. ");
        }
        //-- store entry index as zero-index
        addValue(exportStream, 2, entryIndex);
        console.log('isCHoice', treeNode.name, treeNode.id, {
          isNodeSelected,
          isPartiallyRanked,
          isChoiceNode,
          talentSelection,
          entryIndex,
        });
      }
    }
  }
  return exportStream;
}

export const createExportString = (specId: number, talents: [{ id1: number; id2: number; count: number }]) => {
  const specNodes = talentIdMap
    .find((a) => a.specId === specId)
    ?.fullNodeOrder.map((a) => {
      if (!nodeMap[a]) {
        console.log('#### UNDEF NODE', a);
      }
      return nodeMap[a];
    });
  console.log('specNodes', specNodes);
  console.log('tal', { talents });

  if (!specNodes) throw new Error('Missing spec nodes');
  const loadout = writeLoadoutContent(specNodes, talents);
  console.log('lodout', { loadout });
  return wowExportTo64([
    {
      value: 1,
      bitWidth: 8,
    },
    {
      value: specId,
      bitWidth: 16,
    },
    ...emptyTreeHash,
    ...loadout,
  ]);
};

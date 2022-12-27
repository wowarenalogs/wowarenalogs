import talentIdMapData from '../../../data/talentIdMap.json';

export type RaidBotsTalentData = RaidbotsTalentSpec[];

export interface RaidbotsTalentSpec {
  traitTreeId: number;
  className: string;
  classId: number;
  specName: string;
  specId: number;
  classNodes: ClassNode[];
  specNodes: SpecNode[];
  fullNodeOrder: number[];
}

export interface ClassNode {
  id: number;
  name: string;
  type: string;
  posX: number;
  posY: number;
  maxRanks: number;
  entryNode?: boolean;
  next: number[];
  prev: number[];
  entries: Entry[];
  freeNode?: boolean;
  reqPoints?: number;
}

export interface Entry {
  id: number;
  definitionId: number;
  maxRanks: number;
  type: string;
  name: string;
  spellId: number;
  icon: string;
  index: number;
}

export interface SpecNode {
  id: number;
  name: string;
  type: string;
  posX: number;
  posY: number;
  maxRanks: number;
  entryNode?: boolean;
  next: number[];
  prev: number[];
  entries: Entry2[];
  reqPoints?: number;
  freeNode?: boolean; // MANUAL EDIT ADDED THIS HERE
}

export interface Entry2 {
  id: number;
  definitionId: number;
  maxRanks: number;
  type: string;
  name: string;
  spellId: number;
  icon: string;
  index: number;
}

type ExportStream = {
  value: number;
  bitWidth: number;
}[];

const talentIdMap = talentIdMapData as RaidBotsTalentData;

const emptyTreeHash: ExportStream = Array(128 / 8).fill({
  value: 0,
  bitWidth: 8,
});

type MappedRaidbotsSpec = RaidbotsTalentSpec & {
  specNodeMap: Record<number, SpecNode>;
  classNodeMap: Record<number, ClassNode>;
};

export const nodeMaps: Record<number, MappedRaidbotsSpec> = {};

talentIdMap.forEach((spec) => {
  nodeMaps[spec.specId] = {
    ...spec,
    classNodeMap: spec.classNodes.reduce((prev, cur) => {
      prev[cur.id] = cur;
      return prev;
    }, {} as Record<number, ClassNode>),
    specNodeMap: spec.specNodes.reduce((prev, cur) => {
      prev[cur.id] = cur;
      return prev;
    }, {} as Record<number, SpecNode>),
  };
});

const BitsPerChar = 6;
const bitWidthRanksPurchased = 6;

const b64Table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function wowExportTo64(dataEntries: ExportStream) {
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

function addValue(exportStream: ExportStream, bitWidth: number, value: number) {
  exportStream.push({
    bitWidth,
    value,
  });
}

function writeLoadoutContent(
  treeNodes: (ClassNode | SpecNode)[],
  talentsPicked: { id1: number; id2: number; count: number }[],
) {
  const exportStream: ExportStream = [];
  for (let i = 0; i < treeNodes.length; i++) {
    const treeNode = treeNodes[i];

    if (!treeNode) {
      addValue(exportStream, 1, 0);
      continue;
    }

    const talentSelection = talentsPicked.find((i) => i.id1 === treeNode?.id);

    const isNodeSelected = talentSelection !== undefined;

    const isPartiallyRanked = talentSelection && talentSelection.count < treeNode.maxRanks;
    const isChoiceNode = treeNode?.type === 'choice';

    if (treeNode.freeNode) {
      addValue(exportStream, 1, 0);
      continue;
    }
    addValue(exportStream, 1, isNodeSelected ? 1 : 0);

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
      }
    }
  }
  return exportStream;
}

export const createExportString = (specId: number, talents: { id1: number; id2: number; count: number }[]) => {
  const specData = nodeMaps[specId];

  const treeNodes: (ClassNode | SpecNode)[] = specData.fullNodeOrder.map((n) => {
    return specData.specNodeMap[n] || specData.classNodeMap[n];
  });

  const loadout = writeLoadoutContent(treeNodes, talents);
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

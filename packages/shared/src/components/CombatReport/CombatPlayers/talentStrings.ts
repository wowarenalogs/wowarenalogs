import talentIdMapData from '../../../data/talentIdMap.json';

export type RaidBotsTalentData = RaidbotsTalentSpec[];

// The current version is defined by C_Traits.GetLoadoutSerializationVersion()
const SERIALIZATION_VERSION = 2;

// local BitsPerChar = 6;
const BitsPerChar = 6;

// ClassTalentImportExportMixin.bitWidthHeaderVersion = 8;
// ClassTalentImportExportMixin.bitWidthSpecID = 16;
// ClassTalentImportExportMixin.bitWidthRanksPurchased = 6;
const bitWidthRanksPurchased = 6;

export interface RaidbotsTalentSpec {
  traitTreeId: number;
  className: string;
  classId: number;
  specName: string;
  specId: number;
  classNodes: ClassNode[];
  heroNodes: HeroNode[];
  subTreeNodes: SubtreeNode[];
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

export interface HeroNode {
  id: number;
  name: string;
  type: string;
  posX: number;
  posY: number;
  maxRanks: number;
  entryNode?: boolean;
  subTreeId: number;
  requiresNode: number;
  next: number[];
  prev: number[];
  entries: Entry[];
  freeNode?: boolean;
}

export interface SubtreeNode {
  id: number;
  name: string;
  type: string;
  posX: number;
  posY: number;
  entryNode?: boolean;
  next: number[];
  prev: number[];
  entries: SubtreeNodeEntry[];
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

export interface SubtreeNodeEntry {
  id: number;
  type: string;
  name: string;
  traitSubTreeId: number;
  traitTreeId: number;
  atlasMemberName: string;
  nodes: number[];
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
  subtreeNodeMap: Record<number, SubtreeNode>;
  heroNodeMap: Record<number, HeroNode>;
};

export const nodeMaps: Record<number, MappedRaidbotsSpec> = {};
const fullNodeMapping: Record<number, SpecNode | ClassNode | HeroNode | SubtreeNode> = {};

talentIdMap.forEach((spec) => {
  nodeMaps[spec.specId] = {
    ...spec,
    classNodeMap: spec.classNodes.reduce(
      (prev, cur) => {
        prev[cur.id] = cur;
        fullNodeMapping[cur.id] = cur;
        return prev;
      },
      {} as Record<number, ClassNode>,
    ),
    specNodeMap: spec.specNodes.reduce(
      (prev, cur) => {
        prev[cur.id] = cur;
        fullNodeMapping[cur.id] = cur;
        return prev;
      },
      {} as Record<number, SpecNode>,
    ),
    heroNodeMap: spec.heroNodes.reduce(
      (prev, cur) => {
        prev[cur.id] = cur;
        fullNodeMapping[cur.id] = cur;
        return prev;
      },
      {} as Record<number, HeroNode>,
    ),
    subtreeNodeMap: spec.subTreeNodes.reduce(
      (prev, cur) => {
        prev[cur.id] = cur;
        fullNodeMapping[cur.id] = cur;
        return prev;
      },
      {} as Record<number, SubtreeNode>,
    ),
  };
});

// local function MakeBase64ConversionTable()
// 	local base64ConversionTable = {};
// 	base64ConversionTable[0] = 'A';
// 	for num = 1, 25 do
// 		table.insert(base64ConversionTable, string.char(65 + num));
// 	end

// 	for num = 0, 25 do
// 		table.insert(base64ConversionTable, string.char(97 + num));
// 	end

// 	for num = 0, 9 do
// 		table.insert(base64ConversionTable, tostring(num));
// 	end

// 	table.insert(base64ConversionTable, '+');
// 	table.insert(base64ConversionTable, '/');
// 	return base64ConversionTable;
// end
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

// PORT of function ClassTalentImportExportMixin:WriteLoadoutContent(exportStream, configID, treeID)
function writeLoadoutContent(
  treeNodes: (ClassNode | SpecNode | HeroNode | SubtreeNode)[],
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
    // debug missing nodes, should never happen (lol)
    // if (!talentSelection) {
    //   console.log(treeNode);
    // }

    const isNodeSelected = talentSelection !== undefined;

    const isPartiallyRanked = 'maxRanks' in treeNode && talentSelection && talentSelection.count < treeNode.maxRanks;
    const isChoiceNode = treeNode?.type === 'choice' || treeNode?.type === 'subtree';

    if ('freeNode' in treeNode && treeNode.freeNode) {
      addValue(exportStream, 1, 0);
      continue;
    }

    addValue(exportStream, 1, isNodeSelected ? 1 : 0);

    if (isNodeSelected) {
      // This extra addValue is in bliz code, I'm not sure why it's needed
      // their code makes some differentiation between a talent node being "selected" vs. "purchased"
      // but I don't see any differentiation in the game client or the combat log data :thinking:
      addValue(exportStream, 1, isNodeSelected ? 1 : 0);

      addValue(exportStream, 1, isPartiallyRanked ? 1 : 0);

      if (isPartiallyRanked) {
        addValue(exportStream, bitWidthRanksPurchased, talentSelection.count);
      }

      addValue(exportStream, 1, isChoiceNode ? 1 : 0);

      if (isChoiceNode) {
        const entryIndex = treeNode.entries.findIndex((t) => t.id === talentSelection?.id2); // GET ACTIVE ENTRY TODO
        // console.log('choice index', entryIndex);
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

  const treeNodes = specData.fullNodeOrder.map((n) => {
    return fullNodeMapping[n];
  });

  // console.log(`Empty tree nodes count: ${treeNodes.filter((n) => !n).length}`);
  // console.log(`Number of talents: ${talents.length}`);
  // console.log({ treeNodes }, specData.fullNodeOrder);

  const loadout = writeLoadoutContent(treeNodes, talents);
  return wowExportTo64([
    {
      value: SERIALIZATION_VERSION,
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

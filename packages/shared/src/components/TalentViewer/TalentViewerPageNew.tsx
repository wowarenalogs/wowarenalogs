import { CombatUnitClass, CombatUnitSpec } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useRouter } from 'next/router';
import { NextSeo } from 'next-seo';
import { useEffect, useState } from 'react';
import { TbCaretDown, TbCopy, TbInfoCircle, TbLoader, TbTrendingDown, TbTrendingUp } from 'react-icons/tb';

import { Utils } from '../../utils/utils';
import { ClassImage } from '../common/ClassImage';
import { DownloadPromotion } from '../common/DownloadPromotion';
import { Dropdown } from '../common/Dropdown';
import { SpecImage } from '../common/SpecImage';
import { SpellIcon } from '../CombatReport/SpellIcon';

const SUPPORTED_BRACKETS = ['2v2', '3v3', 'Rated Solo Shuffle'];
const RATING_RANGES = [
  [0, 4999],
  [0, 1399],
  [1400, 1799],
  [1800, 2099],
  [2100, 4999],
];

const ALL_SPECS = Object.values(CombatUnitSpec).filter(
  (spec) => spec !== CombatUnitSpec.None,
);

const printRatingRange = (min: number, max: number) => {
  if (min === 0 && max === 4999) {
    return 'All Ratings';
  }
  return `${min} - ${max}`;
};

interface TalentBuildData {
  buildId: string;
  talents: Array<{ id1: number; id2: number; count: number }>;
  pvpTalents: string[];
  exportString: string;
  matchCount: number;
  winRate: number;
  usageRate: number;
}

// Class to specs mapping
const CLASS_SPECS: { [key in CombatUnitClass]?: CombatUnitSpec[] } = {
  [CombatUnitClass.Warrior]: [
    CombatUnitSpec.Warrior_Arms,
    CombatUnitSpec.Warrior_Fury,
    CombatUnitSpec.Warrior_Protection,
  ],
  [CombatUnitClass.Paladin]: [
    CombatUnitSpec.Paladin_Holy,
    CombatUnitSpec.Paladin_Protection,
    CombatUnitSpec.Paladin_Retribution,
  ],
  [CombatUnitClass.Hunter]: [
    CombatUnitSpec.Hunter_BeastMastery,
    CombatUnitSpec.Hunter_Marksmanship,
    CombatUnitSpec.Hunter_Survival,
  ],
  [CombatUnitClass.Rogue]: [
    CombatUnitSpec.Rogue_Assassination,
    CombatUnitSpec.Rogue_Outlaw,
    CombatUnitSpec.Rogue_Subtlety,
  ],
  [CombatUnitClass.Priest]: [
    CombatUnitSpec.Priest_Discipline,
    CombatUnitSpec.Priest_Holy,
    CombatUnitSpec.Priest_Shadow,
  ],
  [CombatUnitClass.DeathKnight]: [
    CombatUnitSpec.DeathKnight_Blood,
    CombatUnitSpec.DeathKnight_Frost,
    CombatUnitSpec.DeathKnight_Unholy,
  ],
  [CombatUnitClass.Shaman]: [
    CombatUnitSpec.Shaman_Elemental,
    CombatUnitSpec.Shaman_Enhancement,
    CombatUnitSpec.Shaman_Restoration,
  ],
  [CombatUnitClass.Mage]: [
    CombatUnitSpec.Mage_Arcane,
    CombatUnitSpec.Mage_Fire,
    CombatUnitSpec.Mage_Frost,
  ],
  [CombatUnitClass.Warlock]: [
    CombatUnitSpec.Warlock_Affliction,
    CombatUnitSpec.Warlock_Demonology,
    CombatUnitSpec.Warlock_Destruction,
  ],
  [CombatUnitClass.Monk]: [
    CombatUnitSpec.Monk_BrewMaster,
    CombatUnitSpec.Monk_Mistweaver,
    CombatUnitSpec.Monk_Windwalker,
  ],
  [CombatUnitClass.Druid]: [
    CombatUnitSpec.Druid_Balance,
    CombatUnitSpec.Druid_Feral,
    CombatUnitSpec.Druid_Guardian,
    CombatUnitSpec.Druid_Restoration,
  ],
  [CombatUnitClass.DemonHunter]: [
    CombatUnitSpec.DemonHunter_Havoc,
    CombatUnitSpec.DemonHunter_Vengeance,
  ],
  [CombatUnitClass.Evoker]: [
    CombatUnitSpec.Evoker_Augmentation,
    CombatUnitSpec.Evoker_Devastation,
    CombatUnitSpec.Evoker_Preservation,
  ],
};

const PLAYABLE_CLASSES = [
  CombatUnitClass.Warrior,
  CombatUnitClass.Paladin,
  CombatUnitClass.Hunter,
  CombatUnitClass.Rogue,
  CombatUnitClass.Priest,
  CombatUnitClass.DeathKnight,
  CombatUnitClass.Shaman,
  CombatUnitClass.Mage,
  CombatUnitClass.Warlock,
  CombatUnitClass.Monk,
  CombatUnitClass.Druid,
  CombatUnitClass.DemonHunter,
  CombatUnitClass.Evoker,
];

const classHeight = {
  [CombatUnitClass.None]: 650,
  [CombatUnitClass.Warrior]: 600,
  [CombatUnitClass.Evoker]: 650,
  [CombatUnitClass.Hunter]: 620,
  [CombatUnitClass.Shaman]: 600,
  [CombatUnitClass.Paladin]: 600,
  [CombatUnitClass.Warlock]: 650,
  [CombatUnitClass.Priest]: 600,
  [CombatUnitClass.Rogue]: 620,
  [CombatUnitClass.Mage]: 620,
  [CombatUnitClass.Druid]: 600,
  [CombatUnitClass.DeathKnight]: 600,
  [CombatUnitClass.DemonHunter]: 650,
  [CombatUnitClass.Monk]: 600,
};

// Build card component
const BuildCard = ({ 
  build, 
  rank, 
  isSelected, 
  onClick 
}: { 
  build: TalentBuildData;
  rank: number;
  isSelected: boolean;
  onClick: () => void;
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyExportString = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(build.exportString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getRankBadgeColor = () => {
    if (rank === 1) return 'badge-warning'; // Gold
    if (rank === 2) return 'badge-info'; // Silver
    if (rank === 3) return 'badge-accent'; // Bronze
    return 'badge-neutral';
  };

  const getWinRateColor = () => {
    if (build.winRate >= 55) return 'text-success';
    if (build.winRate <= 45) return 'text-error';
    return 'text-base-content';
  };

  return (
    <div 
      className={`card bg-base-200 shadow-xl cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-primary' : 'hover:shadow-2xl'
      }`}
      onClick={onClick}
    >
      <div className="card-body p-4">
        {/* Header */}
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <div className={`badge ${getRankBadgeColor()} font-bold`}>#{rank}</div>
            {isSelected && <div className="badge badge-primary">Selected</div>}
          </div>
          <button
            className={`btn btn-sm ${copied ? 'btn-success' : 'btn-ghost'}`}
            onClick={handleCopyExportString}
            title="Copy talent export string"
          >
            <TbCopy size={16} />
            {copied ? 'Copied!' : 'Export'}
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center">
            <div className="text-xs opacity-60">Usage</div>
            <div className="text-lg font-bold">{build.usageRate}%</div>
          </div>
          <div className="text-center">
            <div className="text-xs opacity-60">Win Rate</div>
            <div className={`text-lg font-bold ${getWinRateColor()}`}>{build.winRate}%</div>
          </div>
          <div className="text-center">
            <div className="text-xs opacity-60">Matches</div>
            <div className="text-lg font-bold">{build.matchCount}</div>
          </div>
        </div>

        {/* PvP Talents */}
        <div>
          <div className="text-sm font-semibold mb-1">PvP Talents</div>
          <div className="flex gap-1">
            {build.pvpTalents
              .filter((t) => t && t !== '0')
              .map((talentId, index) => (
                <div key={index} className="tooltip" data-tip={`PvP Talent ${talentId}`}>
                  <SpellIcon spellId={talentId} size={32} />
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const TalentViewerPageNew = () => {
  const router = useRouter();

  const bracket = (router.query.bracket as string) ?? 'Rated Solo Shuffle';
  const minRating = parseInt((router.query.minRating as string) ?? '0');
  const maxRating = parseInt((router.query.maxRating as string) ?? '4999');
  const selectedSpec = (router.query.spec as CombatUnitSpec) ?? CombatUnitSpec.Warrior_Arms;

  const [talentData, setTalentData] = useState<{ [specId: string]: TalentBuildData[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<CombatUnitClass>(Utils.getSpecClass(selectedSpec));
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [selectedBuild, setSelectedBuild] = useState<TalentBuildData | null>(null);

  // Map spec to specId
  const getSpecId = (spec: CombatUnitSpec): number => {
    const specIdMap: { [key in CombatUnitSpec]?: number } = {
      [CombatUnitSpec.Warrior_Arms]: 71,
      [CombatUnitSpec.Warrior_Fury]: 72,
      [CombatUnitSpec.Warrior_Protection]: 73,
      // ... (rest of the mapping)
    };
    return specIdMap[spec] ?? 0;
  };

  useEffect(() => {
    const fetchTalentData = async () => {
      setLoading(true);
      setError(null);

      try {
        const isDev = window.location.hostname === 'localhost';
        
        if (isDev) {
          const response = await fetch('/mock-talent-data.json');
          if (!response.ok) {
            throw new Error('Failed to fetch mock talent data');
          }
          const data = await response.json();
          setTalentData(data);
          setLastRefresh(new Date().toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }));
          
          // Auto-select first build
          const specBuilds = data[getSpecId(selectedSpec).toString()];
          if (specBuilds && specBuilds.length > 0) {
            setSelectedBuild(specBuilds[0]);
          }
        } else {
          const baseUrl = 'https://data.wowarenalogs.com';
          const response = await fetch(
            `${baseUrl}/data/talent-stats/${bracket}/${minRating}-${maxRating}/v1.latest.json`,
          );

          if (!response.ok) {
            throw new Error('Failed to fetch talent data');
          }

          const data = await response.json();
          setTalentData(data);
          setLastRefresh(new Date().toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric'
          }));
        }
      } catch (err) {
        console.error('Error fetching talent data:', err);
        setError('Failed to load talent data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchTalentData();
  }, [bracket, minRating, maxRating, selectedSpec]);

  const currentSpecId = getSpecId(selectedSpec).toString();
  const currentSpecBuilds = talentData?.[currentSpecId] ?? [];
  const currentClass = Utils.getSpecClass(selectedSpec);

  return (
    <div className="flex flex-col h-full">
      <NextSeo
        title={`${Utils.getSpecName(selectedSpec)} Talent Builds - ${bracket}`}
        description={`Most popular and successful talent builds for ${Utils.getSpecName(
          selectedSpec,
        )} in ${bracket} PvP matches.`}
      />

      {/* Header Controls */}
      <div className="px-4 py-2">
        <DownloadPromotion />

        <div className="flex flex-col md:flex-row gap-2 items-center z-50 mb-4">
          {/* Bracket Selector */}
          <Dropdown
            menuItems={SUPPORTED_BRACKETS.map((b) => ({
              key: b,
              label: b,
              onClick: () => {
                router.push(
                  `/talents?bracket=${b}&minRating=${minRating}&maxRating=${maxRating}&spec=${selectedSpec}`,
                  undefined,
                  { shallow: true },
                );
              },
            }))}
          >
            <>
              {bracket}&nbsp;
              <TbCaretDown />
            </>
          </Dropdown>

          {/* Rating Range Selector */}
          <Dropdown
            menuItems={RATING_RANGES.map((r) => ({
              key: `${r[0]}-${r[1]}`,
              label: printRatingRange(r[0], r[1]),
              onClick: () => {
                router.push(
                  `/talents?bracket=${bracket}&minRating=${r[0]}&maxRating=${r[1]}&spec=${selectedSpec}`,
                  undefined,
                  { shallow: true },
                );
              },
            }))}
          >
            <>
              {printRatingRange(minRating, maxRating)}&nbsp;
              <TbCaretDown />
            </>
          </Dropdown>

          {/* Class Selector */}
          <Dropdown
            menuItems={PLAYABLE_CLASSES.map((cls) => ({
              key: cls,
              label: (
                <div className="flex items-center gap-2">
                  <ClassImage unitClass={cls} size={20} />
                  {Utils.getClassName(cls)}
                </div>
              ),
              onClick: () => {
                setSelectedClass(cls);
                const specs = CLASS_SPECS[cls];
                if (specs && specs.length > 0) {
                  router.push(
                    `/talents?bracket=${bracket}&minRating=${minRating}&maxRating=${maxRating}&spec=${specs[0]}`,
                    undefined,
                    { shallow: true },
                  );
                }
              },
            }))}
          >
            <div className="flex items-center gap-2">
              <ClassImage unitClass={selectedClass} size={24} />
              {Utils.getClassName(selectedClass)}&nbsp;
              <TbCaretDown />
            </div>
          </Dropdown>

          {/* Spec Selector */}
          <Dropdown
            menuItems={(CLASS_SPECS[selectedClass] || []).map((spec) => ({
              key: spec,
              label: (
                <div className="flex items-center gap-2">
                  <SpecImage spec={spec} size={20} />
                  {Utils.getSpecName(spec)}
                </div>
              ),
              onClick: () => {
                router.push(
                  `/talents?bracket=${bracket}&minRating=${minRating}&maxRating=${maxRating}&spec=${spec}`,
                  undefined,
                  { shallow: true },
                );
              },
            }))}
          >
            <div className="flex items-center gap-2">
              <SpecImage spec={selectedSpec} size={24} />
              {Utils.getSpecName(selectedSpec)}&nbsp;
              <TbCaretDown />
            </div>
          </Dropdown>

          {/* Info Badge */}
          <div
            className="tooltip tooltip-bottom tooltip-info"
            data-tip="Based on ranked matches uploaded during the past 28 days. Builds are sorted by usage rate."
          >
            <TbInfoCircle size={20} />
          </div>

          {/* Last Refresh Date */}
          {lastRefresh && (
            <div className="text-sm text-base-content opacity-70 flex items-center gap-1">
              <span>Last updated:</span>
              <span className="font-semibold">{lastRefresh}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Build List */}
        <div className="w-96 overflow-y-auto border-r border-base-300 p-4">
          {loading && (
            <div className="flex justify-center items-center py-12">
              <TbLoader className="animate-spin-slow" size={60} color="gray" />
            </div>
          )}

          {error && (
            <div className="alert alert-error">
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && currentSpecBuilds.length === 0 && (
            <div className="alert alert-info">
              <span>No talent data available for {Utils.getSpecName(selectedSpec)} in this bracket and rating range.</span>
            </div>
          )}

          {!loading && !error && currentSpecBuilds.length > 0 && (
            <>
              {/* Mock Data Notice for Development */}
              {window.location.hostname === 'localhost' && (
                <div className="alert alert-warning mb-4">
                  <svg className="stroke-current flex-shrink-0 w-6 h-6" fill="none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Using mock data for development.</span>
                </div>
              )}

              {/* Summary Stats */}
              <div className="stats shadow mb-4 w-full">
                <div className="stat py-2 px-3">
                  <div className="stat-title text-xs">Total Builds</div>
                  <div className="stat-value text-2xl">{currentSpecBuilds.length}</div>
                </div>
                <div className="stat py-2 px-3">
                  <div className="stat-title text-xs">Total Matches</div>
                  <div className="stat-value text-2xl">
                    {currentSpecBuilds.reduce((sum, b) => sum + b.matchCount, 0).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Build Cards */}
              <div className="space-y-3">
                {currentSpecBuilds.map((build, index) => (
                  <BuildCard
                    key={build.buildId}
                    build={build}
                    rank={index + 1}
                    isSelected={selectedBuild?.buildId === build.buildId}
                    onClick={() => setSelectedBuild(build)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right Panel - Talent Tree View */}
        <div className="flex-1 overflow-auto bg-base-100">
          {selectedBuild ? (
            <div className="p-4 h-full">
              <div className="mb-4">
                <h2 className="text-2xl font-bold mb-2">
                  {Utils.getSpecName(selectedSpec)} - Build #{currentSpecBuilds.findIndex(b => b.buildId === selectedBuild.buildId) + 1}
                </h2>
                <div className="flex gap-4 text-sm">
                  <span>Usage: <span className="font-bold">{selectedBuild.usageRate}%</span></span>
                  <span>Win Rate: <span className="font-bold text-success">{selectedBuild.winRate}%</span></span>
                  <span>Matches: <span className="font-bold">{selectedBuild.matchCount}</span></span>
                </div>
              </div>

              {/* Talent Tree iframe - Only show for valid export strings */}
              {selectedBuild.exportString && 
               selectedBuild.exportString.length > 20 && 
               !selectedBuild.exportString.startsWith('MOCK_') && 
               !selectedBuild.exportString.startsWith('PLACEHOLDER_') && 
               !selectedBuild.exportString.startsWith('TEST_') ? (
                <div className="bg-base-200 rounded-lg p-4">
                  <iframe
                    width="100%"
                    height={classHeight[currentClass]}
                    src={`https://www.raidbots.com/simbot/render/talents/${selectedBuild.exportString}?&width=700&hideexport=off&hideheader=true`}
                    style={{ border: 'none' }}
                  />
                </div>
              ) : (
                <div className="bg-base-200 rounded-lg p-8 text-center">
                  <div className="text-xl opacity-60 mb-4">
                    Talent tree preview not available for test data
                  </div>
                  <div className="text-sm opacity-50">
                    Real talent trees will be displayed once the Cloud Function processes actual match data
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-xl opacity-60">
              Select a build to view its talent tree
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
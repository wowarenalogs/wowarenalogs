import { CombatUnitClass, CombatUnitSpec } from '@wowarenalogs/parser';
import _ from 'lodash';
import { useRouter } from 'next/router';
import { NextSeo } from 'next-seo';
import { useEffect, useState } from 'react';
import { TbCaretDown, TbInfoCircle, TbLoader } from 'react-icons/tb';

import { Utils } from '../../utils/utils';
import { ClassImage } from '../common/ClassImage';
import { DownloadPromotion } from '../common/DownloadPromotion';
import { Dropdown } from '../common/Dropdown';
import { SpecImage } from '../common/SpecImage';
import { TalentBuildCard } from './TalentBuildCard';

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

export const TalentViewerPage = () => {
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

  // Map spec to specId (this would need to be properly implemented based on your spec ID mapping)
  const getSpecId = (spec: CombatUnitSpec): number => {
    // This is a placeholder - you need to implement proper spec to ID mapping
    const specIdMap: { [key in CombatUnitSpec]?: number } = {
      [CombatUnitSpec.Warrior_Arms]: 71,
      [CombatUnitSpec.Warrior_Fury]: 72,
      [CombatUnitSpec.Warrior_Protection]: 73,
      [CombatUnitSpec.Paladin_Holy]: 65,
      [CombatUnitSpec.Paladin_Protection]: 66,
      [CombatUnitSpec.Paladin_Retribution]: 70,
      [CombatUnitSpec.Hunter_BeastMastery]: 253,
      [CombatUnitSpec.Hunter_Marksmanship]: 254,
      [CombatUnitSpec.Hunter_Survival]: 255,
      [CombatUnitSpec.Rogue_Assassination]: 259,
      [CombatUnitSpec.Rogue_Outlaw]: 260,
      [CombatUnitSpec.Rogue_Subtlety]: 261,
      [CombatUnitSpec.Priest_Discipline]: 256,
      [CombatUnitSpec.Priest_Holy]: 257,
      [CombatUnitSpec.Priest_Shadow]: 258,
      [CombatUnitSpec.DeathKnight_Blood]: 250,
      [CombatUnitSpec.DeathKnight_Frost]: 251,
      [CombatUnitSpec.DeathKnight_Unholy]: 252,
      [CombatUnitSpec.Shaman_Elemental]: 262,
      [CombatUnitSpec.Shaman_Enhancement]: 263,
      [CombatUnitSpec.Shaman_Restoration]: 264,
      [CombatUnitSpec.Mage_Arcane]: 62,
      [CombatUnitSpec.Mage_Fire]: 63,
      [CombatUnitSpec.Mage_Frost]: 64,
      [CombatUnitSpec.Warlock_Affliction]: 265,
      [CombatUnitSpec.Warlock_Demonology]: 266,
      [CombatUnitSpec.Warlock_Destruction]: 267,
      [CombatUnitSpec.Monk_BrewMaster]: 268,
      [CombatUnitSpec.Monk_Windwalker]: 269,
      [CombatUnitSpec.Monk_Mistweaver]: 270,
      [CombatUnitSpec.Druid_Balance]: 102,
      [CombatUnitSpec.Druid_Feral]: 103,
      [CombatUnitSpec.Druid_Guardian]: 104,
      [CombatUnitSpec.Druid_Restoration]: 105,
      [CombatUnitSpec.DemonHunter_Havoc]: 577,
      [CombatUnitSpec.DemonHunter_Vengeance]: 581,
      [CombatUnitSpec.Evoker_Devastation]: 1467,
      [CombatUnitSpec.Evoker_Preservation]: 1468,
      [CombatUnitSpec.Evoker_Augmentation]: 1473,
    };
    return specIdMap[spec] ?? 0;
  };

  useEffect(() => {
    const fetchTalentData = async () => {
      setLoading(true);
      setError(null);

      try {
        const isDev = window.location.hostname === 'localhost';
        
        // Use mock data for local development
        if (isDev) {
          // For now, use the same mock data for all bracket/rating combinations
          const response = await fetch('/mock-talent-data.json');
          if (!response.ok) {
            throw new Error('Failed to fetch mock talent data');
          }
          const data = await response.json();
          setTalentData(data);
          // Set mock last refresh date for development
          setLastRefresh(new Date().toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }));
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
          // In production, we could fetch metadata to get actual refresh date
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
  }, [bracket, minRating, maxRating]);

  // Helper function to get class from spec - use Utils.getSpecClass
  const getClassForSpec = (spec: CombatUnitSpec): CombatUnitClass => {
    return Utils.getSpecClass(spec);
  };

  const currentSpecId = getSpecId(selectedSpec).toString();
  const currentSpecBuilds = talentData?.[currentSpecId] ?? [];
  const currentClass = getClassForSpec(selectedSpec);

  return (
    <div className="flex flex-col px-4 py-2 w-full h-full items-stretch">
      <NextSeo
        title={`${Utils.getSpecName(selectedSpec)} Talent Builds - ${bracket}`}
        description={`Most popular and successful talent builds for ${Utils.getSpecName(
          selectedSpec,
        )} in ${bracket} PvP matches.`}
      />

      <DownloadPromotion />

      {/* Controls */}
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
              // Select the first spec of this class
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

      {/* Content */}
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
              <span>Using mock data for development. Real talent data will be available after Cloud Function deployment.</span>
            </div>
          )}

          {/* Summary Stats */}
          <div className="stats shadow mb-4">
            <div className="stat">
              <div className="stat-title">Total Builds</div>
              <div className="stat-value">{currentSpecBuilds.length}</div>
            </div>
            <div className="stat">
              <div className="stat-title">Total Matches</div>
              <div className="stat-value">
                {currentSpecBuilds.reduce((sum, b) => sum + b.matchCount, 0).toLocaleString()}
              </div>
            </div>
            <div className="stat">
              <div className="stat-title">Top Build Win Rate</div>
              <div className="stat-value text-success">{currentSpecBuilds[0]?.winRate ?? 0}%</div>
            </div>
          </div>

          {/* Build Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {currentSpecBuilds.map((build, index) => (
              <TalentBuildCard
                key={build.buildId}
                build={build}
                specId={getSpecId(selectedSpec)}
                specName={Utils.getSpecName(selectedSpec)}
                className={currentClass}
                rank={index + 1}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
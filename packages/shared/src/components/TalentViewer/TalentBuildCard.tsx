import { CombatUnitClass, CombatUnitSpec } from '@wowarenalogs/parser';
import { useState } from 'react';
import { TbCopy, TbTrendingDown, TbTrendingUp } from 'react-icons/tb';

import { createExportString } from '../CombatReport/CombatPlayers/talentStrings';
import { SpellIcon } from '../CombatReport/SpellIcon';

interface TalentBuildData {
  buildId: string;
  talents: Array<{ id1: number; id2: number; count: number }>;
  pvpTalents: string[];
  exportString: string;
  matchCount: number;
  winRate: number;
  usageRate: number;
}

interface TalentBuildCardProps {
  build: TalentBuildData;
  specId: number;
  specName: string;
  className: CombatUnitClass;
  rank: number;
}

const classHeight = {
  [CombatUnitClass.None]: 550,
  [CombatUnitClass.Warrior]: 500,
  [CombatUnitClass.Evoker]: 550,
  [CombatUnitClass.Hunter]: 520,
  [CombatUnitClass.Shaman]: 500,
  [CombatUnitClass.Paladin]: 500,
  [CombatUnitClass.Warlock]: 550,
  [CombatUnitClass.Priest]: 500,
  [CombatUnitClass.Rogue]: 520,
  [CombatUnitClass.Mage]: 520,
  [CombatUnitClass.Druid]: 500,
  [CombatUnitClass.DeathKnight]: 500,
  [CombatUnitClass.DemonHunter]: 550,
  [CombatUnitClass.Monk]: 500,
};

export const TalentBuildCard = ({ build, specId, specName, className, rank }: TalentBuildCardProps) => {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyExportString = () => {
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
    <div className="card bg-base-200 shadow-xl">
      <div className="card-body p-4">
        {/* Header */}
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <div className={`badge ${getRankBadgeColor()} font-bold`}>#{rank}</div>
            <h3 className="font-semibold">{specName}</h3>
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
          <div className="stat p-2 bg-base-300 rounded">
            <div className="stat-title text-xs">Usage</div>
            <div className="stat-value text-lg">{build.usageRate}%</div>
          </div>
          <div className="stat p-2 bg-base-300 rounded">
            <div className="stat-title text-xs">Win Rate</div>
            <div className={`stat-value text-lg ${getWinRateColor()}`}>{build.winRate}%</div>
          </div>
          <div className="stat p-2 bg-base-300 rounded">
            <div className="stat-title text-xs">Matches</div>
            <div className="stat-value text-lg">{build.matchCount}</div>
          </div>
        </div>

        {/* PvP Talents */}
        <div className="mb-3">
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

        {/* Talent Tree Preview/Toggle - Only show for valid export strings */}
        {build.exportString && build.exportString.length > 20 && !build.exportString.startsWith('MOCK_') && !build.exportString.startsWith('PLACEHOLDER_') && !build.exportString.startsWith('TEST_') ? (
          <div className="collapse collapse-arrow bg-base-300">
            <input
              type="checkbox"
              checked={showDetails}
              onChange={(e) => setShowDetails(e.target.checked)}
              className="min-h-0"
            />
            <div className="collapse-title min-h-0 py-2 text-sm font-medium">View Talent Tree</div>
            <div className="collapse-content p-0">
              {showDetails && (
                <div className="overflow-hidden rounded">
                  <iframe
                    width="100%"
                    height={classHeight[className]}
                    src={`https://www.raidbots.com/simbot/render/talents/${build.exportString}?&width=500&hideexport=off&hideheader=true`}
                    style={{ border: 'none' }}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-base-300 rounded p-2 text-center text-sm text-base-content opacity-60">
            Talent tree preview not available for test data
          </div>
        )}
      </div>
    </div>
  );
};
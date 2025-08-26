import { useEffect, useMemo, useState } from 'react';

import { useCombatReportContext } from '../CombatReportContext';
import { CombatUnitName } from '../CombatUnitName';
import { DeathBadge, RecordingBadge } from './components';
import { MultiPlayerTimeline } from './MultiPlayerTimeline';

export const CombatTimeline = () => {
  const { combat, players } = useCombatReportContext();

  // Smart default player selection: prioritize players who died and the recording player
  const getDefaultSelectedPlayers = useMemo(() => {
    if (!combat || players.length === 0) return new Set<string>();

    const selectedIds = new Set<string>();

    // First, add the recording player (if available)
    if (combat.playerId) {
      selectedIds.add(combat.playerId);
    }

    // Then add players who died in the match
    players.forEach((player) => {
      if (player.deathRecords.length > 0) {
        selectedIds.add(player.id);
      }
    });

    // If we still don't have enough players, add the first few players
    if (selectedIds.size < 2 && players.length > 0) {
      players.slice(0, 2 - selectedIds.size).forEach((player) => {
        if (!selectedIds.has(player.id)) {
          selectedIds.add(player.id);
        }
      });
    }

    return selectedIds;
  }, [combat, players]);

  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(getDefaultSelectedPlayers);
  const [showAuras, setShowAuras] = useState<boolean>(false);
  const [showSpells, setShowSpells] = useState<boolean>(true);
  const [showInterrupts, setShowInterrupts] = useState<boolean>(true);

  const selectedPlayers = useMemo(() => {
    return players.filter((p) => selectedPlayerIds.has(p.id));
  }, [players, selectedPlayerIds]);

  // Reset selected players when combat changes to apply smart selection
  useEffect(() => {
    setSelectedPlayerIds(getDefaultSelectedPlayers);
  }, [getDefaultSelectedPlayers]);

  const combatDurationInSeconds = combat ? (combat.endTime - combat.startTime) / 1000 : 0;

  if (!combat) {
    return null;
  }

  return (
    <div className="flex flex-row flex-1">
      <div className="flex flex-col">
        <div className="mb-4">
          <div className="form-control">
            <label className="label cursor-pointer">
              <span className="label-text mr-2">Show Spells</span>
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={showSpells}
                onChange={(e) => setShowSpells(e.target.checked)}
              />
            </label>
          </div>
          <div className="form-control">
            <label className="label cursor-pointer">
              <span className="label-text mr-2">Show Auras</span>
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={showAuras}
                onChange={(e) => setShowAuras(e.target.checked)}
              />
            </label>
          </div>
          <div className="form-control">
            <label className="label cursor-pointer">
              <span className="label-text mr-2">Show Interrupts</span>
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={showInterrupts}
                onChange={(e) => setShowInterrupts(e.target.checked)}
              />
            </label>
          </div>
        </div>
        <ul className="menu mr-2 min-w-fit sticky top-0">
          {players.map((player) => {
            const isRecordingPlayer = combat?.playerId === player.id;
            const hasDied = player.deathRecords.length > 0;

            return (
              <li key={player.id} className={`${selectedPlayerIds.has(player.id) ? 'bordered' : ''}`}>
                <a
                  className="flex flex-row"
                  onClick={() => {
                    setSelectedPlayerIds((prev) => {
                      const newSet = new Set(prev);
                      if (newSet.has(player.id)) {
                        newSet.delete(player.id);
                      } else {
                        newSet.add(player.id);
                      }
                      return newSet;
                    });
                  }}
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm mr-2"
                    checked={selectedPlayerIds.has(player.id)}
                    readOnly
                  />
                  <div className="flex items-center space-x-2">
                    <CombatUnitName unit={player} />
                    {isRecordingPlayer && <RecordingBadge />}
                    {hasDied && <DeathBadge deathCount={player.deathRecords.length} />}
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex-1 ml-4">
        <div className="mb-4">
          <h3 className="text-lg font-bold">Multi-Player Timeline</h3>
          <p className="text-sm opacity-75">
            {selectedPlayers.length} players selected • Combat duration: {combatDurationInSeconds.toFixed(1)}s
          </p>
        </div>

        <MultiPlayerTimeline
          selectedPlayers={selectedPlayers}
          showSpells={showSpells}
          showAuras={showAuras}
          showInterrupts={showInterrupts}
        />
      </div>
    </div>
  );
};

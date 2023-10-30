import { ArenaMatchEndInfo, ArenaMatchStartInfo, CombatResult, WowVersion } from '@wowarenalogs/parser';

/** TODO: MUSTFIX move these to somewhere move centralized */
export interface IMetadata {
  dataType: 'ArenaMatchMetadata' | 'ShuffleMatchMetadata';
  startInfo: ArenaMatchStartInfo;
  endInfo: ArenaMatchEndInfo;
  wowVersion: WowVersion;
  id: string;
  timezone: string;
  startTime: number;
  endTime: number;
  playerId: string;
  playerTeamId: string;
  result: CombatResult;
  durationInSeconds: number;
  winningTeamId: string;
}

export interface ArenaMatchMetadata extends IMetadata {
  dataType: 'ArenaMatchMetadata';
}

export interface ShuffleMatchMetadata extends IMetadata {
  dataType: 'ShuffleMatchMetadata';
  roundStarts: {
    id: string;
    startInfo: ArenaMatchStartInfo;
    sequenceNumber: number;
  }[];
}

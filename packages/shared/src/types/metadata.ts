import { ArenaMatchEndInfo, ArenaMatchStartInfo, CombatResult, WowVersion } from '@wowarenalogs/parser';

interface IActivityMetadata {
  dataType: 'ArenaMatchMetadata' | 'ShuffleMatchMetadata' | 'BattlegroundMetadata';
  wowVersion: WowVersion;
  id: string;
  timezone: string;
  startTime: number;
  endTime: number;
}

interface IArenaCombatMetadata extends IActivityMetadata {
  startInfo: ArenaMatchStartInfo;
  endInfo: ArenaMatchEndInfo;
  playerId: string;
  playerTeamId: string;
  result: CombatResult;
  winningTeamId: string;
  durationInSeconds: number;
}

export type BattlegroundMetadata = IActivityMetadata;

export interface ArenaMatchMetadata extends IArenaCombatMetadata {
  dataType: 'ArenaMatchMetadata';
}

export interface ShuffleMatchMetadata extends IArenaCombatMetadata {
  dataType: 'ShuffleMatchMetadata';
  roundStarts: {
    id: string;
    startInfo: ArenaMatchStartInfo;
    sequenceNumber: number;
  }[];
}

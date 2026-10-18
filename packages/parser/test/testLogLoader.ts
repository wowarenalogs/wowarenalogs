import fs from 'fs';
import path from 'path';

import { WoWCombatLogParser } from '../src';
import {
  IActivityStarted,
  IArenaMatch,
  IBattlegroundCombat,
  IMalformedCombatData,
  IShuffleMatch,
  IShuffleRound,
} from '../src/CombatData';

export type LoaderResults = {
  combats: IArenaMatch[];
  malformedCombats: IMalformedCombatData[];
  shuffleRounds: IShuffleRound[];
  shuffles: IShuffleMatch[];
  activityStarts?: IActivityStarted[];
  battlegrounds?: IBattlegroundCombat[];
};

export const readLogFileLines = (logFileName: string): string[] =>
  fs
    .readFileSync(path.join(__dirname, 'testlogs', logFileName))
    .toString()
    .split('\n');

export const loadLogFile = (logFileName: string): LoaderResults => loadLogLines(readLogFileLines(logFileName));

export const loadLogLines = (lines: string[]): LoaderResults => {
  const logParser = new WoWCombatLogParser(null, 'America/New_York');

  const combats: IArenaMatch[] = [];
  const malformedCombats: IMalformedCombatData[] = [];

  const shuffleRounds: IShuffleRound[] = [];
  const shuffles: IShuffleMatch[] = [];

  const activityStarts: IActivityStarted[] = [];
  const battlegrounds: IBattlegroundCombat[] = [];

  logParser.on('arena_match_ended', (data) => {
    combats.push(data);
  });

  logParser.on('malformed_arena_match_detected', (data) => {
    malformedCombats.push(data);
  });

  logParser.on('solo_shuffle_round_ended', (data) => {
    shuffleRounds.push(data);
  });

  logParser.on('solo_shuffle_ended', (data) => {
    shuffles.push(data);
  });

  logParser.on('activity_started', (data) => {
    activityStarts.push(data);
  });

  logParser.on('battleground_ended', (data) => battlegrounds.push(data));

  lines.forEach((line) => {
    logParser.parseLine(line);
  });

  logParser.flush();

  return { combats, malformedCombats, shuffleRounds, shuffles, activityStarts, battlegrounds };
};

// Log timestamps look like "8/27/2025 22:13:22.724-4  UNIT_DIED,...". Shifting one lets a test
// place a synthetic event at a chosen offset from a real one.
export const shiftLogLineTimestamp = (line: string, offsetMs: number): string =>
  line.replace(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/, (_full, h, m, s, ms) => {
    const shifted = (+h * 3600 + +m * 60 + +s) * 1000 + +ms + offsetMs;
    const pad = (n: number, width = 2) => Math.floor(n).toString().padStart(width, '0');
    return `${pad(shifted / 3600000)}:${pad((shifted % 3600000) / 60000)}:${pad((shifted % 60000) / 1000)}.${pad(
      shifted % 1000,
      3,
    )}`;
  });

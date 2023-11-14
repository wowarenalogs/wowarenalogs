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

export const loadLogFile = (logFileName: string): LoaderResults => {
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

  const buffer = fs.readFileSync(path.join(__dirname, 'testlogs', logFileName));
  buffer
    .toString()
    .split('\n')
    .forEach((line) => {
      logParser.parseLine(line);
    });

  logParser.flush();

  return { combats, malformedCombats, shuffleRounds, shuffles, activityStarts, battlegrounds };
};

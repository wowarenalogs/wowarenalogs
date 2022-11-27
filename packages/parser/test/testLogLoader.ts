import fs from 'fs';
import path from 'path';

import { WoWCombatLogParser } from '../src';
import { IMalformedCombatData, IShuffleRound, IShuffleMatch, IArenaMatch } from '../src/CombatData';

export type LoaderResults = {
  combats: IArenaMatch[];
  malformedCombats: IMalformedCombatData[];
  shuffleRounds: IShuffleRound[];
  shuffles: IShuffleMatch[];
};

export const loadLogFile = (logFileName: string): LoaderResults => {
  const logParser = new WoWCombatLogParser(null, 'America/New_York');

  const combats: IArenaMatch[] = [];
  const malformedCombats: IMalformedCombatData[] = [];

  const shuffleRounds: IShuffleRound[] = [];
  const shuffles: IShuffleMatch[] = [];

  logParser.on('arena_match_ended', (data) => {
    const combat = data as IArenaMatch;
    combats.push(combat);
  });

  logParser.on('malformed_arena_match_detected', (data) => {
    const combat = data as IMalformedCombatData;
    malformedCombats.push(combat);
  });

  logParser.on('solo_shuffle_round_ended', (data) => {
    const combat = data as IShuffleRound;
    shuffleRounds.push(combat);
  });

  logParser.on('solo_shuffle_ended', (data) => {
    const combat = data as IShuffleMatch;
    shuffles.push(combat);
  });

  const buffer = fs.readFileSync(path.join(__dirname, 'testlogs', logFileName));
  buffer
    .toString()
    .split('\n')
    .forEach((line) => {
      logParser.parseLine(line);
    });

  logParser.flush();

  return { combats, malformedCombats, shuffleRounds, shuffles };
};

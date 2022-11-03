import fs from 'fs';
import path from 'path';

import { ICombatData, WoWCombatLogParser } from '../src';
import { IMalformedCombatData, IShuffleRoundData, IShuffleCombatData } from '../src/CombatData';

export type LoaderResults = {
  combats: ICombatData[];
  malformedCombats: IMalformedCombatData[];
  shuffleRounds: IShuffleRoundData[];
  shuffles: IShuffleCombatData[];
};

export const loadLogFile = (logFileName: string): LoaderResults => {
  const logParser = new WoWCombatLogParser();

  const combats: ICombatData[] = [];
  const malformedCombats: IMalformedCombatData[] = [];

  const shuffleRounds: IShuffleRoundData[] = [];
  const shuffles: IShuffleCombatData[] = [];

  logParser.on('arena_match_ended', (data) => {
    const combat = data as ICombatData;
    combats.push(combat);
  });

  logParser.on('malformed_arena_match_detected', (data) => {
    const combat = data as IMalformedCombatData;
    malformedCombats.push(combat);
  });

  logParser.on('solo_shuffle_round_ended', (data) => {
    console.log('Loader SHUFFLE ROUND ENDED');
    const combat = data as IShuffleRoundData;
    shuffleRounds.push(combat);
  });

  logParser.on('solo_shuffle_ended', (data) => {
    const combat = data as IShuffleCombatData;
    shuffles.push(combat);
  });

  const buffer = fs.readFileSync(path.join(__dirname, 'logs', logFileName));
  buffer
    .toString()
    .split('\n')
    .forEach((line) => {
      logParser.parseLine(line);
    });

  logParser.flush();

  return { combats, malformedCombats, shuffleRounds, shuffles };
};

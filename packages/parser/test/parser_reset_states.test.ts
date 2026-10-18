import fs from 'fs';
import path from 'path';

import { WoWCombatLogParser } from '../src';
import { IArenaMatch, IMalformedCombatData } from '../src/CombatData';

// The desktop app calls resetParserStates when it starts reading a new combat log file, which is
// what happens after the game is closed mid-match and reopened. Whatever the pipeline had
// buffered for the abandoned match has to go with it.
describe('WoWCombatLogParser.resetParserStates', () => {
  const readFixture = (name: string): string[] =>
    fs
      .readFileSync(path.join(__dirname, 'testlogs', name))
      .toString()
      .split('\n');

  const parseWith = (feed: (parser: WoWCombatLogParser) => void) => {
    const parser = new WoWCombatLogParser(null, 'America/New_York');
    const combats: IArenaMatch[] = [];
    const malformedCombats: IMalformedCombatData[] = [];

    parser.on('arena_match_ended', (data) => combats.push(data));
    parser.on('malformed_arena_match_detected', (data) => malformedCombats.push(data));

    feed(parser);
    parser.flush();

    return { combats, malformedCombats };
  };

  it('should discard a match left half-parsed when the log file changes', () => {
    const lines = readFixture('hunter_priest_match.txt');
    // The game is closed partway through: no ARENA_MATCH_END, nothing to close the segment.
    const abandoned = lines.slice(0, Math.floor(lines.length / 2));

    const { combats, malformedCombats } = parseWith((parser) => {
      abandoned.forEach((line) => parser.parseLine(line));

      // What the app does on seeing a new combat log file.
      parser.resetParserStates('retail');

      lines.forEach((line) => parser.parseLine(line));
    });

    // Only the complete match is reported, and the abandoned half is not surfaced as a
    // malformed match - it belonged to a log file we are no longer reading.
    expect(combats).toHaveLength(1);
    expect(malformedCombats).toHaveLength(0);
  });

  it('should leave the parser usable when it had no pipeline yet', () => {
    const lines = readFixture('hunter_priest_match.txt');

    const { combats } = parseWith((parser) => {
      parser.resetParserStates('retail');
      lines.forEach((line) => parser.parseLine(line));
    });

    expect(combats).toHaveLength(1);
  });
});

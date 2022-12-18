import { IArenaMatch, IShuffleMatch, WoWCombatLogParser, WowVersion } from '../../parser/dist/index';

type ParseResult = {
  arenaMatches: IArenaMatch[];
  shuffleMatches: IShuffleMatch[];
};

export function parseFromStringArrayAsync(
  buffer: string[],
  wowVersion: WowVersion,
  timezone?: string,
): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const logParser = new WoWCombatLogParser(wowVersion, timezone);

    const results: ParseResult = {
      arenaMatches: [],
      shuffleMatches: [],
    };

    try {
      logParser.on('arena_match_ended', (data: IArenaMatch) => {
        results.arenaMatches.push(data);
      });

      logParser.on('solo_shuffle_ended', (data: IShuffleMatch) => {
        results.shuffleMatches.push(data);
      });

      for (const line of buffer) {
        logParser.parseLine(line);
      }
      logParser.flush();
    } catch (e) {
      reject(e);
    }

    resolve(results);
  });
}

export const ARENA_PREPARATION_SPELL_ID = '32727';

// A draw means both teams lost a player together. Across 19 real matches ARENA_MATCH_END
// landed 0.016-0.966s after the deciding kill.
export const SHUFFLE_DRAW_WINDOW_MS = 1000;

// Solo shuffle keeps the same six players throughout, but a reload can leave a round showing
// fewer, so only compare complete rosters.
export const SHUFFLE_ROSTER_SIZE = 6;

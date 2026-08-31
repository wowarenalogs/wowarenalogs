// "Arena Preparation" (spell 32727) is applied to every player during each round's prep
// phase, behind the gates, and removed the moment the gates open (same millisecond as
// ARENA_MATCH_START). Its re-application after a round-ending kill is the game's in-log
// signal that the previous round is truly over, arriving several seconds before the next
// round's ARENA_MATCH_START. Shared between the segmenter (which cuts a finished round on
// it) and the decoder (which uses it as the draw-detection boundary).
export const ARENA_PREPARATION_SPELL_ID = '32727';

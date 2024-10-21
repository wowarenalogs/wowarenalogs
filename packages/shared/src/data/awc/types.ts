export interface AWCMetadata {
  id: number;
  title: string;
  slug: string;
  requireTeamCheckin: boolean;
  autoSelfScoreEnabled: boolean;
  showSeeds: boolean;
  format: string;
  deathPenaltySeconds: number;
  bracketTooltipHtml: string;
  bracketEndsDate: string;
  bracketStartsDate: string;
  segments: Segments;
  roundsInBracket: RoundsInBracket;
  startAtRoundCount: number;
  stopAtRoundCount: number;
  dungeons: DungeonContext[];
  rulesetSeasonSlug: string;
  rulesetType: string;
  rulesetRealmType: string;
  rulesetRestrictsSpecs: boolean;
  rulesetScoringAlgorithm: string;
  rulesetTimedRunsOnly: boolean;
  rulesetMinRequiredRuns: number;
  rulesetQualifyByStartTime: boolean;
  requiresRegistration: boolean;
}

export interface RoundsInBracket {
  upper: number;
  lower: number;
}

export interface Segments {
  upper: SegmentBracket;
  lower: SegmentBracket;
}

export interface SegmentBracket {
  rounds: Rounds;
}

export type Rounds = Record<string, RoundItem[]>;

export interface RoundItem {
  id: number;
  firstTeamStatus: string;
  secondTeamStatus: string;
  round: number;
  bonusRounds: number;
  match: number;
  status: string;
  position: string;
  winnerTeamId: number;
  backgroundColor: string;
  borderColor: string;
  gracePeriodEndsAt: string;
  updatedAt: string;
  secondTeam: Team;
  firstTeam: Team;
  games: Game[];
}

export interface Game {
  id: number;
  gameOrder: number;
  status: string;
  matchId: number;
  videoId: string;
  videoType: string;
  videoTimestamp?: number | null;
  gameType: string;
  splitsType: string;
  winnerTeamId?: number | null;
  bracketDungeonId?: number | null;
  dungeon?: Dungeon | null;
  syncRosterType: string;
  syncRosterValue?: string | null;
  firstTeamRoster?: TeamRoster[] | null;
  secondTeamRoster?: TeamRoster[] | null;
  details: Details;
  updatedAt: string;
}

export interface Details {
  dampening?: number | null;
  duration?: string | null;
}

export interface DungeonContext {
  id: number;
  dungeon: Dungeon;
}

export interface Dungeon {
  type: string;
  id: number;
  name: string;
  short_name: string;
  wowInstanceId: number;
  slug: string;
  expansion_id: number;
  icon_url: string;
  patch: string;
}

export interface Team {
  id: number;
  seed: number;
  charter_id: number;
  group_id: number;
  group_type: number;
  platoon_id: number;
  status: string;
  name: string;
  slug: string;
  faction: string;
  icon_logo_url: string | null;
  namespace: string;
  isMythicPlusTeam: boolean;
  teamEventProfileUrl: string;
}

export interface TeamRoster {
  name: string;
  class: string;
  spec: string;
  role: string;
  raceId: number;
  genderId: number;
}

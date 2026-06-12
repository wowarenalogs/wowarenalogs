import crypto from 'crypto';

import {
  AtomicArenaCombat,
  CombatantInfo,
  CombatResult,
  CombatUnitType,
  getEffectiveCombatDuration,
  getEffectiveDps,
  getEffectiveHps,
  IArenaMatch,
  ICombatUnit,
  IShuffleMatch,
  WowVersion,
} from '../../parser/dist/index';
import { realmIdToRegion } from '../../shared/src/utils/realms';

const WEBHOOK_PAYLOAD_VERSION = 1;
const WEBHOOK_DEFAULT_TIMEOUT_MS = 10000;

export type WebhookCombatantStats = {
  strength: number;
  agility: number;
  stamina: number;
  intellect: number;
  armor: number;
  dodge: number;
  parry: number;
  block: number;
  critMelee: number;
  critRanged: number;
  critSpell: number;
  mastery: number;
  hasteMelee: number;
  hasteRanged: number;
  hasteSpell: number;
  versatilityDamageDone: number;
  versatilityHealingDone: number;
  versatilityDamageTaken: number;
  leech: number;
  avoidance: number;
  speed: number;
};

export type WebhookCombatant = {
  id: string;
  realmId: number | undefined;
  name: string;
  specId: string | undefined;
  classId: number | undefined;
  teamId: string | undefined;
  dps: number;
  hps: number;
  deaths: number;
  itemLevel: number | undefined;
  personalRating: number | undefined;
  highestPvpTier: number | undefined;
  stats: WebhookCombatantStats | undefined;
  talents: ({ id1: number; id2: number; count: number } | null)[] | undefined;
  pvpTalents: string[] | undefined;
  equipment: { id: string; ilvl: number }[] | undefined;
};

export type WebhookStub = {
  version: number;
  dataType: 'ArenaMatch' | 'ShuffleMatch';
  id: string;
  wowVersion: WowVersion;
  link: string | string[]; // string for match, string[] for shuffle
  startInfo: {
    timestamp: number;
    zoneId: string;
    bracket: string;
    isRanked: boolean;
  };
  endInfo: {
    winningTeamId: string;
    timestamp: number;
    matchDurationInSeconds: number;
    team0MMR: number;
    team1MMR: number;
  };
  playerId: string;
  playerTeamId: string;
  region: string; // 'us' | 'eu' | 'tw' | 'kr' | 'def' — uploading player's region
  playerTeamRating: number | undefined;
  hasAdvancedLogging: boolean; // false → stats/talents/equipment may be missing

  result: CombatResult; // 0=Unknown 1=DrawGame 2=Lose 3=Win; See: parser type CombatResult
  resultName: string; // lowercased CombatResult name, e.g. "win"
  combatants: WebhookCombatant[];

  // Shuffle only
  roundResults?: number[] | undefined;
};

type WebhookStubBase = Pick<
  WebhookStub,
  | 'version'
  | 'dataType'
  | 'id'
  | 'wowVersion'
  | 'result'
  | 'resultName'
  | 'startInfo'
  | 'endInfo'
  | 'hasAdvancedLogging'
  | 'playerTeamRating'
>;

export type WebhookOutcome = 'delivered' | 'skipped' | 'failed_permanent' | 'failed_transient';

const getWebhookUrl = (): string | undefined => {
  const url = process.env.ENV_WEBHOOK_URL;
  return !url || url === 'disabled' ? undefined : url;
};

// Structured log line — Cloud Logging parses JSON stdout into structured entries.
export const logWebhookEvent = (fields: Record<string, unknown>) => {
  console.log(JSON.stringify(fields));
};

// Player GUIDs are `Player-<realmId>-<hex>`; undefined for any malformed id.
const parseRealmId = (guid: string): number | undefined => {
  const parts = guid.split('-');
  if (parts[0] !== 'Player' || parts.length < 3) {
    return undefined;
  }
  const realmId = Number(parts[1]);
  return Number.isInteger(realmId) ? realmId : undefined;
};

const playerRegion = (playerId: string): string => {
  const realmId = parseRealmId(playerId);
  return realmId === undefined ? 'def' : realmIdToRegion(realmId);
};

const avgItemLevel = (info: CombatantInfo | undefined): number | undefined => {
  const ilvls = info?.equipment?.map((e) => e.ilvl).filter((v) => v > 0) ?? [];
  if (ilvls.length === 0) return undefined;
  return Math.round(ilvls.reduce((a, b) => a + b, 0) / ilvls.length);
};

// Partner-facing rename: parser uses `intelligence` (full word), `lifesteal`, and a
// `versatilityDamgeDone` typo. The webhook uses WoW UI terms with the typo fixed.
const mapStats = (info: CombatantInfo | undefined): WebhookCombatantStats | undefined =>
  info
    ? {
        strength: info.strength,
        agility: info.agility,
        stamina: info.stamina,
        intellect: info.intelligence,
        armor: info.armor,
        dodge: info.dodge,
        parry: info.parry,
        block: info.block,
        critMelee: info.critMelee,
        critRanged: info.critRanged,
        critSpell: info.critSpell,
        mastery: info.mastery,
        hasteMelee: info.hasteMelee,
        hasteRanged: info.hasteRanged,
        hasteSpell: info.hasteSpell,
        versatilityDamageDone: info.versatilityDamgeDone,
        versatilityHealingDone: info.versatilityHealingDone,
        versatilityDamageTaken: info.versatilityDamageTaken,
        leech: info.lifesteal,
        avoidance: info.avoidance,
        speed: info.speed,
      }
    : undefined;

const mapCombatants = (units: Record<string, ICombatUnit>, effectiveDuration: number): WebhookCombatant[] => {
  const safeDuration = Math.max(effectiveDuration, 1);
  return Object.values(units)
    .filter((u) => u.type === CombatUnitType.Player)
    .map((c) => ({
      id: c.id,
      realmId: parseRealmId(c.id),
      name: c.name,
      specId: c.info?.specId,
      classId: c.class,
      teamId: c.info?.teamId,
      dps: Math.round(getEffectiveDps([c], safeDuration)),
      hps: Math.round(getEffectiveHps([c], safeDuration)),
      deaths: c.deathRecords.length,
      itemLevel: avgItemLevel(c.info),
      personalRating: c.info?.personalRating,
      highestPvpTier: c.info?.highestPvpTier,
      stats: mapStats(c.info),
      talents: c.info?.talents,
      pvpTalents: c.info?.pvpTalents,
      equipment: c.info?.equipment,
    }));
};

// `atomic` is the IArenaCombat to source per-round flags from: the match itself for
// arena, rounds[0] for shuffle.
const buildStubBase = (match: IArenaMatch | IShuffleMatch, atomic: AtomicArenaCombat): WebhookStubBase => ({
  version: WEBHOOK_PAYLOAD_VERSION,
  dataType: match.dataType,
  id: match.id,
  wowVersion: match.wowVersion,
  result: match.result,
  resultName: (CombatResult[match.result] ?? 'unknown').toLowerCase(),
  hasAdvancedLogging: atomic.hasAdvancedLogging,
  playerTeamRating: atomic.playerTeamRating,
  startInfo: {
    timestamp: match.startInfo.timestamp,
    zoneId: match.startInfo.zoneId,
    bracket: match.startInfo.bracket,
    isRanked: match.startInfo.isRanked,
  },
  endInfo: {
    winningTeamId: match.endInfo.winningTeamId,
    timestamp: match.endInfo.timestamp,
    matchDurationInSeconds: match.endInfo.matchDurationInSeconds,
    team0MMR: match.endInfo.team0MMR,
    team1MMR: match.endInfo.team1MMR,
  },
});

export const createWebhookStubFromArenaMatch = (match: IArenaMatch): WebhookStub => {
  const effectiveDuration = getEffectiveCombatDuration(match);
  return {
    ...buildStubBase(match, match),
    playerId: match.playerId,
    playerTeamId: match.playerTeamId,
    region: playerRegion(match.playerId),
    link: `https://wowarenalogs.com/match?id=${match.id}&viewerIsOwner=false&source=webhook`,
    combatants: mapCombatants(match.units, effectiveDuration),
  };
};

export const createWebhookStubFromShuffleMatch = (match: IShuffleMatch): WebhookStub => {
  // For shuffle, all per-round data (combatants, dps/hps, advanced-logging flag) is
  // taken from round 1; see WEBHOOKS.md.
  const round0 = match.rounds[0];
  const effectiveDuration = getEffectiveCombatDuration(round0);
  return {
    ...buildStubBase(match, round0),
    playerId: round0.playerId,
    playerTeamId: round0.playerTeamId,
    region: playerRegion(round0.playerId),
    link: match.rounds.map(
      (_r, idx) =>
        `https://wowarenalogs.com/match?id=${match.id}&viewerIsOwner=false&source=webhook&roundId=${idx + 1}`,
    ),
    roundResults: match.rounds.map((r) => r.result),
    combatants: mapCombatants(round0.units, effectiveDuration),
  };
};

// Never throws — returns an outcome the caller maps to ack/retry; retry itself
// happens at the Pub/Sub layer.
export const sendWebhookAsync = async (stub: WebhookStub): Promise<WebhookOutcome> => {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    return 'skipped';
  }

  const secret = process.env.ENV_WEBHOOK_SECRET;
  const timeoutMs = Number(process.env.ENV_WEBHOOK_TIMEOUT_MS) || WEBHOOK_DEFAULT_TIMEOUT_MS;

  const body = JSON.stringify(stub);

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-idempotency-key': stub.id,
  };

  if (secret) {
    // HMAC-SHA256 over the raw request body; the partner recomputes over the bytes
    // it receives and compares in constant time. See WEBHOOKS.md.
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
    headers['x-signature'] = `sha256=${signature}`;
  } else {
    logWebhookEvent({
      event: 'webhook_unsigned',
      level: 'warning',
      dataType: stub.dataType,
      matchId: stub.id,
      message: 'ENV_WEBHOOK_SECRET is not set; sending unsigned webhook',
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      body,
      headers,
      signal: controller.signal,
    });
    if (response.ok) {
      logWebhookEvent({
        event: 'webhook_delivered',
        dataType: stub.dataType,
        matchId: stub.id,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return 'delivered';
    }
    // 5xx/429/408 are worth retrying; other 4xx will fail identically forever.
    const transient = response.status >= 500 || response.status === 429 || response.status === 408;
    logWebhookEvent({
      event: 'webhook_failed',
      level: 'error',
      dataType: stub.dataType,
      matchId: stub.id,
      status: response.status,
      durationMs: Date.now() - startedAt,
      error: `HTTP ${response.status}`,
      permanent: !transient,
    });
    return transient ? 'failed_transient' : 'failed_permanent';
  } catch (e) {
    logWebhookEvent({
      event: 'webhook_failed',
      level: 'error',
      dataType: stub.dataType,
      matchId: stub.id,
      durationMs: Date.now() - startedAt,
      error: e instanceof Error ? e.message : String(e),
    });
    return 'failed_transient';
  } finally {
    clearTimeout(timer);
  }
};

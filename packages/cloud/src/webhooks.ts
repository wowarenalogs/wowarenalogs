import crypto from 'crypto';

import { CombatResult, CombatUnitType, IArenaMatch, ICombatUnit, IShuffleMatch } from '../../parser/dist/index';

const WEBHOOK_PAYLOAD_VERSION = 1;
const WEBHOOK_DEFAULT_TIMEOUT_MS = 10000;

export type WebhookStub = {
  version: number;
  dataType: 'ArenaMatch' | 'ShuffleMatch';
  id: string;
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
  result: CombatResult; // 0=Unknown 1=DrawGame 2=Lose 3=Win; See: parser type CombatResult
  combatants: {
    id: string;
    name: string;
    specId: string | undefined;
    classId: number | undefined;
    teamId: string | undefined;
  }[];

  // Shuffle only
  roundResults?: number[] | undefined;
};

type WebhookStubBase = Pick<WebhookStub, 'version' | 'dataType' | 'id' | 'result' | 'startInfo' | 'endInfo'>;

// 'failed_transient' should be retried; 'failed_permanent' (4xx) should not.
export type WebhookOutcome = 'delivered' | 'skipped' | 'failed_permanent' | 'failed_transient';

// Webhook target URL, or undefined when delivery is disabled (env unset or 'disabled').
const getWebhookUrl = (): string | undefined => {
  const url = process.env.ENV_WEBHOOK_URL;
  return !url || url === 'disabled' ? undefined : url;
};

// Structured log line — Cloud Logging parses JSON stdout into structured entries.
export const logWebhookEvent = (fields: Record<string, unknown>) => {
  console.log(JSON.stringify(fields));
};

const mapCombatants = (units: Record<string, ICombatUnit>) =>
  Object.values(units)
    .filter((u) => u.type === CombatUnitType.Player)
    .map((c) => ({
      id: c.id,
      name: c.name,
      specId: c.info?.specId,
      classId: c.class,
      teamId: c.info?.teamId,
    }));

const buildStubBase = (match: IArenaMatch | IShuffleMatch): WebhookStubBase => ({
  version: WEBHOOK_PAYLOAD_VERSION,
  dataType: match.dataType,
  id: match.id,
  result: match.result,
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

export const createWebhookStubFromArenaMatch = (match: IArenaMatch): WebhookStub => ({
  ...buildStubBase(match),
  playerId: match.playerId,
  playerTeamId: match.playerTeamId,
  link: `https://wowarenalogs.com/match?id=${match.id}&viewerIsOwner=false&source=webhook`,
  combatants: mapCombatants(match.units),
});

export const createWebhookStubFromShuffleMatch = (match: IShuffleMatch): WebhookStub => ({
  ...buildStubBase(match),
  playerId: match.rounds[0].playerId,
  playerTeamId: match.rounds[0].playerTeamId,
  link: match.rounds.map(
    (_r, idx) => `https://wowarenalogs.com/match?id=${match.id}&viewerIsOwner=false&source=webhook&roundId=${idx + 1}`,
  ),
  roundResults: match.rounds.map((r) => r.result),
  // combatants (and their teamId) are taken from round 1; see WEBHOOKS.md.
  combatants: mapCombatants(match.rounds[0].units),
});

// Delivers a match summary to the partner webhook. Never throws — returns an
// outcome the caller maps to ack/retry. Retry itself happens at the Pub/Sub layer.
export const sendWebhookAsync = async (stub: WebhookStub): Promise<WebhookOutcome> => {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    return 'skipped';
  }

  const secret = process.env.ENV_WEBHOOK_SECRET;
  const timeoutMs = Number(process.env.ENV_WEBHOOK_TIMEOUT_MS) || WEBHOOK_DEFAULT_TIMEOUT_MS;

  const body = JSON.stringify(stub);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-idempotency-key': stub.id,
  };

  if (secret) {
    // HMAC-SHA256 over `${timestamp}.${body}` — partner recomputes over the raw body.
    const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    headers['x-webhook-timestamp'] = timestamp;
    headers['x-webhook-signature'] = `sha256=${signature}`;
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

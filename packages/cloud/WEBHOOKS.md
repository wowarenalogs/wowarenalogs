# Partner Webhooks

After a match finishes processing, WoW Arena Logs POSTs a trimmed match summary to
a configured partner endpoint. Delivery is decoupled: `writeMatchStub` publishes
the summary to a Pub/Sub topic and the `deliverWebhook` function does the POST, so
partner latency never blocks match processing.

## When it fires

One webhook per match, **after** the match stub is written to Firestore, for:

- **Ranked arena** matches (`startInfo.isRanked === true`)
- **Rated Solo Shuffle** matches (`startInfo.bracket === 'Rated Solo Shuffle'`)

## Delivery semantics

- **Asynchronous** — published to Pub/Sub, delivered by a separate function.
- **At-least-once with retry** — Pub/Sub redelivers failed attempts with backoff:
  - `2xx` → success.
  - `5xx`, `429`, `408`, timeout or network error → transient; retried.
  - other `4xx` → permanent; **not** retried (acked, logged as an error).
  - after ~50 failed attempts the message is dead-lettered to `partner-webhook-dlq`.
- **Duplicates are expected** — retries (and at-least-once delivery) mean the same
  match may arrive more than once. **Deduplicate on `x-idempotency-key`** (equals
  the payload `id`); it is stable across attempts, while `x-webhook-timestamp` and
  `x-webhook-signature` are recomputed per attempt.
- **Timeout** — each POST is aborted after ~10s (`ENV_WEBHOOK_TIMEOUT_MS`,
  default `10000`).

## Request

`POST` to the configured URL with these headers:

| Header                | Value                                                      |
| --------------------- | ---------------------------------------------------------- |
| `content-type`        | `application/json`                                         |
| `x-idempotency-key`   | The match `id` — use this to dedupe re-deliveries.         |
| `x-webhook-timestamp` | Unix epoch seconds when the request was signed.            |
| `x-webhook-signature` | `sha256=<hex>` HMAC of the request (see below).            |

`x-webhook-timestamp` and `x-webhook-signature` are present only when
`ENV_WEBHOOK_SECRET` is configured; an unsigned delivery is logged as a warning
on our side.

## Payload

```jsonc
{
  "version": 1,                       // payload schema version; branch on this
  "dataType": "ArenaMatch",           // "ArenaMatch" | "ShuffleMatch"
  "id": "string",                     // match id (also the idempotency key)
  "link": "https://wowarenalogs.com/match?id=...",  // string; string[] for shuffle (one per round)
  "startInfo": {
    "timestamp": 0,                   // epoch ms
    "zoneId": "string",
    "bracket": "string",              // e.g. "2v2", "3v3", "Rated Solo Shuffle"
    "isRanked": true
  },
  "endInfo": {
    "winningTeamId": "string",
    "timestamp": 0,                   // epoch ms
    "matchDurationInSeconds": 0,
    "team0MMR": 0,
    "team1MMR": 0
  },
  "playerId": "string",               // the uploading player
  "playerTeamId": "string",
  "result": 3,                        // 0=Unknown 1=DrawGame 2=Lose 3=Win
  "combatants": [
    {
      "id": "string",                 // WoW player GUID, "Player-<realmId>-<hex>"
      "realmId": 0,                    // parsed from id; null if the GUID is malformed
      "name": "string",
      "specId": "string",
      "classId": 0,
      "teamId": "string"
    }
  ],
  "roundResults": [3, 2, 3, 2, 3, 2]  // shuffle only — per-round result codes
}
```

Note: for **shuffle**, `combatants` (and each `combatants[].teamId`) is taken from
**round 1** only — teams are re-drawn each round, so `teamId` is not stable across
the match.

## Verifying the signature

The signature is an HMAC-SHA256 over `` `${timestamp}.${rawBody}` `` keyed with the
shared secret. Recompute it over the **raw request body** (before any JSON
re-serialization) and compare in constant time. Reject requests whose
`x-webhook-timestamp` is too old to limit replay.

```js
const crypto = require('crypto');

function verify(rawBody, headers, secret) {
  const timestamp = headers['x-webhook-timestamp'];
  const signature = headers['x-webhook-signature']; // "sha256=<hex>"
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const a = Buffer.from(signature || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  // reject stale requests (e.g. older than 5 minutes)
  return Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
}
```

## Configuration (deployer)

One-time per GCP project, run `deploy/setup_webhook_pubsub.sh <project-id>` to
create the `partner-webhook-event` / `partner-webhook-dlq` topics and IAM bindings.

Set these in the deploying shell environment; the deploy scripts pass them to the
Cloud Functions.

`writeMatchStub` (publisher):

| Env var             | Notes                                                    |
| ------------------- | -------------------------------------------------------- |
| `ENV_WEBHOOK_TOPIC` | Pub/Sub topic to publish to. Unset → webhooks disabled.  |

`deliverWebhook` (delivery):

| Env var                  | Notes                                                  |
| ------------------------ | ------------------------------------------------------ |
| `ENV_WEBHOOK_URL`        | Partner endpoint. Unset or `disabled` → no POST.       |
| `ENV_WEBHOOK_URL_DEV`    | Dev endpoint — `deploy_dev.sh` maps it to `ENV_WEBHOOK_URL` so test matches don't reach a partner's prod. |
| `ENV_WEBHOOK_SECRET`     | HMAC signing secret. Unset → unsigned delivery.        |
| `ENV_WEBHOOK_TIMEOUT_MS` | Per-request timeout in ms; optional, default `10000`.  |

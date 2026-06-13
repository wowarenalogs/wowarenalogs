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
  - a message that never succeeds is retried until Pub/Sub's retention window
    elapses, then dropped.
- **Duplicates are expected** — retries (and at-least-once delivery) mean the same
  match may arrive more than once. **Deduplicate on `x-idempotency-key`** (equals
  the payload `id`); it is stable across attempts.
- **Timeout** — each POST is aborted after ~10s (`ENV_WEBHOOK_TIMEOUT_MS`,
  default `10000`).

## Request

`POST` to the configured URL with these headers:

| Header              | Value                                                      |
| ------------------- | ---------------------------------------------------------- |
| `content-type`      | `application/json`                                         |
| `x-idempotency-key` | The match `id` — use this to dedupe re-deliveries.         |
| `x-signature`       | `sha256=<hex>` HMAC-SHA256 of the raw body (see below).    |

`x-signature` is present only when `ENV_WEBHOOK_SECRET` is configured; an unsigned
delivery is logged as a warning on our side.

## Payload

```jsonc
{
  "version": 2,                       // payload schema version; branch on this
  "dataType": "ArenaMatch",           // "ArenaMatch" | "ShuffleMatch"
  "id": "string",                     // match id (also the idempotency key)
  "wowVersion": "retail",             // "retail" | "classic"
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
  "region": "us",                     // 'us' | 'eu' | 'tw' | 'kr' | 'def' — uploading player's region
  "playerTeamRating": 1850,           // ARENA_MATCH_END team rating; null if not reported
  "hasAdvancedLogging": true,         // false → CombatantInfo-derived fields below may be missing
  "result": 3,                        // 0=Unknown 1=DrawGame 2=Lose 3=Win
  "resultName": "win",                // lowercased CombatResult name
  "combatants": [
    {
      "id": "string",                 // WoW player GUID, "Player-<realmId>-<hex>"
      "realmId": 0,                   // parsed from id; null if the GUID is malformed
      "name": "string",
      "specId": "string",
      "classId": 0,
      "teamId": "string",

      // Derived from the player's events in this match (round 1 for shuffle).
      "dps": 0,                       // effective damage / effective duration, rounded
      "hps": 0,                       // effective healing+absorbs / effective duration, rounded
      "deaths": 0,

      // From COMBATANT_INFO — these keys are OMITTED FROM THE JSON (not null)
      // when hasAdvancedLogging=false or COMBATANT_INFO is missing for this unit.
      "itemLevel": 0,                 // average equipped ilvl
      "personalRating": 0,
      "highestPvpTier": 0,
      "stats": {
        "strength": 0, "agility": 0, "stamina": 0, "intellect": 0, "armor": 0,
        "dodge": 0, "parry": 0, "block": 0,
        "critMelee": 0, "critRanged": 0, "critSpell": 0,
        "mastery": 0,
        "hasteMelee": 0, "hasteRanged": 0, "hasteSpell": 0,
        "versatilityDamageDone": 0, "versatilityHealingDone": 0, "versatilityDamageTaken": 0,
        "leech": 0, "avoidance": 0, "speed": 0
      },
      "talents": [{ "id1": 0, "id2": 0, "count": 0 }],   // raw talent loadout; may contain nulls
      "pvpTalents": ["string"],
      "equipment": [{ "id": "string", "ilvl": 0 }]
    }
  ],
  "roundResults": [3, 2, 3, 2, 3, 2], // shuffle only — per-round result codes

  // --- shuffle only, added in version 2 ---
  "rounds": [                         // 6 entries, sequenceNumber 0..5
    {
      "id": "string",                 // round content hash (rounds[5].id === top-level id)
      "sequenceNumber": 0,            // 0..5
      "startTimestamp": 0,            // epoch ms (NOTE: not "startTime")
      "endTimestamp": 0,              // epoch ms (NOTE: not "endTime")
      "durationInSeconds": 0,
      "winningTeamId": "string",
      "killedUnitId": "string",       // GUID of the unit whose death ended the round; null if empty
      "result": 3,                    // CombatResult, uploader perspective
      "combatants": [                 // 6 LIGHT per-round combatants (no stats/talents/equipment)
        {
          "id": "string",
          "name": "string",
          "specId": "string",
          "teamId": "string",         // THIS round's team (re-drawn each round)
          "dps": 0,
          "hps": 0,
          "deaths": 0
        }
      ]
    }
  ],
  "scoreboard": [                     // shuffle only — 6 entries, per-player LOBBY-TOTAL wins (0..6)
    { "unitId": "string", "wins": 0 }
  ]
}
```

Note: for **shuffle**, the top-level `combatants` (and each `combatants[].teamId`, `dps`,
`hps`, `deaths`, `hasAdvancedLogging`, `playerTeamRating`) is still taken from **round 1**
only — teams are re-drawn each round, so the top-level `teamId` is not stable across the
match. As of **version 2**, full per-round detail ships in `rounds[]` (with light per-round
`combatants` carrying this round's `teamId`) and per-player lobby totals in `scoreboard[]`;
the per-round combatants are intentionally light (no stats/talents/equipment). Arena payloads
do not include `rounds`/`scoreboard`.

## Verifying the signature

The signature is an HMAC-SHA256 over the **raw request body** keyed with the shared
secret. Recompute it over the raw body bytes (before any JSON re-serialization) and
compare in constant time.

```js
const crypto = require('crypto');

function verify(rawBody, headers, secret) {
  const signature = headers['x-signature']; // "sha256=<hex>"
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(signature || '');
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

The signature covers the body alone, so it is stable across retries of the same
match. There is no timestamp binding, so the signature on its own does not protect
against replay — rely on `x-idempotency-key` (the match `id`) to collapse duplicate
and replayed deliveries.

## Configuration (deployer)

One-time per GCP project, run `deploy/setup_webhook_pubsub.sh <project-id>` (bash)
or `deploy/setup_webhook_pubsub.ps1 <project-id>` (Windows PowerShell) to create
the `partner-webhook-event` topic and its publisher IAM binding.

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

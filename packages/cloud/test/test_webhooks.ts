import crypto from 'crypto';
import http from 'http';

import { CombatUnitType, IArenaMatch, ICombatUnit, IShuffleMatch, IShuffleRound } from '../../parser/dist/index';
import {
  createWebhookStubFromArenaMatch,
  createWebhookStubFromShuffleMatch,
  sendWebhookAsync,
  WebhookScoreboardEntry,
  WebhookStub,
} from '../src/webhooks';

const TEST_SECRET = 'test-webhook-secret';

// --- Transport test: a spun-up local receiver asserts on what sendWebhookAsync sent. ---

type ReceivedRequest = {
  headers: http.IncomingHttpHeaders;
  body: string;
};

async function testTransport(): Promise<string[]> {
  let received: ReceivedRequest | undefined;

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received = { headers: req.headers, body };
      res.writeHead(200);
      res.end('ok');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  // env is read lazily inside sendWebhookAsync, so setting it before the call is enough.
  process.env.ENV_WEBHOOK_URL = `http://127.0.0.1:${port}`;
  process.env.ENV_WEBHOOK_SECRET = TEST_SECRET;

  const sampleStub: WebhookStub = {
    version: 2,
    dataType: 'ArenaMatch',
    id: 'test-match-1',
    wowVersion: 'retail',
    link: 'https://wowarenalogs.com/match?id=test-match-1',
    startInfo: { timestamp: 1, zoneId: '1552', bracket: '3v3', isRanked: true },
    endInfo: { winningTeamId: '0', timestamp: 2, matchDurationInSeconds: 120, team0MMR: 1500, team1MMR: 1510 },
    playerId: 'player-1',
    playerTeamId: '0',
    region: 'def',
    playerTeamRating: 1600,
    hasAdvancedLogging: true,
    result: 3,
    resultName: 'win',
    combatants: [],
  };

  const outcome = await sendWebhookAsync(sampleStub);
  server.close();

  const failures: string[] = [];
  if (outcome !== 'delivered') {
    failures.push(`sendWebhookAsync returned '${outcome}', expected 'delivered'`);
  }
  if (!received) {
    failures.push('webhook receiver got no request');
  } else {
    if (received.headers['content-type'] !== 'application/json') {
      failures.push(`content-type was '${received.headers['content-type']}', expected 'application/json'`);
    }
    if (received.headers['x-idempotency-key'] !== sampleStub.id) {
      failures.push(`x-idempotency-key was '${received.headers['x-idempotency-key']}', expected '${sampleStub.id}'`);
    }
    const signature = received.headers['x-signature'];
    if (typeof signature !== 'string' || !signature.startsWith('sha256=')) {
      failures.push(`x-signature was '${signature}', expected 'sha256=<hmac>'`);
    }
    if (typeof signature === 'string') {
      const expected = crypto.createHmac('sha256', TEST_SECRET).update(received.body).digest('hex');
      if (signature !== `sha256=${expected}`) {
        failures.push('HMAC signature did not match');
      }
    }
    if (received.body !== JSON.stringify(sampleStub)) {
      failures.push('received body did not match the sent stub');
    }
  }
  return failures;
}

// --- Stub-builder tests: hermetic mocks with DISTINCT per-round data, so each risky
// transform (last-round scoreboard, start/end rename, ""→null, per-round teamId, dps) is
// falsifiable. The mappers read only a known handful of fields, so partial mocks cast via
// `as unknown as` are sufficient (established repo precedent: parser/test/timezones.test.ts). ---

const PLAYERS = [0, 1, 2, 3, 4, 5].map((i) => `Player-1-AAAA000${i}`);

const makeUnit = (opts: {
  id: string;
  name: string;
  specId: string;
  teamId: string;
  damageOut?: { effectiveAmount: number }[];
}): ICombatUnit =>
  ({
    id: opts.id,
    name: opts.name,
    type: CombatUnitType.Player,
    info: { specId: opts.specId, teamId: opts.teamId },
    deathRecords: [],
    damageOut: opts.damageOut ?? [],
    healOut: [],
    absorbsOut: [],
  }) as unknown as ICombatUnit;

// teams[i] is player i's team for this round; `damaged` (a player id) gets non-empty damageOut.
const roundUnits = (teams: string[], damaged?: string): ICombatUnit[] =>
  PLAYERS.map((id, i) =>
    makeUnit({
      id,
      name: `Name${i}`,
      specId: `${100 + i}`,
      teamId: teams[i],
      damageOut: id === damaged ? [{ effectiveAmount: 60000 }] : [],
    }),
  );

const makeRound = (opts: {
  seq: number;
  units: ICombatUnit[];
  scoreboard: WebhookScoreboardEntry[];
  startTime: number;
  endTime: number;
  winningTeamId: string;
  killedUnitId: string;
  result: number;
}): IShuffleRound =>
  ({
    id: `round-${opts.seq}`,
    sequenceNumber: opts.seq,
    dataType: 'ShuffleRound',
    wowVersion: 'retail',
    units: Object.fromEntries(opts.units.map((u) => [u.id, u])),
    events: [],
    startTime: opts.startTime,
    endTime: opts.endTime,
    durationInSeconds: (opts.endTime - opts.startTime) / 1000,
    winningTeamId: opts.winningTeamId,
    killedUnitId: opts.killedUnitId,
    scoreboard: opts.scoreboard,
    result: opts.result,
    playerId: opts.units[0].id,
    playerTeamId: '0',
    hasAdvancedLogging: true,
    playerTeamRating: 1500,
    startInfo: { timestamp: opts.startTime, zoneId: '1552', bracket: 'Rated Solo Shuffle', isRanked: true },
  }) as unknown as IShuffleRound;

const makeShuffle = (rounds: IShuffleRound[]): IShuffleMatch =>
  ({
    dataType: 'ShuffleMatch',
    id: rounds[rounds.length - 1].id,
    wowVersion: 'retail',
    result: 3,
    startInfo: { timestamp: rounds[0].startTime, zoneId: '1552', bracket: 'Rated Solo Shuffle', isRanked: true },
    endInfo: {
      winningTeamId: '0',
      timestamp: rounds[rounds.length - 1].endTime,
      matchDurationInSeconds: 360,
      team0MMR: 1500,
      team1MMR: 1510,
    },
    rounds,
  }) as unknown as IShuffleMatch;

const makeArena = (units: ICombatUnit[]): IArenaMatch =>
  ({
    dataType: 'ArenaMatch',
    id: 'arena-1',
    wowVersion: 'retail',
    result: 3,
    units: Object.fromEntries(units.map((u) => [u.id, u])),
    events: [],
    startTime: 1000,
    endTime: 1300,
    durationInSeconds: 300,
    playerId: units[0].id,
    playerTeamId: '0',
    hasAdvancedLogging: true,
    playerTeamRating: 1600,
    startInfo: { timestamp: 1000, zoneId: '1552', bracket: '3v3', isRanked: true },
    endInfo: { winningTeamId: '0', timestamp: 1300, matchDurationInSeconds: 300, team0MMR: 1500, team1MMR: 1510 },
  }) as unknown as IArenaMatch;

const sb = (wins: number[]): WebhookScoreboardEntry[] => PLAYERS.map((unitId, i) => ({ unitId, wins: wins[i] }));

function testBuilders(): string[] {
  const failures: string[] = [];
  const check = (cond: boolean | undefined, msg: string) => {
    if (!cond) failures.push(msg);
  };

  // Six rounds with DISTINCT data so each transform is falsifiable. Index = sequenceNumber;
  // startTime = 1000 + seq*100, endTime = start + 60. Notable rows are flagged inline.
  type RoundSpec = {
    teams: string[]; // teams[i] = player i's team this round (re-drawn each round)
    scoreboard: number[]; // cumulative wins through this round
    winningTeamId: string;
    killedUnitId: string;
    result: number;
    damaged?: string; // player id given non-empty damageOut (→ dps > 0)
  };
  const roundSpecs: RoundSpec[] = [
    {
      teams: ['0', '0', '0', '1', '1', '1'],
      scoreboard: [1, 1, 1, 0, 0, 0],
      winningTeamId: '0',
      killedUnitId: PLAYERS[3],
      result: 3,
      damaged: PLAYERS[0],
    }, // P0 deals damage
    {
      teams: ['1', '0', '0', '1', '0', '1'],
      scoreboard: [1, 2, 2, 0, 1, 0],
      winningTeamId: '0',
      killedUnitId: PLAYERS[0],
      result: 2,
    },
    {
      teams: ['0', '1', '0', '1', '0', '1'],
      scoreboard: [1, 2, 3, 1, 2, 0],
      winningTeamId: '1',
      killedUnitId: PLAYERS[1],
      result: 3,
    },
    {
      teams: ['1', '0', '0', '0', '1', '1'],
      scoreboard: [1, 2, 4, 2, 2, 1],
      winningTeamId: '0',
      killedUnitId: PLAYERS[0],
      result: 2,
    }, // P0 re-drawn to team '1'
    {
      teams: ['0', '1', '1', '0', '1', '0'],
      scoreboard: [1, 2, 4, 3, 2, 2],
      winningTeamId: '0',
      killedUnitId: '',
      result: 3,
    }, // empty kill → null
    {
      teams: ['0', '0', '1', '1', '0', '1'],
      scoreboard: [1, 2, 4, 5, 2, 4],
      winningTeamId: '1',
      killedUnitId: PLAYERS[2],
      result: 3,
    }, // last: lobby totals (sum 18), distinct from round 0
  ];
  const mockRounds = roundSpecs.map((s, seq) =>
    makeRound({
      seq,
      units: roundUnits(s.teams, s.damaged),
      scoreboard: sb(s.scoreboard),
      startTime: 1000 + seq * 100,
      endTime: 1000 + seq * 100 + 60,
      winningTeamId: s.winningTeamId,
      killedUnitId: s.killedUnitId,
      result: s.result,
    }),
  );

  const stub = createWebhookStubFromShuffleMatch(makeShuffle(mockRounds));

  check(stub.version === 2, `shuffle version ${stub.version} !== 2`);
  check(stub.rounds?.length === 6, `rounds.length ${stub.rounds?.length} !== 6`);
  check(
    stub.rounds?.every((r) => r.combatants.length === 6),
    'a round did not have 6 combatants',
  );

  // Rename: startTime → startTimestamp, endTime → endTimestamp (distinct values catch a swap).
  check(stub.rounds?.[2].startTimestamp === 1200, `round2 startTimestamp ${stub.rounds?.[2].startTimestamp} !== 1200`);
  check(stub.rounds?.[2].endTimestamp === 1260, `round2 endTimestamp ${stub.rounds?.[2].endTimestamp} !== 1260`);

  // Scoreboard must come from the LAST round, not round 0.
  check(
    JSON.stringify(stub.scoreboard) === JSON.stringify(mockRounds[5].scoreboard),
    'scoreboard does not equal the last round scoreboard',
  );
  check(
    JSON.stringify(stub.scoreboard) !== JSON.stringify(mockRounds[0].scoreboard),
    'scoreboard equals round 0 (should be the last round / lobby totals)',
  );
  check(stub.scoreboard?.length === 6, `scoreboard.length ${stub.scoreboard?.length} !== 6`);
  check(
    stub.scoreboard?.some((s) => s.wins === 4),
    'scoreboard missing the known final total of 4 wins',
  );

  // killedUnitId: "" → null; a normal round keeps its GUID.
  check(stub.rounds?.[4].killedUnitId === null, `round4 killedUnitId ${stub.rounds?.[4].killedUnitId} !== null`);
  check(
    stub.rounds?.[0].killedUnitId === PLAYERS[3],
    `round0 killedUnitId ${stub.rounds?.[0].killedUnitId} !== ${PLAYERS[3]}`,
  );

  // Per-round teamId is re-drawn each round (P0: '0' in round 0, '1' in round 3).
  const p0r0 = stub.rounds?.[0].combatants.find((c) => c.id === PLAYERS[0]);
  const p0r3 = stub.rounds?.[3].combatants.find((c) => c.id === PLAYERS[0]);
  check(p0r0?.teamId === '0', `P0 round0 teamId ${p0r0?.teamId} !== '0'`);
  check(p0r3?.teamId === '1', `P0 round3 teamId ${p0r3?.teamId} !== '1'`);

  // dps: round 0 duration = (1060-1000)/1000 = 0.06s → clamped to 1 → 60000/1 = 60000.
  check(p0r0?.dps === 60000, `P0 round0 dps ${p0r0?.dps} !== 60000 (getEffectiveDps/clamp path)`);
  const p1r0 = stub.rounds?.[0].combatants.find((c) => c.id === PLAYERS[1]);
  check(p1r0?.dps === 0, `P1 round0 dps ${p1r0?.dps} !== 0 (no damage)`);

  // Arena must NOT carry rounds/scoreboard, but does get the version bump.
  const arena = createWebhookStubFromArenaMatch(makeArena(roundUnits(['0', '0', '0', '1', '1', '1'])));
  check(arena.version === 2, `arena version ${arena.version} !== 2`);
  check(arena.rounds === undefined, 'arena stub has `rounds` (should be undefined)');
  check(arena.scoreboard === undefined, 'arena stub has `scoreboard` (should be undefined)');

  return failures;
}

async function main() {
  const failures = [...(await testTransport()), ...testBuilders()];

  if (failures.length > 0) {
    console.error('FAIL test_webhooks:');
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log('PASS test_webhooks');
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL test_webhooks (unexpected error):', e);
  process.exit(1);
});

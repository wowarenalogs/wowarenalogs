import crypto from 'crypto';
import http from 'http';

import { sendWebhookAsync, WebhookStub } from '../src/webhooks';

const TEST_SECRET = 'test-webhook-secret';

// A spun-up local receiver lets us assert on what sendWebhookAsync actually sent.
type ReceivedRequest = {
  headers: http.IncomingHttpHeaders;
  body: string;
};

async function main() {
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
    version: 1,
    dataType: 'ArenaMatch',
    id: 'test-match-1',
    link: 'https://wowarenalogs.com/match?id=test-match-1',
    startInfo: { timestamp: 1, zoneId: '1552', bracket: '3v3', isRanked: true },
    endInfo: { winningTeamId: '0', timestamp: 2, matchDurationInSeconds: 120, team0MMR: 1500, team1MMR: 1510 },
    playerId: 'player-1',
    playerTeamId: '0',
    region: 'def',
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
    const timestamp = received.headers['x-webhook-timestamp'];
    const signature = received.headers['x-webhook-signature'];
    if (typeof timestamp !== 'string' || !timestamp) {
      failures.push('x-webhook-timestamp header missing');
    }
    if (typeof signature !== 'string' || !signature.startsWith('sha256=')) {
      failures.push(`x-webhook-signature was '${signature}', expected 'sha256=<hmac>'`);
    }
    if (typeof timestamp === 'string' && typeof signature === 'string') {
      const expected = crypto.createHmac('sha256', TEST_SECRET).update(`${timestamp}.${received.body}`).digest('hex');
      if (signature !== `sha256=${expected}`) {
        failures.push('HMAC signature did not match');
      }
    }
    if (received.body !== JSON.stringify(sampleStub)) {
      failures.push('received body did not match the sent stub');
    }
  }

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

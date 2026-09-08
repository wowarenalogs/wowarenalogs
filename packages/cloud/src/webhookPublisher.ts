import { PubSub } from '@google-cloud/pubsub';
import fs from 'fs';
import path from 'path';

import { logWebhookEvent, WebhookStub } from './webhooks';

const gcpCredentials =
  process.env.NODE_ENV === 'development'
    ? JSON.parse(fs.readFileSync(path.join(__dirname, '../../wowarenalogs-public-dev.json'), 'utf8'))
    : undefined;

const pubsub = new PubSub({ credentials: gcpCredentials });

// Never throws — a publish failure is logged and swallowed so match processing
// is unaffected.
//
// `matchId` is only logged here, never published: this is the one place that
// ties a partner-visible idempotencyKey back to a match id for debugging.
export const publishWebhookStubAsync = async (stub: WebhookStub, matchId: string): Promise<void> => {
  const topic = process.env.ENV_WEBHOOK_TOPIC;
  if (!topic) {
    return;
  }
  try {
    await pubsub.topic(topic).publishMessage({ json: stub });
    logWebhookEvent({
      event: 'webhook_published',
      dataType: stub.dataType,
      matchId,
      idempotencyKey: stub.idempotencyKey,
    });
  } catch (e) {
    logWebhookEvent({
      event: 'webhook_publish_failed',
      level: 'error',
      dataType: stub.dataType,
      matchId,
      idempotencyKey: stub.idempotencyKey,
      error: e instanceof Error ? e.message : String(e),
    });
  }
};

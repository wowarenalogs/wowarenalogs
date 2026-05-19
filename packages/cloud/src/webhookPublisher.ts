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
export const publishWebhookStubAsync = async (stub: WebhookStub): Promise<void> => {
  const topic = process.env.ENV_WEBHOOK_TOPIC;
  if (!topic) {
    return;
  }
  try {
    await pubsub.topic(topic).publishMessage({ json: stub });
  } catch (e) {
    logWebhookEvent({
      event: 'webhook_publish_failed',
      level: 'error',
      dataType: stub.dataType,
      matchId: stub.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
};

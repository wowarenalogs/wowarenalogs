import { logWebhookEvent, sendWebhookAsync, WebhookStub } from './webhooks';

// The whole body is wrapped so `callback` fires exactly once — an async rejection
// that escaped here would never reach the Functions Framework.
export async function handler(
  message: { data?: string; messageId?: string; deliveryAttempt?: number },
  _context: unknown,
  callback: (err?: Error) => void,
) {
  try {
    const stub = JSON.parse(Buffer.from(message.data ?? '', 'base64').toString('utf8')) as WebhookStub;
    if (!stub || !stub.idempotencyKey || !stub.dataType) {
      // Drop malformed payloads — they will never become valid on retry.
      console.error('deliverWebhook: dropping invalid stub', stub);
      callback();
      return;
    }

    // One line per delivery attempt — each Pub/Sub (re)delivery re-invokes the
    // handler, so this prints once per try. `deliveryAttempt`/`messageId` are
    // omitted when the runtime doesn't supply them.
    logWebhookEvent({
      event: 'webhook_attempt',
      dataType: stub.dataType,
      idempotencyKey: stub.idempotencyKey,
      messageId: message.messageId,
      deliveryAttempt: message.deliveryAttempt,
    });

    const outcome = await sendWebhookAsync(stub);

    // Ties this attempt to its result and the retry decision. `sendWebhookAsync`
    // also logs the HTTP status/duration (webhook_delivered / webhook_failed).
    logWebhookEvent({
      event: 'webhook_outcome',
      level: outcome === 'failed_transient' || outcome === 'failed_permanent' ? 'error' : 'info',
      dataType: stub.dataType,
      idempotencyKey: stub.idempotencyKey,
      messageId: message.messageId,
      deliveryAttempt: message.deliveryAttempt,
      outcome,
      willRetry: outcome === 'failed_transient',
    });

    if (outcome === 'failed_transient') {
      callback(new Error(`webhook delivery failed for idempotencyKey ${stub.idempotencyKey}`));
      return;
    }
    callback();
  } catch (e) {
    // Unparseable message — ack it; a poison message never becomes valid on retry.
    console.error('deliverWebhook: dropping unprocessable message', e);
    callback();
  }
}

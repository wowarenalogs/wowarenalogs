import { sendWebhookAsync, WebhookStub } from './webhooks';

// The whole body is wrapped so `callback` fires exactly once — an async rejection
// that escaped here would never reach the Functions Framework.
export async function handler(message: { data?: string }, _context: unknown, callback: (err?: Error) => void) {
  try {
    const stub = JSON.parse(Buffer.from(message.data ?? '', 'base64').toString('utf8')) as WebhookStub;
    if (!stub || !stub.id || !stub.dataType) {
      // Drop malformed payloads — they will never become valid on retry.
      console.error('deliverWebhook: dropping invalid stub', stub);
      callback();
      return;
    }

    const outcome = await sendWebhookAsync(stub);
    if (outcome === 'failed_transient') {
      callback(new Error(`webhook delivery failed for match ${stub.id}`));
      return;
    }
    callback();
  } catch (e) {
    // Unparseable message — ack it; a poison message never becomes valid on retry.
    console.error('deliverWebhook: dropping unprocessable message', e);
    callback();
  }
}

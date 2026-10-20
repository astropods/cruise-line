import { Hono } from 'hono';
import { getWebhooks } from '../github/webhooks.js';

export const webhookRoutes = new Hono();

// One delivery is handled once. An id counts as handled only after its
// handlers succeed, so redelivering a failed event from GitHub's UI runs it
// again; copies that arrive while it's in flight are skipped.
const RECENT_DELIVERIES = 1000;
const handledDeliveries = new Set<string>();
const inFlightDeliveries = new Set<string>();

function markHandled(id: string): void {
  handledDeliveries.add(id);
  if (handledDeliveries.size > RECENT_DELIVERIES) {
    handledDeliveries.delete(handledDeliveries.values().next().value!);
  }
}

webhookRoutes.post('/github', async (c) => {
  const signature = c.req.header('x-hub-signature-256');
  const event = c.req.header('x-github-event');
  const deliveryId = c.req.header('x-github-delivery');

  if (!signature || !event || !deliveryId) {
    return c.json({ error: 'Missing webhook headers' }, 400);
  }

  const body = await c.req.text();
  const webhooks = getWebhooks();
  if (!webhooks || !(await webhooks.verify(body, signature).catch(() => false))) {
    return c.json({ error: 'Webhook verification failed' }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return c.json({ error: 'Body is not JSON' }, 400);
  }

  if (handledDeliveries.has(deliveryId) || inFlightDeliveries.has(deliveryId)) {
    return c.json({ ok: true, duplicate: true });
  }
  inFlightDeliveries.add(deliveryId);

  // Handlers can page through a PR's files and comments, which can outlast
  // GitHub's 10s delivery timeout, so acknowledge first and work after.
  webhooks
    .receive({ id: deliveryId, name: event as any, payload: payload as any })
    .then(() => markHandled(deliveryId))
    .catch((err) => console.error(`Webhook ${event} (${deliveryId}) failed; redeliver it to retry:`, err))
    .finally(() => inFlightDeliveries.delete(deliveryId));

  return c.json({ ok: true }, 202);
});

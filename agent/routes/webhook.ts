import { Hono } from 'hono';
import { getWebhooks } from '../github/webhooks.js';

export const webhookRoutes = new Hono();

// GitHub retries and operators redeliver; one delivery is handled once
const RECENT_DELIVERIES = 1000;
const recentDeliveries = new Set<string>();

function firstDelivery(id: string): boolean {
  if (recentDeliveries.has(id)) return false;
  recentDeliveries.add(id);
  if (recentDeliveries.size > RECENT_DELIVERIES) {
    recentDeliveries.delete(recentDeliveries.values().next().value!);
  }
  return true;
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

  if (!firstDelivery(deliveryId)) return c.json({ ok: true, duplicate: true });

  // Handlers can page through a PR's files and comments, which can outlast
  // GitHub's 10s delivery timeout, so acknowledge first and work after.
  webhooks
    .receive({ id: deliveryId, name: event as any, payload: JSON.parse(body) })
    .catch((err) => console.error(`Webhook ${event} (${deliveryId}) failed:`, err));

  return c.json({ ok: true }, 202);
});

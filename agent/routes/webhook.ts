import { Hono } from 'hono';
import { getWebhooks } from '../github/webhooks.js';

export const webhookRoutes = new Hono();

webhookRoutes.post('/github', async (c) => {
  const signature = c.req.header('x-hub-signature-256');
  const event = c.req.header('x-github-event');
  const deliveryId = c.req.header('x-github-delivery');

  if (!signature || !event || !deliveryId) {
    return c.json({ error: 'Missing webhook headers' }, 400);
  }

  const body = await c.req.text();

  try {
    await getWebhooks().verifyAndReceive({
      id: deliveryId,
      name: event as any,
      signature,
      payload: body,
    });
  } catch (err) {
    console.error('Webhook verification/processing failed:', err);
    return c.json({ error: 'Webhook verification failed' }, 401);
  }

  return c.json({ ok: true });
});

import { Hono } from 'hono';
import { getWebhooks } from '../github/webhooks.js';

export const webhookRoutes = new Hono();

webhookRoutes.post('/github', async (c) => {
  const signature = c.req.header('x-hub-signature-256');
  const event = c.req.header('x-github-event');
  const deliveryId = c.req.header('x-github-delivery');

  // Log every arrival before validation so deliveries are visible in logs
  // even when verification subsequently fails. Useful for distinguishing
  // "GitHub didn't deliver" from "delivery rejected".
  console.log(
    `[webhook] received delivery=${deliveryId ?? 'missing'} event=${event ?? 'missing'}`,
  );

  if (!signature || !event || !deliveryId) {
    console.warn(
      `[webhook] rejected delivery=${deliveryId ?? 'missing'}: missing required headers (signature=${!!signature}, event=${!!event}, delivery=${!!deliveryId})`,
    );
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
    console.log(`[webhook] processed delivery=${deliveryId} event=${event}`);
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(
      `[webhook] verification/processing failed delivery=${deliveryId} event=${event}: ${reason}`,
    );
    return c.json({ error: 'Webhook verification failed' }, 401);
  }

  return c.json({ ok: true });
});

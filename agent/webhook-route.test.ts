import { beforeAll, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { Webhooks } from '@octokit/webhooks';
import { config } from './config.js';
import { refreshWebhooks } from './github/webhooks.js';
import { webhookRoutes } from './routes/webhook.js';

const SECRET = 'webhook-route-test-secret';
const app = new Hono().route('/api/webhook', webhookRoutes);
const signer = new Webhooks({ secret: SECRET });

beforeAll(() => {
  // Other test files mock config with a partial object that can lack github
  (config as any).github ??= {};
  config.github.webhookSecret = SECRET;
  refreshWebhooks();
});

async function deliver(id: string, body: string, signature?: string) {
  return app.request('/api/webhook/github', {
    method: 'POST',
    headers: {
      'x-github-event': 'ping',
      'x-github-delivery': id,
      'x-hub-signature-256': signature ?? (await signer.sign(body)),
      'content-type': 'application/json',
    },
    body,
  });
}

describe('POST /api/webhook/github', () => {
  const body = JSON.stringify({ zen: 'Keep it logically awesome.', hook_id: 1 });

  it('acknowledges a signed delivery before handling it', async () => {
    const res = await deliver('d-1', body);
    expect(res.status).toBe(202);
  });

  it('handles a redelivery only once', async () => {
    await deliver('d-2', body);
    const again = await deliver('d-2', body);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, duplicate: true });
  });

  it('rejects a bad signature', async () => {
    const res = await deliver('d-3', body, 'sha256=' + '0'.repeat(64));
    expect(res.status).toBe(401);
  });
});

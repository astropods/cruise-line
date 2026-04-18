import { Hono } from 'hono';
import { sql } from '../db/client.js';

export const healthRoutes = new Hono();

healthRoutes.get('/health', async (c) => {
  try {
    await sql`SELECT 1`;
    return c.json({ status: 'ok' });
  } catch {
    return c.json({ status: 'error', detail: 'database unreachable' }, 503);
  }
});

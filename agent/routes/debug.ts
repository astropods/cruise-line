/**
 * Diagnostic endpoints for operators. Proxies the sandbox's telemetry status
 * and test-export so we can verify OTEL wiring without cluster access. Sits
 * behind requireAuth so internal hostnames and OTEL diag entries aren't public.
 */

import { Hono } from 'hono';
import { requireAuth } from '../middleware/session.js';
import {
  sandboxTelemetryStatus,
  sandboxTelemetryTest,
} from '../sandbox-client.js';
import type { AppEnv } from '../env.js';

export const debugRoutes = new Hono<AppEnv>();

debugRoutes.use('*', requireAuth);

debugRoutes.get('/telemetry', async (c) => {
  const status = await sandboxTelemetryStatus();
  return c.json(status);
});

debugRoutes.post('/telemetry/test', async (c) => {
  const result = await sandboxTelemetryTest();
  return c.json(result);
});

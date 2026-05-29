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
  const [sandbox, agentProbe] = await Promise.all([
    sandboxTelemetryStatus().catch((err) => ({ error: err instanceof Error ? err.message : String(err) })),
    probeOtlp(),
  ]);
  return c.json({ sandbox, agentProbe });
});

/**
 * Probe the OTLP collector from the agent's perspective. The agent gets
 * OTEL_EXPORTER_OTLP_ENDPOINT auto-injected by the platform; if the agent can
 * reach the same collector the sandbox can't, the problem is sandbox-specific
 * (e.g. NetworkPolicy applied to the StatefulSet differently). If neither can
 * reach it, the collector itself is the issue.
 */
async function probeOtlp(): Promise<unknown> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return { configured: false };
  const url = endpoint.replace(/\/+$/, '') + '/v1/traces';
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-protobuf' },
      body: new Uint8Array(0),
      signal: AbortSignal.timeout(5_000),
    });
    return { configured: true, endpoint, url, reachable: true, status: res.status, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      configured: true,
      endpoint,
      url,
      reachable: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  }
}

debugRoutes.post('/telemetry/test', async (c) => {
  const result = await sandboxTelemetryTest();
  return c.json(result);
});

/**
 * OTEL telemetry bootstrap for the sandbox.
 *
 * Instrumentation is delegated to `@astropods/adapter-claude-agent-sdk`, a
 * drop-in replacement for `@anthropic-ai/claude-agent-sdk` that wires up an
 * OTLP exporter and applies OpenInference's `ClaudeAgentSDKInstrumentation`
 * when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. The adapter also installs
 * SIGTERM/SIGINT flush handlers internally.
 *
 * This module re-exports the adapter's SDK surface and keeps a small
 * diagnostic surface:
 *   - `getTelemetryStatus()` reports endpoint + recent OTEL warnings/errors.
 *   - `runTelemetryTest()` emits a span via the globally registered tracer.
 *     The adapter does not expose its provider handle, so this can't
 *     force-flush — the BatchSpanProcessor's auto-flush will eventually
 *     deliver it. Verify at the Langfuse end.
 *
 * The diag logger is installed in `./diag-init.ts`, which MUST be imported
 * before the adapter so its `instrumentSDK()` init-time diagnostics land in
 * the ring buffer rather than going to the default no-op logger. ESM hoists
 * imports in source order, so the `./diag-init.ts` import below resolves
 * (and runs `diag.setLogger`) before `@astropods/adapter-claude-agent-sdk`.
 *
 * Both endpoints are exposed via /telemetry-status and /telemetry-test in
 * index.ts and proxied through the agent's debug route.
 */

import { diagBuffer, type DiagEntry } from './diag-init.ts';
import { trace, type Span } from '@opentelemetry/api';

export {
  query,
  getSessionMessages,
  getSessionInfo,
} from '@astropods/adapter-claude-agent-sdk';

interface TelemetryStatus {
  initialized: boolean;
  endpoint: string | null;
  exporterUrl: string | null;
  serviceName: string;
  serviceVersion: string;
  recentDiag: DiagEntry[];
}

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? null;
const status: TelemetryStatus = {
  // The adapter only instruments when the endpoint is set, so env presence is
  // an accurate proxy for "initialized" without needing a handle from the adapter.
  initialized: !!endpoint,
  endpoint,
  exporterUrl: endpoint ? endpoint.replace(/\/+$/, '') + '/v1/traces' : null,
  serviceName: process.env.ASTRO_AGENT_NAME ?? 'cruise-line-sandbox',
  serviceVersion: process.env.ASTRO_AGENT_BUILD ?? 'dev',
  recentDiag: diagBuffer,
};

if (endpoint) {
  console.log(`Telemetry: adapter exporting OTLP traces to ${status.exporterUrl}`);
} else {
  console.log('Telemetry: OTEL_EXPORTER_OTLP_ENDPOINT not set — traces disabled');
}

export function getTelemetryStatus(): TelemetryStatus {
  return { ...status, recentDiag: [...diagBuffer] };
}

/**
 * Emit a test span via the globally registered tracer. The adapter owns the
 * provider, so we can't force-flush here — confirm delivery at the Langfuse
 * end (or wait for the BatchSpanProcessor's scheduled export).
 */
export async function runTelemetryTest(): Promise<{
  ok: boolean;
  spanEmitted: boolean;
  flushError: string | null;
  diagDuringTest: DiagEntry[];
}> {
  if (!status.initialized) {
    return { ok: false, spanEmitted: false, flushError: 'OTEL endpoint not configured', diagDuringTest: [] };
  }
  const before = diagBuffer.length;
  let spanEmitted = false;
  let span: Span | null = null;
  try {
    const tracer = trace.getTracer('cruise-line.sandbox.debug', '0.1.0');
    span = tracer.startSpan('telemetry.test', {
      attributes: {
        'openinference.span.kind': 'CHAIN',
        'test.source': 'debug-endpoint',
      },
    });
    span.end();
    spanEmitted = true;
  } catch (err) {
    return {
      ok: false,
      spanEmitted,
      flushError: err instanceof Error ? err.message : String(err),
      diagDuringTest: diagBuffer.slice(before),
    };
  }
  return { ok: true, spanEmitted, flushError: null, diagDuringTest: diagBuffer.slice(before) };
}

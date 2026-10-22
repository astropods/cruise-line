/**
 * OTEL telemetry bootstrap for the sandbox.
 *
 * Instrumentation is delegated to `@astropods/adapter-claude-agent-sdk`, a
 * drop-in replacement for `@anthropic-ai/claude-agent-sdk` that applies
 * OpenInference's `ClaudeAgentSDKInstrumentation` when
 * `OTEL_EXPORTER_OTLP_ENDPOINT` is set. The tracer provider (OTLP exporter,
 * SIGTERM/SIGINT flush) comes from `@astropods/adapter-core`, which builds
 * one per process and hands the same one to every caller.
 *
 * This module re-exports the adapter's SDK surface and keeps a small
 * diagnostic surface:
 *   - `getTelemetryStatus()` reports endpoint + recent OTEL warnings/errors.
 *   - `runTelemetryTest()` emits a span and force-flushes the shared
 *     provider, so an export failure shows up in the response.
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
import { getOrCreateAstroTracerProvider } from '@astropods/adapter-core';

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
  // The same cached provider the adapter instrumented the SDK with
  initialized: getOrCreateAstroTracerProvider() !== null,
  endpoint,
  exporterUrl: endpoint ? endpoint.replace(/\/+$/, '') + '/v1/traces' : null,
  // What adapter-core puts on the resource
  serviceName: process.env.ASTRO_AGENT_NAME ?? 'astro-agent',
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

/** Emit a test span and flush it, reporting any export error */
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
  const provider = getOrCreateAstroTracerProvider();
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
    await provider?.forceFlush();
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

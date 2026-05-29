/**
 * OTEL telemetry bootstrap for the sandbox.
 *
 * The astro platform injects OTEL_EXPORTER_OTLP_ENDPOINT pointing at a
 * per-deployment collector that forwards spans to the account's Langfuse
 * project. We use OpenInference's Claude Agent SDK instrumentation to emit
 * AGENT and TOOL spans with token usage, cost, and tool calls. Langfuse
 * natively understands OpenInference conventions.
 *
 * When the endpoint isn't set (local dev with no collector), spans go to the
 * no-op tracer provider and nothing is exported.
 *
 * Re-exports the claude-agent-sdk surface so callers get the instrumented
 * functions — the OpenInference SDK is ESM and must be patched via
 * `manuallyInstrument(namespace)`.
 *
 * Diagnostic surface: `getTelemetryStatus()` reports init state and recent
 * OTEL warnings/errors; `runTelemetryTest()` emits a span and force-flushes
 * to verify the export path end-to-end. Both are exposed via /telemetry-status
 * and /telemetry-test in index.ts and proxied through the agent's debug route.
 */

import { trace, diag, DiagLogLevel, type Span } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { NodeTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ClaudeAgentSDKInstrumentation } from '@arizeai/openinference-instrumentation-claude-agent-sdk';
import * as ClaudeAgentSDKModule from '@anthropic-ai/claude-agent-sdk';

interface DiagEntry { ts: string; level: string; msg: string; }

const DIAG_BUFFER_MAX = 50;
const diagBuffer: DiagEntry[] = [];

function recordDiag(level: string, args: unknown[]) {
  const msg = args.map((a) => (typeof a === 'string' ? a : safeStringify(a))).join(' ');
  diagBuffer.push({ ts: new Date().toISOString(), level, msg });
  if (diagBuffer.length > DIAG_BUFFER_MAX) diagBuffer.shift();
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

// Capture OTEL warnings/errors (export failures, batch issues) so we can
// surface them via the debug endpoint without needing pod logs.
diag.setLogger(
  {
    verbose: () => {},
    debug:   () => {},
    info:    (...a) => recordDiag('info', a),
    warn:    (...a) => recordDiag('warn', a),
    error:   (...a) => recordDiag('error', a),
  },
  DiagLogLevel.INFO,
);

const ClaudeAgentSDK = { ...ClaudeAgentSDKModule };

interface TelemetryStatus {
  initialized: boolean;
  endpoint: string | null;
  exporterUrl: string | null;
  serviceName: string;
  serviceVersion: string;
  initError: string | null;
  recentDiag: DiagEntry[];
}

const status: TelemetryStatus = {
  initialized: false,
  endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? null,
  exporterUrl: null,
  serviceName: process.env.ASTRO_AGENT_NAME ?? 'cruise-line-sandbox',
  serviceVersion: process.env.ASTRO_AGENT_BUILD ?? 'dev',
  initError: null,
  recentDiag: diagBuffer,
};

let providerHandle: NodeTracerProvider | null = null;

if (status.endpoint) {
  try {
    const provider = new NodeTracerProvider({
      resource: new Resource({
        'service.name': status.serviceName,
        'service.version': status.serviceVersion,
      }),
    });
    const url = status.endpoint.replace(/\/+$/, '') + '/v1/traces';
    provider.addSpanProcessor(new BatchSpanProcessor(new OTLPTraceExporter({ url })));
    provider.register();

    const instrumentation = new ClaudeAgentSDKInstrumentation();
    instrumentation.setTracerProvider(provider);
    instrumentation.manuallyInstrument(ClaudeAgentSDK);

    providerHandle = provider;
    status.exporterUrl = url;
    status.initialized = true;

    const flushAndExit = async (signal: NodeJS.Signals) => {
      try {
        await provider.forceFlush();
        await provider.shutdown();
      } catch {}
      process.exit(signal === 'SIGINT' ? 130 : 0);
    };
    process.once('SIGTERM', flushAndExit);
    process.once('SIGINT', flushAndExit);

    console.log(`Telemetry: exporting OTLP traces to ${url}`);
  } catch (err) {
    status.initError = err instanceof Error ? err.message : String(err);
    console.warn('Telemetry: initialization failed — traces disabled', err);
  }
} else {
  console.log('Telemetry: OTEL_EXPORTER_OTLP_ENDPOINT not set — traces disabled');
}

export function getTelemetryStatus(): TelemetryStatus {
  return { ...status, recentDiag: [...diagBuffer] };
}

/**
 * Emit a test span and force-flush. Returns whether the flush completed and
 * any OTEL diagnostics emitted during the attempt (so we can see export
 * failures the BatchSpanProcessor would otherwise swallow).
 */
export async function runTelemetryTest(): Promise<{
  ok: boolean;
  spanEmitted: boolean;
  flushError: string | null;
  diagDuringTest: DiagEntry[];
}> {
  if (!providerHandle) {
    return { ok: false, spanEmitted: false, flushError: 'tracer provider not initialized', diagDuringTest: [] };
  }
  const before = diagBuffer.length;
  let spanEmitted = false;
  let flushError: string | null = null;
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
    await providerHandle.forceFlush();
  } catch (err) {
    flushError = err instanceof Error ? err.message : String(err);
  }
  const diagDuringTest = diagBuffer.slice(before);
  return { ok: flushError === null, spanEmitted, flushError, diagDuringTest };
}

export const { query, getSessionMessages, getSessionInfo } = ClaudeAgentSDK;

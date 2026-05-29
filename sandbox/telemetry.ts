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
 */

import { Resource } from '@opentelemetry/resources';
import { NodeTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ClaudeAgentSDKInstrumentation } from '@arizeai/openinference-instrumentation-claude-agent-sdk';
import * as ClaudeAgentSDKModule from '@anthropic-ai/claude-agent-sdk';

const ClaudeAgentSDK = { ...ClaudeAgentSDKModule };

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
if (endpoint) {
  // Telemetry must never take the sandbox down. If any of the OTEL constructors
  // throw — version mismatch, malformed URL, etc. — log and fall through to the
  // unpatched SDK exports below.
  try {
    const provider = new NodeTracerProvider({
      resource: new Resource({
        'service.name': process.env.ASTRO_AGENT_NAME ?? 'cruise-line-sandbox',
        'service.version': process.env.ASTRO_AGENT_BUILD ?? 'dev',
      }),
    });
    const url = endpoint.replace(/\/+$/, '') + '/v1/traces';
    provider.addSpanProcessor(new BatchSpanProcessor(new OTLPTraceExporter({ url })));
    provider.register();

    const instrumentation = new ClaudeAgentSDKInstrumentation();
    instrumentation.setTracerProvider(provider);
    instrumentation.manuallyInstrument(ClaudeAgentSDK);

    // Registering SIGTERM/SIGINT listeners replaces Node's default terminate
    // behavior, so we must explicitly exit after flushing or the process hangs
    // until Docker SIGKILLs it.
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
    console.warn('Telemetry: initialization failed — traces disabled', err);
  }
} else {
  console.log('Telemetry: OTEL_EXPORTER_OTLP_ENDPOINT not set — traces disabled');
}

export const { query, getSessionMessages, getSessionInfo } = ClaudeAgentSDK;

# Sandbox OTEL instrumentation for Langfuse

## Summary

The sandbox runs every Claude Agent SDK query but emitted nothing the astro platform could meter. Cruise-line's AI usage was invisible — total cost, token counts, and tool calls all stopped at the SSE response and were not forwarded anywhere durable. This change wires the sandbox to OpenTelemetry so the per-deployment astro collector picks up spans and routes them to the account's Langfuse project.

## Design

### Why instrument here

The agent process (`agent/`) only proxies analysis and chat requests over HTTP. The actual `query()` calls into `@anthropic-ai/claude-agent-sdk` happen in the sandbox container, so that's the only place rich usage data — per-turn `usage`, `total_cost_usd`, tool calls — is visible. Instrumenting the agent would miss everything.

### Why OpenInference, not hand-written spans

The Claude Agent SDK talks to the `claude` binary over IPC, so HTTP-level interceptors (Traceloop's `@traceloop/instrumentation-anthropic`, fetch patching, etc.) never see the calls. Langfuse's documented integration uses the [Arize OpenInference](https://github.com/Arize-ai/openinference) instrumentation, which hooks the SDK's own `PreToolUse` / `PostToolUse` events and result messages to emit AGENT and TOOL spans with `llm.token_count.*`, `llm.cost.total`, `tool.name`, `tool.parameters`, and `output.value`. Langfuse natively understands OpenInference conventions.

### Module shape

`sandbox/telemetry.ts` initializes a `NodeTracerProvider` with an OTLP HTTP exporter pointing at `OTEL_EXPORTER_OTLP_ENDPOINT`, applies `ClaudeAgentSDKInstrumentation.manuallyInstrument()` to the imported SDK namespace, and re-exports `query`, `getSessionMessages`, and `getSessionInfo`. `sandbox/index.ts` imports from `./telemetry.js` instead of `@anthropic-ai/claude-agent-sdk` directly so the patched versions are used:

```typescript
// telemetry.ts
import * as ClaudeAgentSDKModule from '@anthropic-ai/claude-agent-sdk';
const ClaudeAgentSDK = { ...ClaudeAgentSDKModule };

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  // ... build NodeTracerProvider + OTLP exporter ...
  const instrumentation = new ClaudeAgentSDKInstrumentation();
  instrumentation.setTracerProvider(provider);
  instrumentation.manuallyInstrument(ClaudeAgentSDK);
}

export const { query, getSessionMessages, getSessionInfo } = ClaudeAgentSDK;
```

`manuallyInstrument(namespace)` is required because the SDK is ESM-only — the standard `enable()` path doesn't work for ESM modules.

### Endpoint resolution and local dev

The astro platform auto-injects `OTEL_EXPORTER_OTLP_ENDPOINT` into agent containers; the value points at a per-deployment collector that forwards to the account's Langfuse project. When the env var isn't set (local dev, or unsupported container types) the module logs and skips instrumentation, so the sandbox stays functional without a collector.

### Knowledge container endpoint wiring

`OTEL_EXPORTER_OTLP_ENDPOINT` is currently auto-injected into agent containers only, not knowledge containers. The sandbox is declared as a `knowledge` entry, so we wire the deterministic collector address (`http://cruise-line-collector:4318`) into `chat-sandbox.container.environment` explicitly. If the platform later extends auto-injection to knowledge/ingestion containers, this hardcoded value can be removed.

## Migration

No action required for users of the deployed app. For local development:

- `bun install` in `sandbox/` to pick up the new dependencies (`@arizeai/openinference-instrumentation-claude-agent-sdk`, `@opentelemetry/sdk-trace-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/resources`).
- To exercise tracing locally, run an OTLP-compatible collector or Langfuse instance and set `OTEL_EXPORTER_OTLP_ENDPOINT` in the sandbox's environment.

# Swap to @astropods/adapter-claude-agent-sdk

## Summary

The sandbox used a hand-rolled OTEL bootstrap (`sandbox/telemetry.ts`) that built a `NodeTracerProvider`, attached an OTLP HTTP exporter, and ran `ClaudeAgentSDKInstrumentation.manuallyInstrument()` against a spread copy of the SDK namespace. Astropods now publishes `@astropods/adapter-claude-agent-sdk`, a drop-in replacement for `@anthropic-ai/claude-agent-sdk` that does exactly this — same OTLP exporter, same OpenInference instrumentation, same SIGTERM flush. Cruise-line is the first real project consuming the adapter, so this change also smoke-tests it.

## Design

### What moves into the adapter

The adapter's `instrumentSDK()` (`packages/claude-agent-sdk/src/instrumentation.ts` in the adapters repo) takes ownership of:

- Building the `NodeTracerProvider` with `service.name` / `service.version` from `ASTRO_AGENT_NAME` / `ASTRO_AGENT_BUILD`.
- Registering it globally so `trace.getTracer()` resolves to it.
- Wiring `OTLPTraceExporter` to `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`.
- Running `ClaudeAgentSDKInstrumentation.manuallyInstrument()` against a mutable spread of the SDK namespace, then re-exporting the patched `query` so `import { query } from '@astropods/adapter-claude-agent-sdk'` returns the instrumented function.
- Installing SIGTERM/SIGINT flush handlers.

All of that is gone from `sandbox/telemetry.ts`.

### What stays in `sandbox/telemetry.ts`

The diagnostic surface added in `feat/telemetry-debug-endpoint-2026-05-29` is still useful, so the module is reduced to:

- `diag.setLogger(...)` ring buffer — same 50-entry capture of OTEL warnings/errors.
- `getTelemetryStatus()` — same shape, minus `initError` (the adapter handles init internally). `initialized` is now derived from `OTEL_EXPORTER_OTLP_ENDPOINT` being set, which matches the adapter's own gate.
- `runTelemetryTest()` — still emits a span via the globally registered tracer, but **no longer calls `forceFlush()`**. The adapter owns the provider handle and doesn't expose it. The `BatchSpanProcessor`'s scheduled export will deliver the span; verify at the Langfuse end.

The `/telemetry-status` and `/telemetry-test` routes in `sandbox/index.ts` and their proxies through `agent/sandbox-client.ts` are untouched.

### Dependency cleanup

`sandbox/package.json` is reduced to three direct deps:

```diff
- "@anthropic-ai/claude-agent-sdk": "latest",
- "@arizeai/openinference-instrumentation-claude-agent-sdk": "^0.2",
- "@opentelemetry/exporter-trace-otlp-http": "^0.55",
- "@opentelemetry/resources": "^1.27",
- "@opentelemetry/sdk-trace-node": "^1.27",
+ "@astropods/adapter-claude-agent-sdk": "^0.3.0",
  "@opentelemetry/api": "^1.9",
  "hono": "^4.7"
```

`@opentelemetry/api` stays because the diag logger and `trace.getTracer()` test-span path still use it directly. Everything else flows in transitively through the adapter.

## Verification

- `bun install` in `sandbox/` succeeds; the adapter brings the SDK and OpenInference instrumentation transitively.
- `bun build sandbox/index.ts` bundles cleanly.
- Identity check: `query` imported from `sandbox/telemetry.ts` equals `query` from `@astropods/adapter-claude-agent-sdk`, and both are a wrapped function (`name === 'wrappedQuery'`) — not the raw SDK `query`. Instrumentation is applied.
- Booting the sandbox with `OTEL_EXPORTER_OTLP_ENDPOINT` unset logs the disabled-traces banner; `/telemetry-status` reports `initialized: false`; `/telemetry-test` returns `flushError: 'OTEL endpoint not configured'`.
- Booting with a configured endpoint logs `Telemetry: adapter exporting OTLP traces to <url>/v1/traces`; `/telemetry-status` reports `initialized: true` with the resolved exporter URL; `/telemetry-test` emits a span and returns `ok: true`.
- `bun test` passes (23/23).

End-to-end Langfuse delivery still needs to be confirmed against a deployed environment with a real collector — that's the next step after this branch lands.

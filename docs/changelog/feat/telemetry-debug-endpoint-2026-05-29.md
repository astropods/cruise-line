# Telemetry debug endpoint

## Summary

The first deploy with OpenInference instrumentation produced no traces in Langfuse, and the sandbox runs in a knowledge container whose logs aren't reachable through `ast agent logs` today. There was no way to tell whether OTEL init succeeded, whether the OTLP endpoint env var was injected, or whether spans were actually reaching the collector — every silent-failure mode looked the same from outside.

This adds an authenticated debug surface on the deployed agent that proxies through to the sandbox: a status snapshot plus an on-demand test export. Together they distinguish the common breakage modes without cluster access.

## Design

### Sandbox-side capture

`sandbox/telemetry.ts` now registers a custom OTEL `DiagLogger` *before* building the tracer provider, so OTEL's own warnings (BatchSpanProcessor failures, exporter errors, load-order issues from OpenInference) land in a 50-entry ring buffer instead of disappearing to a stdout we can't read.

It also exports two helpers:

- `getTelemetryStatus()` returns `{ initialized, endpoint, exporterUrl, serviceName, serviceVersion, initError, recentDiag }`. `initError` carries the message if the bootstrap's try/catch fired; `recentDiag` is the captured warning/error stream.
- `runTelemetryTest()` emits a span via the registered provider, calls `forceFlush()`, and returns `{ ok, spanEmitted, flushError, diagDuringTest }`. The forceFlush path is what surfaces transport errors (`ECONNREFUSED`, TLS, timeouts) that BatchSpanProcessor would otherwise swallow.

### Sandbox routes

```
GET  /telemetry-status   → getTelemetryStatus()
POST /telemetry-test     → runTelemetryTest()
```

Both are unauthenticated at the sandbox layer because the sandbox is only reachable from the agent over the internal network — same trust model as the existing `/query` and `/ensure-clone` endpoints.

### Agent proxy

`agent/routes/debug.ts` mounts at `/api/debug` behind `requireAuth` and forwards to the two sandbox endpoints. This keeps the diagnostic available without exposing internal hostnames or recent OTEL diagnostics to anonymous callers.

```
GET  /api/debug/telemetry        # current status + recent OTEL diag
POST /api/debug/telemetry/test   # emit a test span and force-flush
```

### Reading the output

| `getTelemetryStatus()` shows | Meaning |
|---|---|
| `endpoint: null` | `OTEL_EXPORTER_OTLP_ENDPOINT` not injected — astropods.yml wiring missing for this container. |
| `initialized: false, initError: "…"` | An OTEL constructor failed (version mismatch, malformed URL). Sandbox is still running; instrumentation is off. |
| `initialized: true, recentDiag: [{level:"warn",msg:"…OpenInference…load order…"}]` | Informational warning from `manuallyInstrument`. Patching still works because the spread-copy path doesn't depend on the `require-in-the-middle` registration. |

| `runTelemetryTest()` returns | Meaning |
|---|---|
| `ok: true, flushError: null` | The OTLP path from sandbox to the collector works end-to-end. If Langfuse still shows nothing, the next broken link is collector→Langfuse. |
| `ok: false, flushError: "Error: ECONNREFUSED"` | Sandbox can't reach the collector — DNS or network policy. |
| `ok: false, flushError: "…401…"` | Collector rejected; check `LANGFUSE_AUTH_TOKEN` injection on the collector. |
| `ok: false, flushError: "…timeout"` | Reachable but unresponsive. |

## Migration

No action required. The new endpoint is additive and behind the existing GitHub-session auth used by every other `/api` route. The sandbox keeps booting cleanly whether the OTLP endpoint is set or not.

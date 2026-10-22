# Astropods adapter 0.6.4

## Summary

`@astropods/adapter-claude-agent-sdk` goes from 0.3.0 to 0.6.4 (with
`@astropods/adapter-core` 0.14.0). Its exports are the same; what changed is
where telemetry is set up.

- **Tracer provider**: the adapter no longer builds its own. It uses
  adapter-core's `getOrCreateAstroTracerProvider()`, which creates one
  provider per process (OTLP exporter, SIGTERM/SIGINT flush) and returns
  the same one to every caller.
- **`telemetry.ts`**: gets that provider too, so `/telemetry-test` now
  force-flushes its test span instead of waiting for the batch timer, and
  `initialized` comes from the provider rather than the env var.
- **Service name**: adapter-core's default `service.name` is `astro-agent`
  (0.3 used `claude-agent`) when `ASTRO_AGENT_NAME` isn't set, which it
  isn't in the sandbox container. Traces from the sandbox show the new
  name in Langfuse. `/telemetry-status` now reports what's actually on
  the resource.
- **New dependencies**: adapter-core brings `@astropods/messaging`
  (gRPC, protobuf) and `pino`, which the sandbox doesn't use. Their
  postinstall scripts are blocked by Bun; nothing the sandbox imports
  needs them.

## Testing

- With `OTEL_EXPORTER_OTLP_ENDPOINT` pointed at a local collector: the
  sandbox boots, `/telemetry-status` reports initialized, `/telemetry-test`
  delivered a span to `/v1/traces` immediately, and the adapter's `query`
  is the instrumented wrapper (the plain SDK function without the env var).
- The only diag entry at boot is OpenInference's load-order warning, the
  same one 0.3 logged.
- `bun test`, `tsc` for the sandbox.
- Not run against the API (no key locally).

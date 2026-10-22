# Claude Agent SDK 0.3.308

## Summary

Queries failed with `API Error: 400 Claude Code 2.1.165 does not support
this model; version 2.1.280 or newer is required`. The sandbox ran Agent
SDK 0.3.165, which bundles Claude Code 2.1.165.

- `@anthropic-ai/claude-agent-sdk` is now a direct dependency at `^0.3.308`
  (Claude Code 2.1.308), and an override makes the Astropods adapter use the
  same copy. Without the override the adapter kept a nested 0.3.165, and
  `query()` goes through the adapter.
- The adapter stays at 0.3.0. Its 0.6 line has the same exports but moves
  telemetry onto `@astropods/adapter-core`'s shared tracer provider, which
  our `telemetry.ts` and diag endpoints would need reworking for; that's a
  separate change.

## Testing

- Clean `bun install --frozen-lockfile` in `sandbox/` installs one SDK copy
  (0.3.308); its binary reports `2.1.308 (Claude Code)`. The lockfile has
  the linux-x64 binaries at 0.3.308.
- `tsc` for the sandbox; `bun test sandbox`.
- Not run against the API (no key locally): confirm a review and a chat on
  a dev deploy.

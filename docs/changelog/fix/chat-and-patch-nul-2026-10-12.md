# Chat survives long replies; NUL bytes no longer fail an analysis

## Summary

Three production bugs, fixed together.

**Chat cut off any reply that took more than 15 seconds.** The browser showed
"network error" after two heartbeats, yet the full reply was in the session
after a refresh. Since prod moved to the Contour/Envoy tenant router on
2026-06-23, every agent sits behind Contour's default response timeout: 15
seconds for the whole response, streaming included. Heartbeats don't reset it.
The AWS load balancer before it only closed connections that went *idle*, so
the 5-second heartbeats used to keep chat alive. Generation was never the
problem; only the browser connection was cut.

**astropods/astro#3195 failed analysis with `unsupported Unicode escape
sequence`.** On `main`, `UsageView.tsx` has a raw NUL byte inside a string
(`.join("\0")`), and the PR replaces it with the escape text `"\u0000"`. The
removed line carries the NUL into the stored patch, `sql.json` writes it as
`\u0000`, and Postgres JSONB rejects that. The error comes from the database,
not from patch parsing.

**`requireAuth` ran twice on bare PR paths.** Routers mounted it on both
`/:owner/:repo/:pr/*` and `/:owner/:repo/:pr`, and Hono matches both on
`/:owner/:repo/:pr`. When a GitHub token was due for renewal, the first call
renewed it and GitHub retired the old refresh token. The second call re-read
the old cookie, retried the retired token, and got `bad_refresh_token`.

## Design

### Chat runs outside the request

`POST /message` now starts a run and returns `202 { runId }` right away. The
run lives in a small in-memory store (`agent/chat/runs.ts`, shaped like
`analysis/jobs.ts`) and does the GitHub lookups, the clone, and the sandbox
query in the background. The agent→sandbox connection is in-cluster, so it
never meets the ingress timeout.

The browser reads the run from `GET /runs/:runId/events` with the built-in
`EventSource`:

- Each event carries its sequence number as the SSE `id`.
- The server closes each connection after 10 seconds, inside the 15-second
  limit, and sends `retry: 250` so the browser reconnects quickly.
- On reconnect the browser sends `Last-Event-ID`, and the server resumes from
  there. Nothing is repeated or lost.
- When the run finishes, the server sends an `end` event and the browser
  closes the stream.

If the platform timeout is ever raised, nothing here needs to change; the
connections just stop being cut.

Along the way:

- **Rejoining after a refresh.** `GET /session` returns `activeRun`, and the
  page follows it. The session file may already hold part of the running
  turn, so the client trims history from the run's prompt before replaying
  the run's events.
- **One reply at a time.** A second message while a run is active gets `409`.
- **Split events no longer dropped.** The old relay forwarded sandbox output
  chunk by chunk, so an event split across network chunks was truncated and
  silently skipped. Runs now use `sandboxQuery`, which buffers lines
  correctly. The unused `sandboxQueryRaw` is removed.
- **Failures are logged.** A run that throws logs to the agent console and
  sends an `error` event. Previously a chat failure left no trace in the logs.

Runs are kept in memory and kept for 5 minutes after they finish, so a cut
connection can still collect the final events. That relies on Cruise Line
running as one replica, as it does today and as analysis jobs already assume.

### NUL bytes

`updateWalkthroughStatus` passes walkthrough data and error text through
`replaceNul`, which swaps U+0000 for the visible `␀` (U+2400). It's one
character for one, so line and column positions in patches don't move, and
the escape text `\u0000` in source is left alone.

### Auth runs once per request

`requireAuth` now returns early when the request already has a session, and
the redundant bare-path mounts are removed from the walkthrough, comment,
chat, and rules routers. The wildcard mount already covers the bare path.

## Tests

- `agent/chat-runs.test.ts` (new): run lifecycle, errors become `error`
  events, active-run lookup, waking on new events, TTL sweep, and the SSE
  stream itself against a real Hono response: replay, resume from
  `Last-Event-ID`, and closing at the window mid-run then resuming.
- `agent/walkthroughs.test.ts` (new): NUL replacement in nested patches,
  length preserved, escape text untouched, JSON output has no `\u0000`.
- `agent/auth.test.ts`: `requireAuth` skips re-validation when already
  authenticated. Fails with the old `session.ts`, passes with the change.

Not yet verified against the deployed tenant router; that needs a deploy.

## Migration

None. No schema change. Existing chat sessions and history are untouched.

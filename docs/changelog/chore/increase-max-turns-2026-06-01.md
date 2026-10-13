# Double agent maxTurns

## Summary

Both Claude Agent SDK invocations in cruise-line capped the agent at a turn budget that was tight for larger PRs and longer chat threads. Walkthrough generation ran with a 30-turn ceiling and chat with a 15-turn ceiling — enough for small diffs and short exchanges, but the agent could hit the cap mid-analysis on bigger PRs (many files, many intents) or mid-reasoning during multi-step chat questions.

Doubling each ceiling gives the agent breathing room without changing any other behavior.

## Design

Two call sites configure `maxTurns` on `sandboxQuery` / `sandboxQueryRaw`:

| Caller | Purpose | Before | After |
|---|---|---|---|
| `agent/analysis/analyzer.ts` | PR walkthrough generation | 30 | 60 |
| `agent/routes/chat.ts` | Per-PR chat sessions | 15 | 30 |

No other knobs change. The sandbox `QueryParams.maxTurns` field remains optional and unchanged; only the values the two callers pass are doubled. Model, system prompts, output schema, and tool surface are untouched.

The practical effect is that the SDK loop in the sandbox will keep going for up to twice as many tool/response turns before terminating with a turn-budget error. Total cost per run scales roughly with turn count, so the upper bound on cost-per-walkthrough and cost-per-chat-message doubles in the worst case; typical runs that already finish well under the prior cap are unaffected.

## Migration

No action required.

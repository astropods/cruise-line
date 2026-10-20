# Reliability fixes

## Summary

Fixes from the whole-app review for state that goes wrong after restarts,
long runs, busy PRs, and out-of-order webhooks.

- **Interrupted reviews**: jobs live in memory, so a restart left reviews
  "running" forever. Startup now marks pending and running rows failed
  (before the server takes requests) and points each PR's comment at a
  retry (`analysis/recover.ts`).
- **Long reviews**: the 10-minute limit on the sandbox stream killed big
  reviews. It's now an idle timeout (2 minutes without even a heartbeat)
  plus a 60-minute ceiling. Closing the stream, for any reason, aborts the
  run in the sandbox through the SDK's `abortController`. `maxTurns` is
  capped at 100.
- **PR comment**: comments are paginated and only the app's own comment
  counts, so busy PRs no longer get duplicates and users quoting the
  marker aren't edited. Updates for one PR run one at a time. A review
  that finishes after new commits were pushed posts as stale. The comment
  states and text live in `github/pr-comment.ts`, used by the webhook, the
  analyzer, and recovery; the copy-pasted complete/stale bodies are one.
- **Webhooks**: the route verifies the signature, answers 202, and handles
  the event after, so slow handlers no longer miss GitHub's 10s timeout.
  Deliveries are de-duplicated by id. Tracked PRs store GitHub's
  `updated_at`, and older writes are ignored, so a late or redelivered
  event can't reopen a merged PR; state comes from the payload, and closed
  PRs get no comment.
- **Scope**: a PR that was out of scope is checked again on each push, and
  changing a repo's scope paths clears its cached decisions.
- **Closing a PR**: cleanup steps run independently, and the checkout is
  kept while a review or chat is still using it.
- **Chat**: the active-run check and the start of a run have no await
  between them, so a double submit can't start two. A unique index (with
  existing duplicates removed) and `ON CONFLICT` keep one session per user
  per PR. Messages are type-checked and capped at 20,000 characters.
- **Inbox**: reviews store a small `summary` (verdict, title, author,
  severity counts) next to `data`, and the inbox reads that instead of
  every full review. Access checks run eight at a time. New index on
  `walkthroughs (owner, repo, pr_number, created_at DESC)`.
- **Migrations** take an advisory lock and apply in one transaction, so
  two instances starting together don't both apply them.
- **Backfill**: PRs it can't fill wait a day and go to the back of the
  queue instead of blocking it.
- Inline review comments are paginated; the model list is cached for five
  minutes in the agent.

## Testing

- `bun test`: 201 pass, including new tests for the comment state and
  body, severity counts, and the webhook route (202, duplicate delivery,
  bad signature).
- Applied migration 013 to a Postgres 16 holding pre-013 data, with two
  runners at once. Checked summary backfill, chat session de-duplication
  and the racing insert, interrupted-review recovery, a late `opened`
  event against a merged PR, the inbox query, and the backfill queue.
- Not exercised: aborting a real sandbox query (it costs API calls) and
  the PR comment against GitHub.

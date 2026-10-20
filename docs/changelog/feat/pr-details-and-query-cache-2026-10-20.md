# PR details and a shared query cache

## Summary

Phase 2 of the frontend rebuild (`docs/architecture/frontend.md`). The
inbox sidebar and PR bar in the new designs need more about each PR than
Cruise Line stored, and they show the same PRs at the same time, so this
adds the data and a shared cache for it. Pages look the same; phases 3–5
draw the new UI on top.

## Design

### PR details

`012_tracked_pr_details.sql` adds author avatar, head and base branch,
additions, deletions, changed-file count, and merged and closed times to
`tracked_prs`. They come from three places, all through `upsertTrackedPr`:

- **Webhooks:** `pull_request` payloads carry every field.
- **The PR page:** `GET /api/walkthroughs/:owner/:repo/:pr` already looks
  the PR up on GitHub; it now returns the details and writes them back, so
  the list stays current for any PR someone opens.
- **A one-time backfill** on startup for PRs tracked before 012 and PRs
  reviewed before tracking existed. One GitHub call per PR, sequential;
  rows it fills no longer match, so later startups do nothing.

Fields a caller leaves out keep their stored values; reopening a PR clears
its merged and closed times.

The list also returns finding counts by severity, computed in SQL from the
latest review.

### Commits since review

When a review predates the PR's head, the single-PR route asks GitHub how
many commits the head is ahead of the reviewed commit
(`commitsSinceReview`). It's null when the review is current or GitHub
can't compare (for example after a force-push), and costs one call only on
stale PRs.

### TanStack Query

`usePrList`, `usePr`, `useReviewProgress`, and `useStartReview` replace the
pages' own polling. The list polls only while a review is running; starting
a review shows it as reviewing everywhere at once and rolls back if the
start fails; a finished run refreshes both the PR and the list.

## Migration

`012` runs on startup and the backfill follows in the background. Nothing
else to do.

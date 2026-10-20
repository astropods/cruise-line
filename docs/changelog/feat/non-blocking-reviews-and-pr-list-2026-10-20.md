# Non-blocking reviews, a PR list, and chat during a review

## Summary

A running review used to take over the whole PR page until it finished.
Now the page always renders its normal chrome:

- **Rerun with a review on screen:** a slim banner shows progress above
  the existing review, which stays readable until the new one lands. A
  failed rerun keeps the previous review and says so.
- **First review:** a centered progress panel sits in the content area,
  with the header, tabs, and chat already usable.
- **Chat:** available immediately, before any review exists. It shares
  the review's checkout and is still scoped per user.

A new `/reviews` page lists every PR Cruise Line knows about, filterable
by review status (not reviewed, reviewing, reviewed, failed), PR state
(open, merged, closed), and repo, with search. PRs that were never
reviewed can be started from the list.

## Design

### Tracking PRs before they're reviewed

Walkthrough rows only exist once a review runs, so a PR whose comment
was posted but never clicked was invisible. A new `tracked_prs` table
(`011_tracked_prs.sql`) is written from the `pull_request` webhook
(opened, reopened, edited, closed) and from the generate route. The list
endpoint unions tracked PRs with walkthrough rows and filters by the
viewer's repo access.

### Keeping the previous review during a rerun

A forced rerun reuses its walkthrough row. It no longer nulls `data`, and
`updateWalkthroughStatus` keeps existing data when none is passed, so a
failed rerun leaves the last good review in place. The single-PR response
adds `latestReview` (the newest row with data) alongside the run status;
`walkthrough.data` is still only populated when complete, so the CLI's
contract is unchanged.

## Local testing

`cd frontend && bun run dev:mock` serves the UI against an in-memory mock
API seeded with one PR per state. See README → "UI-only mock mode".

## Migration

`011_tracked_prs.sql` runs on startup. Existing open PRs appear in the
list once they receive a webhook event or a review.

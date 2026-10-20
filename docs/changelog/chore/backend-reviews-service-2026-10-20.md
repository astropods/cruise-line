# Reviews module and GitHub client helpers

## Summary

The backend architecture items from the whole-app review. No behavior
changes except the installation cache.

- **`analysis/reviews.ts`** holds what the review routes used to do inline:
  `loadPrView` (latest run, latest review, live PR details, commits since
  review, and the tracked-PR refresh) and `triggerReview` (skip a reviewed
  head, reuse a running job, track the PR, create the row, enqueue).
  `routes/walkthroughs.ts` now only parses requests, checks auth, and
  shapes responses, and job dedupe lives in one place.
- **`createUserOctokit`** in `github/app.ts` replaces three hand-built
  clients in the comment routes.
- **Installation lookups are cached** for five minutes per repo. Each PR
  page, chat message, and access check signed an App JWT and called GitHub
  for the same answer. Failed lookups aren't cached; an uninstalled App can
  look installed for up to five minutes, after which calls fail as before.

## Testing

- `bun test`: 206 pass, including the existing generate-route tests, which
  now run through `triggerReview`.
- `tsc --noEmit`.

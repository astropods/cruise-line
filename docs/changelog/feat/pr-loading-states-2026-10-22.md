# PR page loading and access states

## Summary

Opening a PR URL cold showed a spinner, then, for someone without access,
the whole review page as if its review had failed: a "Failed" pill, Retry
and Rerun, and the chat box, all of which got 403s. A signed-out deep link
flashed "Review failed / Not authenticated" before the sign-in redirect.

- **While the access check runs**: a skeleton with the page's shape and
  nothing about the PR. After 600ms a note reads "Checking your access to
  owner/repo on GitHub…". The visitor may not be allowed to see this PR, so
  the skeleton is the same for every one.
- **No access, or no such PR**: one screen in place of the page, with the
  `owner/repo#number` from the URL, who they're signed in as, Back to inbox,
  and Open on GitHub. The two cases read the same, as the server's 403
  does, so a URL can't reveal which private repos exist or have Cruise
  Line installed.
- **Signed out**: "Signing you in…" while `apiFetch` redirects.
- **Outage**: "Couldn't load this pull request" with Try again, which
  refetches rather than starting a review.
- **Nothing else loads first**: comments, chat, and the bar mount only
  after the PR loads, and the rules query waits for it, so a refused visit
  makes one request instead of four.
- "Review failed" now only means a run (or starting one) failed. `useReview`
  reports a failed load as `status: 'unavailable'` with `loadError`.
- The mock API answers 403 for `private/*` and 503 for `outage/*` repos.

## Testing

- Mock app: `/private/vault/pull/7` (skeleton, then the access screen),
  `/outage/api/pull/3` (skeleton with the note through retries, then Try
  again), and a normal PR.
- `bun test`, `tsc --noEmit`, `vite build`.

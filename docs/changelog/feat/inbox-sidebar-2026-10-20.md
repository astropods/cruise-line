# Inbox sidebar and app shell

## Summary

Phase 3 of the frontend rebuild (`docs/architecture/frontend.md`). Signed-in
users now land in an app shell: a 320px inbox sidebar on the left and the
selected PR on the right. The sidebar replaces the `/reviews` page and the
old top bar.

- **Tabs:** Needs attention (with a count), All open, and Done, from
  `domain/prStatus`. The tab lives in `?inbox=` and survives opening a PR.
- **Rows:** status icon, author avatar, repo and number, age (or elapsed
  time while reviewing), title, and a line per state: a progress bar while
  reviewing, Start review for unreviewed PRs, Retry for failed ones,
  Merged or Closed, or the verdict and finding count. Blocking findings
  show as "N blocking" unless the verdict already requests changes.
- **Search:** title, author, or `repo #number`; `/` focuses it, Escape
  clears it.
- **Footer:** Settings (owners) and an account menu with CLI access and
  sign out.

## Design

- Layout route: `AuthGate` → `SetupGate` → `AppShell` with the inbox home
  and PR pages as children. Signed out, `/` renders the public home page;
  the same page is now also at `/cli`.
- On narrow screens only one pane shows: the inbox at `/`, the PR on a PR
  page (with a back link).
- The floating finding navigation (`MiniNav`, `FindingNav`) is removed; it
  overlapped the sidebar and finding navigation was dropped from the
  redesign.
- The PR page keeps its current header and content until phase 4.

## Migration

None. `/reviews` links redirect to `/`.

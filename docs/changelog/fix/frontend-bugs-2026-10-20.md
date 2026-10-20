# Frontend bug fixes

## Summary

Fixes from the whole-app review of the frontend.

- **File and rule pills**: react-markdown's URL sanitizer emptied the
  `::file::` and `::rule::` hrefs, so inline file and "Rule #N" pills
  rendered as links back to the current page. They use fragment hrefs
  (`#cl-file=`, `#cl-rule=`) now, file paths are URL-encoded so spaces and
  parentheses survive, and neither is rewritten inside code spans or fenced
  blocks. Tests render through react-markdown.
- **Chat from Analysis**: only the first question asked from the Analysis
  bar was ever sent, and one asked while a reply streamed was dropped. Each
  question is now a request object that ChatPanel sends once, after the
  history loads and any reply in progress finishes.
- **Rerun**: the progress cache still held the last run's "complete", so a
  rerun showed old activity and could flip back to not reviewing. Starting
  a review clears it, and polling waits for the start request to land.
- **Slideout**:
  - Escape in a comment box, menu, popover, or rule edit no longer
    closes the slideout too; those claim the key with `preventDefault`.
  - Posting a second finding on the same line starts a fresh comment box
    with that finding's text.
  - Focus highlighting maps new-side lines to react-diff-view's change
    keys, so context lines below an insertion highlight the right rows.
  - Comments and the comment box are keyed by side as well as line, so a
    comment on deleted line 10 no longer shows under new line 10.
  - A failed comment load shows a notice instead of an empty diff.
- **Chat history**: a slow history load after switching PRs no longer opens
  a stream for the PR you left, and a failed load says so instead of
  showing an empty conversation.
- **Rules panel**: add, edit, and delete failures show above the list (they
  were unhandled rejections), and a failed load no longer reads "No review
  rules". It's a labelled `dialog`, closes on Escape, returns focus to
  what opened it, and its icon buttons have names; edit and delete show on
  keyboard focus, not just hover.
- **Settings**: a failed setup-status load shows an error with Try again
  instead of the first-time setup flow; a failed user load no longer spins
  forever; a failed disconnect says why.
- **Inbox**: starting reviews on two rows tracks each row's spinner and
  error on its own; before, only the latest start's showed.

## Testing

- `bun test`: 206 pass, including `parseDirectives.test.ts`.
- `tsc --noEmit` and `vite build`.
- Not checked in a browser.

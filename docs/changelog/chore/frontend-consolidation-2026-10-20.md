# Frontend consolidation

## Summary

The duplication and architecture items from the whole-app review. No
intended behavior changes beyond the ones listed.

- **Findings in chat** (`::finding` directives) render with `FindingCard`,
  the Analysis view's card, through a thin `InlineFinding` adapter. Its own
  severity and category maps (which disagreed with `domain/severity`: "Info"
  vs "Note", raw colors) and its copy of the post-as-comment logic are gone.
  `FindingCard`'s rule props are optional; chat findings have no "Save as
  rule".
- **Diffs**: `useParsedDiff` parses and tokenizes a patch for both
  `InlineDiff` and the file slideout (one language map, not two). The
  slideout's two copies of the scroll-to-focus math are one function, and
  an old focus range is cleared when a new one opens.
- **Server state on TanStack Query**:
  - File contents for embeds and the slideout use `useFileContent`, cached
    per head commit, so several embeds of one file share one request.
  - Rules use `useRules`: the review page (for rule tooltips) and the rules
    panel share one cache, and edits invalidate it.
  - Comments use a query; posting and replying append to it.
  - CLI tokens use a query; revoking updates it.
  New keys: `prFile`, `prComments`, `repoRules`, `cliTokens`. Embeds read
  the PR from the slideout context instead of the route.
- **Shared helpers**: `lib/toolCalls` holds tool icons and the tool-call
  path cleanup for both chat and review progress. Comment and CLI token
  times use `lib/time`. `Md` moved to `ui/`, since chat, comments,
  architecture, and review all use it.
- **Theme tokens**: callouts, suggestion diffs, the slideout's focus rows,
  comment and CLI errors, and the remaining accent buttons use tokens; the
  CLI page's last `--border-subtle` is gone.
- **Dead code**: the comments context's unused `loading` and
  `commentCountForFile`, and `useReview`'s unused `reload` and
  `walkthroughHeadSha`.

Chat history still loads inside `useChat`, alongside the streaming state it
restores; moving it to a query is left for later.

## Testing

- `bun test`: 206 pass.
- `tsc --noEmit` (frontend and root) and `vite build`.
- Not checked in a browser.

# Architecture and Chat on the shared UI

## Summary

Moves the Architecture and Chat views onto the `ui/` components and theme
tokens. The designs stay as they are; the redesign explored in Paper is
deferred.

- **Architecture:** `ArchitecturePanel` split into `DiagramCard` and
  `MermaidDiagram`, built on `Card`, `Pill`, `Button`, and `EmptyState`.
  `mermaid.ts` loads Mermaid once and reads its theme from the CSS color
  tokens instead of hard-coded hex values. The empty state's button now
  says "Rerun review".
- **Chat:** `ChatPanel` split into `ChatComposer`, `ChatEntryView`, and
  `ChatEmptyState`. Tool-call paths are cleaned up by `toolCallDetail`,
  which now has tests. The unused `onSwitchToAnalysis` prop is gone.
- **`ui/`:** `IconButton` has an `accent` variant and an `lg` size, used by
  Send; `Button` has an `accent` variant, used by the Analysis view's
  "Ask" button. Both use `accent-emphasis`, slightly darker than the old
  `accent` fill, for white-text contrast.
- **`lib/useCopy`:** one clipboard hook replaces four copies (diagram
  source, fix prompts in both finding views, the home page's copy blocks).
  It clears its timer on unmount and no longer throws on a denied
  clipboard.
- Red and green Tailwind palette classes became `danger` and `success`
  tokens.

## Testing

- `bun test`: 171 pass, including new tests for `normalizeMermaidSource`
  and `toolCallDetail`.
- `tsc --noEmit` for the frontend and root; `vite build`.

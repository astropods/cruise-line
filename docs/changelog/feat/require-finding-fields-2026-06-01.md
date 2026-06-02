# Require fix prompt and comment anchor on every non-info finding

## Summary

Walkthrough findings render with two one-click actions in their header — **Copy fix prompt** and **Post as comment** — but both were silently optional. The prompt encouraged the model to include a `fixPrompt`, and the "Post as comment" button only appeared if the model happened to embed a `::diff` or `::code` directive in the body that pointed at a file in the PR diff. When either signal was missing, the corresponding button just didn't render and reviewers were left without the action.

This makes both actions a structural guarantee for every actionable finding. The only severity allowed to skip them is `info`, which is the explicit observation/positive-note tier.

## Design

### Schema-level enforcement for walkthroughs

The walkthrough analyzer uses Anthropic's `outputFormat: { type: 'json_schema' }` to constrain the model's output. To make `fixPrompt` and a new structured anchor mandatory for non-info severities — and *not* required for info — the findings array's `items` schema is now a discriminated union via `anyOf`:

```ts
items: {
  anyOf: [
    {
      required: ['title', 'severity', 'category', 'body', 'files', 'fixPrompt', 'commentAnchor'],
      properties: {
        severity: { enum: ['critical', 'high', 'medium', 'low'] },
        // ... + fixPrompt and commentAnchor
      },
    },
    {
      required: ['title', 'severity', 'category', 'body', 'files'],
      properties: { severity: { const: 'info' } /* no extra fields */ },
    },
  ],
}
```

`oneOf` and `if/then/else` aren't part of Anthropic's structured-output JSON Schema subset, but `anyOf` is — and since the two branches' `severity` clauses are disjoint, it behaves as a discriminated union. The model must satisfy one branch or the other; a "high" finding without `fixPrompt` is rejected at the API boundary.

### A structured `commentAnchor`, not directive-scraping

Previously the "Post as comment" target was extracted by regex from the first `::diff`/`::code` directive in the body. That worked when the model wrote a directive, but the schema couldn't enforce it (the body is just a string). The new approach adds an explicit field on the finding:

```ts
type CommentAnchor = { file: string; lineStart: number; lineEnd: number };
```

This is part of the schema (so non-info findings can't omit it), feeds the renderer directly, and gets added to the analyzer's `extractFileReferences` set so the file's patch is always loaded — eliminating the case where the model picked a file that wasn't part of the diff and the button silently broke.

The prompt explicitly tells the model `commentAnchor.file` must be a file changed in the PR.

### Backward compatibility for stored walkthroughs

Walkthroughs already saved in the database don't have `commentAnchor`. `FindingRenderer` prefers the structured field but falls back to the existing body-directive regex so legacy walkthroughs keep working without re-running analysis. No DB migration is needed.

### Chat findings: prompt-enforced, UI parity

Chat findings (`::finding{...}` directives in assistant responses) can't go through structured output — they're parsed from markdown. Enforcement there is prompt-level: the chat system prompt now spells out that every non-info `::finding` must carry a `fixPrompt` attribute and contain a `::diff`/`::code` directive in its body. `InlineFinding` gained a "Post as comment" button using the same body-parsing approach as the legacy walkthrough fallback, so the chat finding card matches the walkthrough finding card visually and functionally.

## Migration

No action required.

- **Existing walkthroughs in the DB**: continue to render via the legacy directive-parsing fallback. Re-running analysis on a PR will produce findings with the new structured anchor.
- **Existing chat sessions**: the new chat prompt applies to new assistant turns. Past turns aren't replayed.
- **Schema rejections**: if the model ever returns a non-info finding missing `fixPrompt` or `commentAnchor`, the API rejects the response and analysis fails. The retry path is the same as any other model-output failure.

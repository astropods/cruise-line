# Frontend cleanup

## Summary

Phase 6, the last phase of the frontend rebuild
(`docs/architecture/frontend.md`). No intended visual changes.

- **One set of review types:** `frontend/src/api/types.ts` re-exports the
  review shapes from `agent/analysis/types.ts` instead of copying them.
  The re-exports are type-only, so the frontend's Docker stage (which only
  copies `frontend/`) still builds; checked by building a copy of
  `frontend/` on its own.
- **Every API call in `api/`:** chat, the CLI consent page, and the home
  page moved onto `api/` and the shared queries. The sign-in redirect now
  keeps the page's query string, which the CLI consent flow relies on.
- **Theme tokens everywhere:** the last uses of the old `--bg-*` and
  `--text-*` variables became theme tokens and the aliases are gone. Four
  `placeholder-*` classes, which Tailwind 4 no longer generates, became
  `placeholder:text-fg-muted`, so those placeholders now get their color.
- **Folders match the plan:** `components/`, `contexts/`, `hooks/`, and
  `pages/` are folded into `features/` (review content, chat, comments,
  architecture, rules, auth, home) and `app/`. `useWalkthrough` is now
  `useReview`.
- **Fewer copies:** one `PageSpinner` replaces three; elapsed-time helpers
  live only in `lib/`; the unused `ErrorState` is gone.

## Security fix

After GitHub sign-in, the server redirected to any `return_to` it was
given, so a crafted link could send someone through a real sign-in and on
to another site. `return_to` is now limited to paths on this site, checked
when sign-in starts and again after the callback.

## Mock

The mock's patch now has `git diff` file headers like real patches, so the
file slideout renders in mock mode.

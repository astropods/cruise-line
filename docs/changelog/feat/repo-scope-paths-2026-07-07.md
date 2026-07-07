# Per-repo scope paths for the PR analysis gate

## Summary

Cruise Line posts an analysis comment on every PR opened against a
connected repo. For a monorepo where only a subset of directories is
relevant to Cruise Line's audience, that means noise on every unrelated
PR — frontend PRs when only the backend is in scope, docs PRs when only
code is in scope, and so on.

This change lets owners scope Cruise Line to a list of directory or file
paths per repo. When scope is set, Cruise Line stays silent on PRs whose
changed files fall entirely outside the configured set. Empty scope
keeps the previous behavior (analyze every PR).

## Design

### Storage: `(owner, repo)` implicit key, no repositories table

There's no `repositories` table in the database — connected repos come
straight from the GitHub App installations API on demand, which keeps
GitHub as the source of truth and avoids syncing drift. Rather than
introduce one for this feature, the new `repo_settings` table follows the
same implicit-key pattern already used by `review_rules`:

```sql
CREATE TABLE repo_settings (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  scope_paths TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner, repo)
);
```

A row exists only for repos with configuration. Missing row means
default behavior. If the App is later uninstalled from a repo, its row
becomes harmless dead weight — the webhook can only match rows against
`(owner, repo)` pairs GitHub itself just delivered, so orphan rows never
influence a real event.

### Matching: exact-or-prefix, not plain `startsWith`

Scope entries match a changed file when:

```
file === scope || file.startsWith(scope + '/')
```

This single rule handles both cases the UI advertises. A directory entry
like `agent` matches `agent/foo.ts` (via the second clause) but not
`agent-other/foo.ts` (which is the classic plain-`startsWith` bug — a
scope of `agent` textually prefixes `agent-other` but they're different
directories). A file entry like `Makefile` matches only itself, not
`Makefile.old`.

Normalization strips leading `./` or `/`, collapses `//`, and strips
trailing `/`, so `./agent`, `/agent`, `agent`, and `agent/` all persist
as the same stored form `agent`. That lets the exact-or-prefix rule use
one form for both semantics without a heuristic about "is this a file or
a directory."

The pure normalize + match functions live in `agent/db/repo-settings.ts`
and are unit-tested against sibling-directory, file-vs-dir, and
mixed-scope cases.

### Webhook gate: one-shot at first analysis

The scope check runs in the `pull_request.opened/reopened/synchronize`
handler *before* posting the "ready" comment, but only when no
walkthrough for the PR exists yet. Once a walkthrough is stored, scope
is never re-evaluated for that PR — the comment keeps updating on future
synchronizes regardless of whether the scope tightened in between.

This is a deliberate contract:

- Tightening scope later doesn't retroactively silence in-flight PRs.
  Reviewers who were already looking at a Cruise Line comment don't
  suddenly find it gone the next time the PR is pushed to.
- Manually-triggered walkthroughs on out-of-scope PRs continue to
  update. Once someone explicitly opts a PR into analysis, scope has
  yielded.

Skip decisions log the reason (`no changed files match scope (...)`) so
operators can see why silence is intentional rather than a bug.

### Client/server normalization parity

The settings UI has a small mirror of `normalizeScopePath` at
`frontend/src/lib/scopePath.ts`. It exists because the dirty-check in
`RepoScopeEditor` has to compare typed rows against the server's stored
(already-normalized) form — without a client-side mirror, entries like
`./agent` would read as permanently dirty.

The two implementations are held in sync by a **pinned parity test** in
`agent/repo-settings.test.ts` that exercises both against a shared table
of inputs. Any behavioral drift fails CI, which turns the manual-sync
requirement into an enforced invariant rather than a footgun.

The frontend file is added to the root `tsconfig.json`'s include so
`bun tsc --noEmit` at the repo root can typecheck the test's dynamic
import.

### Settings surface

Two new admin-only routes live under the existing settings module and
inherit its `requireOwner + requireCookieSession` guard chain:

- `GET /api/settings/repos/:owner/:repo` — returns the stored scope, or
  a default empty-scope shape.
- `PATCH /api/settings/repos/:owner/:repo/scope` — replaces the scope
  list.

Both call `assertRepoInstalled(owner, repo)` first, which resolves the
GitHub App installation for the target and 404s if the App isn't
installed there. This keeps the table from accepting hand-crafted URLs,
typos, or repos the App can no longer see, and makes the invariant
explicit for any future non-owner code path.

The PATCH validator also enforces defense-in-depth caps: max 200 entries
in the array, max 512 characters per entry. Owner-only endpoint so this
isn't an attacker angle — but every subsequent webhook does
O(files × scopePaths) matching work against whatever's stored, so
bounding both dimensions matters.

### UI: expandable per-repo, one editor at a time

The Connected Repositories panel on the settings page gains an
expandable disclosure per repo. Expanding fetches the current scope and
renders an inline editor: a list of path inputs, add/remove per row, one
Save button.

Row identity is a client-side UUID rather than the array index. This
avoids a real bug where removing a middle row would cause React to
reuse the input DOM node for the shifted-up value, moving the cursor
under the user.

The dirty check compares normalized row values against the server's
stored form, so `./agent`, `/agent`, and `agent/` all read as clean once
saved.

## Migration

Nothing existing users need to do. Empty scope is the default and keeps
the previous behavior — every PR gets a Cruise Line comment. Repos that
want scoping opt in via the settings page.

Owners: open the settings page, expand any connected repo, and add path
entries (directories or files) to scope Cruise Line to just those
locations. Save. Future PRs whose changed files fall entirely outside
the configured set will no longer receive a comment. PRs that already
have a comment stay updated regardless of scope.

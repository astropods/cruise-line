# Connected repos, user tracking, and ownership transfer

## Summary

Phase 1 introduced a single "owner" who can mutate setup, but the install was otherwise opaque: there was no way for the owner to see which GitHub repos the App could access, no record of which humans had ever signed in, and no path for handing the owner role off to someone else without DB surgery. This change fills in all three by extending the settings page with a Connected Repositories section, a Users section, and an ownership-transfer action — all owner-gated.

Together with Phase 1, these are the pieces a real-world admin needs to operate the install without shelling into the database.

## Design

### Repositories: enumerated on demand, not cached

`GET /api/settings/repos` walks the GitHub App's installations live every time the settings page loads. Two layers of API calls:

1. `apps.listInstallations` against an App-JWT-authed Octokit — returns one entry per account (user or org) the App is installed on.
2. `apps.listReposAccessibleToInstallation` against an installation-token-authed Octokit for each installation — returns the repos that installation can see.

Both calls use `octokit.paginate(...)` so installations and repos beyond the first page come through transparently. Enterprise-account installations are filtered out (they don't have a `login` field, and they aren't relevant for the Cruise Line use case).

No repos table is persisted. The settings page is rendered infrequently and a fresh enumeration is more useful than a stale cache. If rate-limit pressure shows up later, a short in-process TTL cache is the obvious next step.

### Users: tracked at OAuth boundary, used everywhere

A new `users` table records every successful OAuth callback with the GitHub user ID as the primary key:

```sql
CREATE TABLE users (
  user_id        INTEGER PRIMARY KEY,
  login          TEXT NOT NULL,
  avatar_url     TEXT NOT NULL DEFAULT '',
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  login_count    INTEGER NOT NULL DEFAULT 0
);
```

`recordUserLogin` is an `INSERT ... ON CONFLICT DO UPDATE` that refreshes `login` + `avatar_url` (so renames and avatar changes propagate), bumps `last_seen_at`, and increments `login_count`. It's called once at the top of the OAuth callback handler — before the existing ownership-claim path — so the user record exists for every other code path that needs to look someone up by ID.

The users list endpoint joins each row against the current owner (`owner.user_id` in `app_config`) and emits `isOwner: boolean` per user. That keeps the frontend simple and avoids a second round-trip to figure out who has the role.

### Ownership transfer: target must be a known user

`POST /api/settings/owner` flips the owner role to a target `userId`. Three guards before the write:

1. The caller is the current owner (`requireOwner` middleware).
2. The target user is not the caller (no self-transfers — they're already the owner).
3. The target user exists in the `users` table. This is the key constraint — you can only transfer to someone who has actually signed in. It prevents accidental transfers to typo'd or guessed user IDs, and it guarantees we have a current login + avatar to write into the `owner.*` keys.

The write itself uses a new `setOwner` helper in `app-config.ts` that unconditionally overwrites the four `owner.*` keys in a transaction. This is deliberately distinct from `claimOwner`, which uses `INSERT ... ON CONFLICT DO NOTHING` for the race-safe first-claim case. Conflating the two would either weaken the claim invariant or weaken the transfer semantics.

After a successful transfer, the previous owner's session is still valid — they just stop being the owner. The next request they make that requires `requireOwner` 403s, and the settings page renders its locked screen.

### Settings page: owner-only sections layered on existing state machine

The Phase 3 state machine on the settings page (`unconfigured` / `unauthed` / `not-owner-locked` / `unclaimed-claim` / `owner-main`) is unchanged. Two new sections render only in the `owner-main` state:

- **Connected repositories** — installations grouped by account, with each repo's full name, a public/private pill, and a link to GitHub. Empty state offers the install URL.
- **Users** — avatar + `@login` + last-seen + sign-in count per row, with a "Make owner" button on every row except the current owner. The button confirms via `confirm()` and reloads the page on success so the now-non-owner sees their new locked-out reality.

Both sections are self-contained sub-components that fetch their own data on mount. They don't share state with the main page beyond a couple of props (current user ID, install URL), which keeps the existing 400-line component manageable.

## Migration

No manual steps required.

- The `006_users.sql` migration creates the new table and an index on `last_seen_at`. It auto-applies on boot via the existing `migrate.ts` runner.
- The users table starts empty. Users populate it lazily: the next time anyone (including the existing owner) completes an OAuth callback, they're inserted. Sessions that are still valid from before this deploy don't trigger a callback, so users won't show up until they actually re-authenticate.
- The current owner from Phase 1 (whether claimed via OAuth or auto-seeded from the GitHub App owner) is not affected. Their `owner.*` keys in `app_config` are untouched. Once they sign in again after this deploy, they appear in the users list with the `owner` pill.
- Ownership-transfer targets must have signed in at least once. If you need to hand off to someone who hasn't yet, ask them to log in first; they'll appear in the users list afterward.

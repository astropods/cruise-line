# Role-based ownership and the active-user tracking fix

## Summary

Two related problems with the user-management work that shipped in #20:

1. **Users weren't appearing in the dashboard.** The user list is populated by `recordUserLogin`, which is only called from the OAuth callback. Most active users on a recently-deployed install have valid 7-day session cookies from *before* the deploy. They make authenticated requests via `requireAuth` (which silently refreshes GitHub tokens through the refresh-token endpoint) without ever hitting `/api/auth/callback`. So they never get recorded until their cookies naturally expire.

2. **Only one user could hold the owner role.** The single-owner model stored in `app_config.owner.*` worked for the initial design, but real installs have multiple admins. The "transfer ownership" flow was an awkward workaround — it forced a hand-off rather than letting two people both manage settings.

This change fixes both. Users get tracked on every authenticated request, and ownership becomes a role-per-user instead of a single slot in the config table.

## Design

### Active-user tracking lives at the auth middleware

`requireAuth` now invokes a fire-and-forget `touchUser` after the session is validated. To bound the DB write load, the middleware keeps an in-memory `Set<number>` of user IDs already touched this server boot. First request from a given user triggers one UPSERT; subsequent requests skip it entirely.

```ts
function trackActiveUser(session: SessionPayload): void {
  if (touchedUsers.has(session.userId)) return;
  touchedUsers.add(session.userId);
  touchUser({ /* ... */ }).catch((err) => {
    touchedUsers.delete(session.userId);  // retry next request
    console.warn('User tracking failed:', err);
  });
}
```

`touchUser` is a separate DB helper from `recordUserLogin` because their semantics differ: `recordUserLogin` runs on the OAuth callback and bumps `login_count`; `touchUser` runs on every authed request and only refreshes `login`/`avatar_url`/`last_seen_at`. Conflating them would either over-count logins or stop bumping `last_seen` for users with long-lived sessions.

`last_seen_at` goes mildly stale across server restarts (the dedup set is in-process), which is acceptable for a "who's used this install" dashboard.

### Ownership becomes a role on the user row

The single-owner model in `app_config.owner.*` is replaced by a `role` column on `users` (`'user'` | `'owner'`, default `'user'`, CHECK constraint). Multiple users can hold the role concurrently. `requireOwner` becomes a one-row lookup against the `users` table.

```sql
ALTER TABLE users
  ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'owner'));
```

The first-OAuth-login claim path used to rely on `INSERT ... ON CONFLICT DO NOTHING` on `owner.user_id` to be race-safe. The role model uses a single guarded UPDATE that achieves the same property:

```sql
UPDATE users SET role = 'owner'
WHERE user_id = $1 AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'owner')
RETURNING user_id;
```

Two concurrent first logins both attempt this. The first commits and returns the row; the second's WHERE clause now fails the NOT EXISTS, the UPDATE returns no rows, and that caller silently doesn't become owner. Same end-state guarantee as the old `claimOwner`, but expressed through the role column instead of a config row.

### Role mutation endpoint, with a last-owner guard

The old `POST /api/settings/owner` (transfer) is replaced by `PATCH /api/settings/users/:userId/role`, accepting `{ role: 'user' | 'owner' }`. Owner-only. The transfer concept disappears — there's nothing to transfer when multiple owners can coexist.

The safety rail that matters is preventing the install from getting stuck with zero owners. Before applying a demote, the endpoint counts owners; if the target is the last one, the request is rejected with a 400. The frontend mirrors this by disabling the demote button on the last owner with a tooltip explaining the fix ("promote another user to owner first").

Self-demote is allowed (as long as the user isn't the last owner) — that's how an admin steps down. The UI reloads after a self-demote so the now-non-owner bounces straight to the 403 locked screen.

### Auto-seed and manual claim paths point at the role column

The boot-time `attemptAutoSeedOwner` (for installs that predate the owner concept) now writes to `users.role` directly: it resolves the GitHub App owner's user record from GitHub, ensures a row in `users` via `touchUser`, then calls `setUserRole(userId, 'owner')`. The manual `POST /api/setup/claim` endpoint similarly uses `claimOwnerIfNone` to grant the role to the calling user when nobody holds it yet.

`/api/auth/me` returns `role` and derives `isOwner` from it. `/api/setup/status` returns `hasOwner: boolean` (derived from `countUsersByRole('owner')`) instead of the old `ownerClaimed`/`ownerLogin` pair — the frontend already shows owner identity in the user list, so a single user's login is no longer the right shape to surface here.

## Migration

No manual steps. `007_user_roles.sql` runs at boot via the existing migrate runner and:

1. Adds the `role` column.
2. Reads the legacy `app_config.owner.user_id` (and login/avatar_url). If present, UPSERTs the user into `users` with `role='owner'` — covers both the case where the owner had logged in (row exists, role gets flipped) and the auto-seeded case where they never did (row gets inserted with `login_count=0`).
3. Deletes the `owner.*` keys from `app_config`. Single source of truth lives in `users.role`.

After deploy, existing users will populate the dashboard on their next authenticated request, even if their session cookies remain valid for days. The previous single owner is preserved as the first `users.role='owner'` and can immediately promote additional users from the settings page.

# Gate access on collaborator status, not repo visibility

## Summary

Previously, Cruise Line checked whether a user could *view* a repository to
decide if they could access its walkthroughs. This works for private repos but
breaks for public ones — anyone who can see the repo (i.e. everyone) passes the
check, even if the maintainers only want collaborators to use Cruise Line.

## Design

The fix uses data GitHub already returns. The `repos.get()` endpoint includes a
`permissions` object on authenticated requests:

```json
{ "permissions": { "admin": false, "push": true, "pull": true } }
```

Instead of treating a successful `repos.get()` as proof of access, we now check
`data.permissions?.push === true`. This returns `true` only for users who have
been granted write access (collaborators, maintainers, admins) — regardless of
whether the repo is public or private.

The middleware error was also updated from a 401 to a 403 with a clearer
message, since a public-repo viewer *is* authenticated — they just lack the
right role.

A test suite (`agent/auth.test.ts`) covers both the permission check and the
middleware, including cache behavior and per-user isolation. A GitHub Actions
workflow (`.github/workflows/test.yml`) runs the tests on every PR.

## Migration

No migration required. Users who previously had access via collaborator status
will continue to work. Users who could only *view* a public repo (but were never
added as collaborators) will now receive a 403.

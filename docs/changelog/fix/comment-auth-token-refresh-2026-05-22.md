# Fix comment auth: GitHub token refresh and error surfacing

## Summary

PR review comments broke consistently with 401 "Bad credentials" errors. The root cause is that GitHub App user tokens expire after ~8 hours, but the session JWT that embeds them lives for 7 days. After the token expires, the session still validates but every GitHub API call made on behalf of the user fails silently.

## Design

**Token refresh in the auth middleware** — Rather than handling token expiry in each route, the `requireAuth` middleware now checks the embedded token's expiry before passing the request through. When a token is expired (or within 5 minutes of expiring), the middleware uses the refresh token to obtain a new access token from GitHub, updates the in-flight session object, and sets a fresh session cookie on the response. This is transparent to all downstream routes — they continue reading `session.githubToken` as before.

The OAuth token exchange (`exchangeCodeForToken`) now captures `refresh_token` and `expires_in` from GitHub's response and stores them in the session JWT alongside the access token. The `SessionPayload` type gains two optional fields (`refreshToken`, `githubTokenExpiresAt`) so existing sessions without these fields continue to work.

**Fallback for legacy sessions** — Sessions created before this change lack a refresh token. When their GitHub token expires, the Octokit call throws a 401. The global error handler now maps upstream 401s to a 401 response (instead of a generic 500), which the frontend's `apiFetch` already intercepts to trigger an automatic OAuth re-login. After re-authenticating, the new session includes the refresh token.

**Frontend error surfacing** — Comment submission (`CommentInput`) now catches errors and renders them inline. The `useComments` hook captures fetch errors into state (replacing a silent `.catch(() => {})`) and exposes them via the `CommentsContext`. This covers non-auth failures like network errors or validation issues.

## Migration

No manual steps required. Existing sessions will trigger a transparent re-login on next use, after which token refresh works automatically.

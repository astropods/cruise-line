# Security hardening

## Summary

A comprehensive security audit identified vulnerabilities in the setup flow, session management, and missing defense-in-depth measures. The most critical findings were unauthenticated setup endpoints that allowed full app reconfiguration and SSRF via unvalidated URL inputs. This change addresses the high-value findings while keeping the codebase lean.

## Design

### Setup endpoint protection

The GitHub App setup flow has a chicken-and-egg problem: the first setup happens before OAuth exists. A `requireSetupAuth` middleware solves this — it checks `isGitHubConfigured()` and only enforces authentication when the app is already configured. First-time setup passes through; reconfiguration and deletion require a valid session. The `DELETE /api/setup/github` endpoint always requires auth.

### URL validation (SSRF + open redirect prevention)

A new `agent/middleware/validation.ts` provides `validateGitHubUrl()` and `validateAppUrl()` that enforce HTTPS (HTTP only for localhost), reject private IP ranges (10.x, 172.16-31.x, 192.168.x, link-local), and block non-HTTP schemes. The `Origin`/`Referer` header auto-detection for `appUrl` was removed entirely — the frontend sends it explicitly.

### Rate limiting

A simple in-memory sliding-window rate limiter (`agent/middleware/rate-limit.ts`) is applied per-endpoint:
- Auth endpoints: 10 req/min per IP
- Walkthrough generation: 5 req/min per user
- Chat messages: 20 req/min per user
- Setup mutations: 5 req/min per IP

### Session revocation

JWTs now include a `jti` (JWT ID) claim. On logout, the JTI is inserted into a `revoked_sessions` table. The `requireAuth` middleware checks this table on each request. An hourly background task cleans up expired entries. The 7-day JWT lifetime is preserved — revocation handles the "stolen session" concern without degrading UX.

### Production security headers

Hono's `secureHeaders` middleware adds CSP, HSTS, X-Frame-Options, X-Content-Type-Options, and Referrer-Policy in production. Dev mode skips these to avoid Vite HMR conflicts.

### Cookie handling

Hand-rolled cookie parsing regexes replaced with Hono's built-in `getCookie` helper, eliminating a fragile dynamic regex pattern.

### Frontend XSS hardening

Shiki token colors interpolated into `dangerouslySetInnerHTML` style attributes are now validated against `/^#[0-9a-fA-F]{3,8}$/` before use.

## Migration

Requires running the new database migration (`005_security.sql`) which creates the `revoked_sessions` table. No other user-facing changes — existing sessions remain valid.

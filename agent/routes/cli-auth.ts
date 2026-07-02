import { Hono } from 'hono';
import { requireAuth, requireCookieSession } from '../middleware/session.js';
import { AppError } from '../middleware/error.js';
import { rateLimit } from '../middleware/rate-limit.js';
import {
  createAuthCode,
  consumeAuthCode,
  issueCliToken,
  listCliTokensForUser,
  revokeCliToken,
} from '../db/cli-tokens.js';
import { getUser } from '../db/users.js';
import { listInstallationsWithRepos } from '../github/client.js';
import { SUPPORTED_TARGETS, readCliVersion } from '../cli-dist.js';
import { config } from '../config.js';
import type { AppEnv } from '../env.js';

export const cliAuthRoutes = new Hono<AppEnv>();

// Loopback OAuth flow constants. Auth codes are single-use and live briefly:
// long enough to survive a slow browser hop, short enough to bound the window
// for a leaked code to be exchanged.
const AUTH_CODE_TTL_SECONDS = 120;
const CLIENT_ID = 'cli';

// Aggressive on the token endpoint because it accepts a public secret (the
// verifier) and issues long-lived credentials. Anyone brute-forcing codes
// hits this first.
//
// Key function differs from the default: we fall through x-real-ip →
// x-forwarded-for (leftmost) → 'unknown'. The default rate limiter collapses
// to a single global bucket when x-real-ip is missing, which would let one
// misconfigured client lock out every login for the whole install.
// x-forwarded-for is client-appendable so it's not reliable for security
// decisions, but for rate-limit *separation* it's strictly better than one
// shared bucket.
function publicIpKey(c: { req: { header: (name: string) => string | undefined } }): string {
  const realIp = c.req.header('x-real-ip');
  if (realIp) return realIp;
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return 'unknown';
}
const tokenLimiter = rateLimit('cli-token', { windowMs: 60_000, max: 30, keyFn: publicIpKey });
const approveLimiter = rateLimit('cli-authorize', { windowMs: 60_000, max: 30, keyFn: publicIpKey });

export async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Enforce loopback-only redirects. Anything else would let an attacker who
 * tricks a user into approving a consent screen exfiltrate the auth code
 * off the machine.
 */
export function isLoopbackRedirect(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:') return false;
  return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
}

export interface AuthorizeParams {
  responseType: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}

export function validateAuthorizeParams(input: Partial<AuthorizeParams>): AuthorizeParams {
  const { responseType, clientId, redirectUri, state, codeChallenge, codeChallengeMethod } = input;

  if (responseType !== 'code') {
    throw new AppError(400, 'response_type must be "code"');
  }
  if (clientId !== CLIENT_ID) {
    throw new AppError(400, 'Unknown client_id');
  }
  if (!redirectUri || !isLoopbackRedirect(redirectUri)) {
    throw new AppError(400, 'redirect_uri must be a loopback address (http://127.0.0.1 or http://localhost)');
  }
  if (!state || state.length < 8 || state.length > 512) {
    throw new AppError(400, 'state parameter is required (8-512 chars)');
  }
  if (!codeChallenge || codeChallenge.length < 43 || codeChallenge.length > 128) {
    throw new AppError(400, 'code_challenge is required (43-128 chars)');
  }
  if (codeChallengeMethod !== 'S256') {
    throw new AppError(400, 'code_challenge_method must be "S256"');
  }

  return {
    responseType,
    clientId,
    redirectUri,
    state,
    codeChallenge,
    codeChallengeMethod,
  };
}

/**
 * GET /api/cli/latest
 *
 * Public. Returns the CLI version this deployment ships and the per-target
 * download URLs. `cruise-line upgrade` and the lazy update check both hit
 * this — no auth so an unauthenticated CLI can still check for updates.
 */
cliAuthRoutes.get('/latest', async (c) => {
  const version = await readCliVersion();
  const host = config.appUrl.replace(/\/$/, '');
  const downloadUrls: Record<string, string> = {};
  for (const target of SUPPORTED_TARGETS) {
    downloadUrls[target] = `${host}/download/cruise-line-${target}`;
  }
  return c.json({ version, downloadUrls });
});

/**
 * GET /api/cli/authorize/params
 *
 * Called by the consent SPA route to fetch the current user and validate the
 * authorize params. Returns the info needed to render the consent screen.
 * Cookie-only: a CLI token holder must not be able to drive the consent flow
 * headlessly and mint fresh independent tokens.
 */
cliAuthRoutes.get('/authorize/params', requireAuth, requireCookieSession, async (c) => {
  const params = validateAuthorizeParams({
    responseType: c.req.query('response_type'),
    clientId: c.req.query('client_id'),
    redirectUri: c.req.query('redirect_uri'),
    state: c.req.query('state'),
    codeChallenge: c.req.query('code_challenge'),
    codeChallengeMethod: c.req.query('code_challenge_method'),
  });

  const session = c.get('session');
  return c.json({
    user: {
      userId: session.userId,
      login: session.login,
      avatarUrl: session.avatarUrl,
    },
    redirectUri: params.redirectUri,
    clientId: params.clientId,
  });
});

/**
 * POST /api/cli/authorize/approve
 *
 * Called by the consent SPA route when the user clicks Approve. Mints a
 * single-use authorization code and returns the loopback URL the browser
 * should navigate to. The SPA performs the navigation; we don't 302 here
 * because this is a JSON API call.
 *
 * Cookie-only: minting a code is a token-issuance action. Letting a CLI
 * token do this would turn "one authorization = one token" into "one leaked
 * token = infinite fresh tokens" — the new tokens would survive revocation
 * of the original.
 */
cliAuthRoutes.post('/authorize/approve', approveLimiter, requireAuth, requireCookieSession, async (c) => {
  const body = await c.req.json<Partial<AuthorizeParams>>();
  const params = validateAuthorizeParams(body);
  const session = c.get('session');

  const code = await createAuthCode({
    userId: session.userId,
    codeChallenge: params.codeChallenge,
    redirectUri: params.redirectUri,
    ttlSeconds: AUTH_CODE_TTL_SECONDS,
  });

  const url = new URL(params.redirectUri);
  url.searchParams.set('code', code);
  url.searchParams.set('state', params.state);
  return c.json({ redirectUrl: url.toString() });
});

/**
 * POST /api/cli/token
 *
 * Public endpoint. Exchanges an authorization code + PKCE verifier for a
 * bearer token. The code is consumed in a single UPDATE so concurrent
 * exchange attempts resolve to exactly one success.
 */
cliAuthRoutes.post('/token', tokenLimiter, async (c) => {
  const body = await c.req.json<{
    grant_type?: string;
    code?: string;
    code_verifier?: string;
    redirect_uri?: string;
  }>();

  if (body.grant_type !== 'authorization_code') {
    throw new AppError(400, 'grant_type must be "authorization_code"');
  }
  if (!body.code) throw new AppError(400, 'code is required');
  if (!body.code_verifier) throw new AppError(400, 'code_verifier is required');
  if (!body.redirect_uri) throw new AppError(400, 'redirect_uri is required');

  const consumed = await consumeAuthCode(body.code);
  if (!consumed) {
    throw new AppError(400, 'Invalid or expired code');
  }

  if (consumed.redirectUri !== body.redirect_uri) {
    throw new AppError(400, 'redirect_uri does not match the value used at authorization');
  }

  const derivedChallenge = await sha256Base64Url(body.code_verifier);
  if (derivedChallenge !== consumed.codeChallenge) {
    throw new AppError(400, 'code_verifier does not match code_challenge');
  }

  // Load user info to return alongside the token. Bearer callers need a way
  // to identify who they're authenticated as without a second round-trip.
  const user = await getUser(consumed.userId);
  if (!user) {
    throw new AppError(400, 'User no longer exists');
  }

  const issued = await issueCliToken({ userId: consumed.userId });

  return c.json({
    access_token: issued.token,
    token_type: 'Bearer',
    token_id: issued.id,
    user: {
      userId: user.userId,
      login: user.login,
      avatarUrl: user.avatarUrl,
    },
  });
});

/**
 * GET /api/cli/me
 *
 * Bearer-authed whoami. Lets a CLI verify its token is still valid and
 * discover which GitHub identity it's acting as.
 */
cliAuthRoutes.get('/me', requireAuth, async (c) => {
  const session = c.get('session');
  const user = await getUser(session.userId);
  return c.json({
    userId: session.userId,
    login: session.login,
    avatarUrl: session.avatarUrl,
    role: user?.role ?? 'user',
  });
});

/**
 * GET /api/cli/repos
 *
 * List every repository the GitHub App is installed on. Cookie- or Bearer-
 * authed, no owner check — knowing which repos this Cruise Line install can
 * see isn't sensitive (the info is already discoverable via GitHub's own
 * repo pages), and coding agents need it to pick a target.
 */
cliAuthRoutes.get('/repos', requireAuth, async (c) => {
  const installations = await listInstallationsWithRepos();
  return c.json({ installations });
});

/**
 * POST /api/cli/token/revoke
 *
 * Bearer-authed self-revoke: the CLI hands its own token in via Authorization
 * and asks the server to burn it. Body must include the token_id issued at
 * /token time — the server has no way to look up "the token I just
 * authenticated with" other than by re-hashing the bearer.
 */
cliAuthRoutes.post('/token/revoke', requireAuth, async (c) => {
  const session = c.get('session');
  if (c.get('authKind') !== 'cli') {
    throw new AppError(400, 'This endpoint requires a CLI token');
  }

  const body = await c.req.json<{ token_id?: string }>();
  if (!body.token_id) throw new AppError(400, 'token_id is required');

  const revoked = await revokeCliToken(body.token_id, session.userId);
  if (!revoked) {
    throw new AppError(404, 'Token not found or already revoked');
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Dashboard token management (cookie-authed)
// ---------------------------------------------------------------------------

/**
 * GET /api/cli/tokens
 *
 * List the signed-in user's non-revoked CLI tokens for display in the
 * dashboard. Only prefixes and metadata are returned — plaintext tokens
 * are never retrievable after issue.
 */
cliAuthRoutes.get('/tokens', requireAuth, requireCookieSession, async (c) => {
  const session = c.get('session');
  const tokens = await listCliTokensForUser(session.userId);
  return c.json({ tokens });
});

/**
 * DELETE /api/cli/tokens/:id
 *
 * Revoke a CLI token from the dashboard. The user can only revoke tokens
 * they own (enforced in the DB helper via a WHERE clause on user_id).
 */
cliAuthRoutes.delete('/tokens/:id', requireAuth, requireCookieSession, async (c) => {
  const session = c.get('session');
  const id = c.req.param('id');
  if (!id) throw new AppError(400, 'Missing token id');
  const revoked = await revokeCliToken(id, session.userId);
  if (!revoked) {
    throw new AppError(404, 'Token not found or already revoked');
  }
  return c.json({ ok: true });
});

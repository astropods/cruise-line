import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { config } from '../config.js';
import {
  verifySessionToken,
  refreshGitHubToken,
  createSessionToken,
  setSessionCookie,
  type TokenExchangeResult,
} from '../github/oauth.js';
import { verifyRepoAccess } from '../github/client.js';
import { isSessionRevoked } from '../db/sessions.js';
import { getUser, touchUser } from '../db/users.js';
import { AppError } from './error.js';
import type { AppEnv } from '../env.js';
import type { SessionPayload } from '../github/oauth.js';

// Repo access cache: `${userId}:${owner}/${repo}` -> expiry timestamp
const accessCache = new Map<string, number>();
const ACCESS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Refresh buffer: refresh token when less than 5 minutes remain
const REFRESH_BUFFER_SECONDS = 5 * 60;

// Dedup concurrent refresh attempts — keyed by the refresh token being used.
// GitHub refresh tokens are single-use, so only the first caller should hit
// the API; concurrent requests share the same in-flight promise.
const inflightRefreshes = new Map<string, Promise<TokenExchangeResult>>();

// Users we've already touched this server boot. Bounds the per-request DB
// write to one upsert per user per process lifetime — last_seen_at goes
// slightly stale between server restarts, which is acceptable.
const touchedUsers = new Set<number>();

function trackActiveUser(session: SessionPayload): void {
  if (touchedUsers.has(session.userId)) return;
  touchedUsers.add(session.userId);
  // Fire-and-forget so we never add DB latency to authed requests. If the
  // write fails we drop the dedup entry so the next request retries.
  touchUser({
    userId: session.userId,
    login: session.login,
    avatarUrl: session.avatarUrl,
  }).catch((err) => {
    touchedUsers.delete(session.userId);
    console.warn('User tracking failed:', err);
  });
}

/**
 * Middleware that requires a valid session cookie.
 * Attaches session payload to the context.
 * Automatically refreshes expired GitHub tokens when a refresh token is available.
 */
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const cookie = getCookie(c, config.session.cookieName);
  if (!cookie) {
    throw new AppError(401, 'Not authenticated');
  }

  const session = await verifySessionToken(cookie);
  if (!session) {
    throw new AppError(401, 'Invalid or expired session');
  }

  // Check if the session has been revoked
  if (session.jti && await isSessionRevoked(session.jti)) {
    throw new AppError(401, 'Session has been revoked');
  }

  // Auto-refresh the GitHub token if it's expired or about to expire
  const now = Math.floor(Date.now() / 1000);
  if (session.githubTokenExpiresAt && session.refreshToken && now >= session.githubTokenExpiresAt - REFRESH_BUFFER_SECONDS) {
    try {
      // Dedup: reuse an in-flight refresh for the same refresh token
      const rt = session.refreshToken;
      let pending = inflightRefreshes.get(rt);
      if (!pending) {
        pending = refreshGitHubToken(rt);
        inflightRefreshes.set(rt, pending);
        // Clean up after settle; .catch() prevents an unhandled rejection on the
        // detached chain (the original promise is still awaited below).
        pending.catch(() => {}).finally(() => inflightRefreshes.delete(rt));
      }

      const refreshed = await pending;
      session.githubToken = refreshed.accessToken;
      session.refreshToken = refreshed.refreshToken;
      session.githubTokenExpiresAt = refreshed.expiresAt;

      // Issue a new session cookie with the updated token
      const newSessionToken = await createSessionToken({
        githubToken: session.githubToken,
        refreshToken: session.refreshToken,
        githubTokenExpiresAt: session.githubTokenExpiresAt,
        userId: session.userId,
        login: session.login,
        avatarUrl: session.avatarUrl,
      });
      setSessionCookie(c, newSessionToken);
    } catch (err) {
      console.error('GitHub token refresh failed:', err);
      throw new AppError(401, 'Session expired');
    }
  }

  c.set('session', session);
  trackActiveUser(session);
  await next();
}

/**
 * Middleware that requires the authenticated user to hold the 'owner' role
 * in the users table. Must run after `requireAuth`.
 */
export async function requireOwner(c: Context<AppEnv>, next: Next) {
  const session = c.get('session');
  const user = await getUser(session.userId);

  if (!user || user.role !== 'owner') {
    throw new AppError(403, 'Only owners can perform this action');
  }

  await next();
}

/**
 * Middleware that verifies the authenticated user is a collaborator (push access)
 * on the repo specified in :owner/:repo route params.
 */
export async function requireRepoAccess(c: Context<AppEnv>, next: Next) {
  const session = c.get('session');
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');

  if (!owner || !repo) {
    throw new AppError(400, 'Missing owner or repo parameter');
  }

  const cacheKey = `${session.userId}:${owner}/${repo}`;
  const cached = accessCache.get(cacheKey);

  if (cached && cached > Date.now()) {
    await next();
    return;
  }

  const hasAccess = await verifyRepoAccess(owner, repo, session.login);
  if (!hasAccess) {
    throw new AppError(403, 'You must be a collaborator on this repository to access Cruise Line');
  }

  accessCache.set(cacheKey, Date.now() + ACCESS_CACHE_TTL);
  await next();
}


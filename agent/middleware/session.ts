import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { config } from '../config.js';
import { verifySessionToken, refreshGitHubToken, createSessionToken } from '../github/oauth.js';
import { verifyRepoAccess } from '../github/client.js';
import { isSessionRevoked } from '../db/sessions.js';
import { AppError } from './error.js';
import type { AppEnv } from '../env.js';

// Repo access cache: `${userId}:${owner}/${repo}` -> expiry timestamp
const accessCache = new Map<string, number>();
const ACCESS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Refresh buffer: refresh token when less than 5 minutes remain
const REFRESH_BUFFER_SECONDS = 5 * 60;

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
      const refreshed = await refreshGitHubToken(session.refreshToken);
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
      const secure = config.appUrl.startsWith('https') ? '; Secure' : '';
      c.header(
        'Set-Cookie',
        `${config.session.cookieName}=${newSessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${secure}`,
      );
    } catch (err) {
      console.error('GitHub token refresh failed:', err);
      throw new AppError(401, 'Session expired');
    }
  }

  c.set('session', session);
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


import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { config } from '../config.js';
import { verifySessionToken, type SessionPayload } from '../github/oauth.js';
import { verifyRepoAccess } from '../github/client.js';
import { isSessionRevoked } from '../db/sessions.js';
import { AppError } from './error.js';

// Repo access cache: `${userId}:${owner}/${repo}` -> expiry timestamp
const accessCache = new Map<string, number>();
const ACCESS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Middleware that requires a valid session cookie.
 * Attaches session payload to the context.
 */
export async function requireAuth(c: Context, next: Next) {
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

  c.set('session', session as SessionPayload);
  await next();
}

/**
 * Middleware that verifies the authenticated user is a collaborator (push access)
 * on the repo specified in :owner/:repo route params.
 */
export async function requireRepoAccess(c: Context, next: Next) {
  const session = c.get('session') as SessionPayload;
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


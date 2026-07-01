import { Hono } from 'hono';
import { requireAuth, requireOwner, requireCookieSession } from '../middleware/session.js';
import { AppError } from '../middleware/error.js';
import { rateLimit } from '../middleware/rate-limit.js';
import {
  countUsersByRole,
  getUser,
  listUsers,
  setUserRole,
  type UserRole,
} from '../db/users.js';
import { listInstallationsWithRepos } from '../github/client.js';
import type { AppEnv } from '../env.js';

export const settingsRoutes = new Hono<AppEnv>();

const settingsLimiter = rateLimit<AppEnv>('settings', { windowMs: 60_000, max: 30 });

// Admin settings are cookie-only: CLI tokens are read-only by contract even
// when the token belongs to an owner. Runs before requireOwner so we return
// 403-not-cookie rather than 403-not-owner for CLI callers.
settingsRoutes.use('*', settingsLimiter, requireAuth, requireCookieSession, requireOwner);

/**
 * GET /api/settings/repos
 * List every GitHub App installation and its accessible repositories.
 * Fetched on demand — no caching for now.
 */
settingsRoutes.get('/repos', async (c) => {
  const installations = await listInstallationsWithRepos();
  return c.json({ installations });
});

/**
 * GET /api/settings/users
 * List every user who has ever interacted with this install.
 */
settingsRoutes.get('/users', async (c) => {
  const users = await listUsers();
  return c.json({ users });
});

/**
 * PATCH /api/settings/users/:userId/role
 * Promote or demote a user. Owner-only. The last remaining owner cannot be
 * demoted — that would lock everyone out of settings.
 */
settingsRoutes.patch('/users/:userId/role', async (c) => {
  const session = c.get('session');
  const targetUserId = Number(c.req.param('userId'));

  if (!Number.isInteger(targetUserId)) {
    throw new AppError(400, 'userId must be an integer');
  }

  const body = await c.req
    .json<{ role?: UserRole }>()
    .catch((): { role?: UserRole } => ({}));
  const targetRole = body.role;

  if (targetRole !== 'owner' && targetRole !== 'user') {
    throw new AppError(400, "role must be 'owner' or 'user'");
  }

  const target = await getUser(targetUserId);
  if (!target) {
    throw new AppError(400, 'Target user has not signed in to Cruise Line yet');
  }

  if (target.role === targetRole) {
    return c.json({ ok: true, user: { ...target, role: targetRole } });
  }

  // Guard the last-owner case: an install with zero owners can't be unstuck
  // through the settings UI. Block self-demote and demote-others when this
  // user is the last one holding the role.
  if (target.role === 'owner' && targetRole === 'user') {
    const ownerCount = await countUsersByRole('owner');
    if (ownerCount <= 1) {
      throw new AppError(
        400,
        'Cannot demote the last owner — promote another user to owner first',
      );
    }
  }

  await setUserRole(targetUserId, targetRole);

  console.log(
    `Cruise Line role: ${session.login} (${session.userId}) set ${target.login} (${target.userId}) -> ${targetRole}`,
  );

  const updated = await getUser(targetUserId);
  return c.json({ ok: true, user: updated });
});

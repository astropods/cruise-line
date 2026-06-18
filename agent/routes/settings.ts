import { Hono } from 'hono';
import { requireAuth, requireOwner } from '../middleware/session.js';
import { AppError } from '../middleware/error.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { getOwner, setOwner } from '../db/app-config.js';
import { getUser, listUsers } from '../db/users.js';
import { listInstallationsWithRepos } from '../github/client.js';
import type { AppEnv } from '../env.js';

export const settingsRoutes = new Hono<AppEnv>();

const settingsLimiter = rateLimit<AppEnv>('settings', { windowMs: 60_000, max: 30 });

settingsRoutes.use('*', settingsLimiter, requireAuth, requireOwner);

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
 * List every user who has ever logged in, plus a flag marking the owner.
 */
settingsRoutes.get('/users', async (c) => {
  const [users, owner] = await Promise.all([listUsers(), getOwner()]);
  return c.json({
    users: users.map((u) => ({
      ...u,
      isOwner: owner !== null && owner.userId === u.userId,
    })),
  });
});

/**
 * POST /api/settings/owner
 * Transfer ownership to another user. Target must have logged in at least
 * once (so we have their current login + avatar). Self-transfer is a 400.
 */
settingsRoutes.post('/owner', async (c) => {
  const session = c.get('session');

  const body = await c.req.json<{ userId?: number }>().catch((): { userId?: number } => ({}));
  const targetUserId = body.userId;

  if (typeof targetUserId !== 'number' || !Number.isInteger(targetUserId)) {
    throw new AppError(400, 'userId is required and must be an integer');
  }

  if (targetUserId === session.userId) {
    throw new AppError(400, 'You are already the owner');
  }

  const target = await getUser(targetUserId);
  if (!target) {
    throw new AppError(400, 'Target user has not logged in to Cruise Line yet');
  }

  await setOwner({
    userId: target.userId,
    login: target.login,
    avatarUrl: target.avatarUrl,
  });

  console.log(
    `Cruise Line ownership transferred from ${session.login} (${session.userId}) to ${target.login} (${target.userId})`,
  );

  return c.json({
    ok: true,
    owner: { userId: target.userId, login: target.login, avatarUrl: target.avatarUrl },
  });
});

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
import { getInstallationForRepo, listInstallationsWithRepos } from '../github/client.js';
import { getRepoSettings, setRepoScopePaths } from '../db/repo-settings.js';
import type { AppEnv } from '../env.js';

/**
 * Throw 404 if the GitHub App isn't installed on `(owner, repo)`. Belt-and-
 * suspenders on top of the owner-only guard: keeps the settings table from
 * accepting arbitrary keys (typos, deleted repos, hand-crafted URLs) and
 * makes the invariant explicit if a future non-owner role ever reaches
 * these routes.
 */
async function assertRepoInstalled(owner: string, repo: string): Promise<void> {
  try {
    await getInstallationForRepo(owner, repo);
  } catch {
    throw new AppError(404, 'Repository not installed');
  }
}

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
 * GET /api/settings/repos/:owner/:repo
 * Fetch per-repo settings (scope paths). Returns defaults if none stored.
 */
settingsRoutes.get('/repos/:owner/:repo', async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  await assertRepoInstalled(owner, repo);
  const settings = await getRepoSettings(owner, repo);
  return c.json({
    settings: settings ?? { owner, repo, scopePaths: [], updatedAt: null },
  });
});

/**
 * PATCH /api/settings/repos/:owner/:repo/scope
 * Set the list of scope path prefixes for a repo. An empty list means
 * "analyze every PR" (default behavior).
 */
settingsRoutes.patch('/repos/:owner/:repo/scope', async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  await assertRepoInstalled(owner, repo);

  const body = await c.req
    .json<{ scopePaths?: unknown }>()
    .catch((): { scopePaths?: unknown } => ({}));

  if (!Array.isArray(body.scopePaths) || body.scopePaths.some((p) => typeof p !== 'string')) {
    throw new AppError(400, 'scopePaths must be an array of strings');
  }
  // Defense-in-depth against buggy clients writing pathological blobs to
  // repo_settings. Owner-only endpoint so there's no attacker angle here,
  // but every subsequent webhook does O(files x scopePaths) work against
  // whatever's stored.
  if (body.scopePaths.length > 200) {
    throw new AppError(400, 'scopePaths may not exceed 200 entries');
  }
  if ((body.scopePaths as string[]).some((p) => p.length > 512)) {
    throw new AppError(400, 'scope path entries may not exceed 512 characters');
  }

  const settings = await setRepoScopePaths(owner, repo, body.scopePaths as string[]);
  return c.json({ settings });
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

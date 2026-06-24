import { Octokit } from '@octokit/rest';
import { config } from './config.js';
import { getGitHubAppConfig } from './db/app-config.js';
import { countUsersByRole, getUser, setUserRole, touchUser } from './db/users.js';
import { generateAppJwt } from './github/app.js';

/**
 * Boot-time migration path: when no user holds the owner role yet, try to
 * promote the user who created the GitHub App. If the App is owned by an
 * individual, we already know who set things up — resolve their GitHub user
 * record and grant them the owner role.
 *
 * Returns the outcome so callers can log it. All failure modes are non-fatal
 * — the manual `/api/setup/claim` endpoint is always available as a fallback
 * (org-owned Apps, deleted accounts, network blips).
 */
export async function attemptAutoSeedOwner(): Promise<
  | { status: 'skipped'; reason: string }
  | { status: 'claimed'; login: string; userId: number }
  | { status: 'failed'; reason: string }
> {
  if ((await countUsersByRole('owner')) > 0) {
    return { status: 'skipped', reason: 'owner role already held' };
  }

  const appConfig = await getGitHubAppConfig();
  if (!appConfig) {
    return { status: 'skipped', reason: 'GitHub App not configured' };
  }

  if (appConfig.ownerType !== 'User') {
    return {
      status: 'skipped',
      reason: `GitHub App is owned by a ${appConfig.ownerType}, not a User`,
    };
  }

  if (!appConfig.ownerLogin) {
    return { status: 'skipped', reason: 'GitHub App owner login is missing' };
  }

  try {
    const jwt = await generateAppJwt();
    const octokit = new Octokit({ baseUrl: config.github.baseUrl, auth: jwt });
    const { data } = await octokit.users.getByUsername({
      username: appConfig.ownerLogin,
    });

    // Touch ensures the user row exists; then grant the role.
    await touchUser({
      userId: data.id,
      login: data.login,
      avatarUrl: data.avatar_url,
    });

    // Double-check no one else slipped in between our read and write. If they
    // did, leave their claim alone — multi-owner is fine; we just didn't need
    // to auto-seed.
    if ((await countUsersByRole('owner')) > 0) {
      return { status: 'skipped', reason: 'owner role was claimed concurrently' };
    }

    await setUserRole(data.id, 'owner');

    // Sanity check that the role actually applied (defensive in case of a
    // future schema change).
    const refreshed = await getUser(data.id);
    if (refreshed?.role !== 'owner') {
      return { status: 'failed', reason: 'role write did not persist' };
    }

    return { status: 'claimed', login: data.login, userId: data.id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: 'failed', reason };
  }
}

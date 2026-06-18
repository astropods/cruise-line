import { Octokit } from '@octokit/rest';
import { config } from './config.js';
import {
  claimOwner,
  getGitHubAppConfig,
  isOwnerClaimed,
} from './db/app-config.js';
import { generateAppJwt } from './github/app.js';

/**
 * Migration path for existing installs that predate the owner concept. If no
 * owner is claimed but the GitHub App was created by an individual user, we
 * already know who set things up — resolve their GitHub user record and claim
 * ownership on their behalf.
 *
 * Returns the claim outcome so callers can log it. All failure modes are
 * non-fatal — the manual `/api/setup/claim` endpoint is always available as a
 * fallback (org-owned Apps, deleted accounts, network blips).
 */
export async function attemptAutoSeedOwner(): Promise<
  | { status: 'skipped'; reason: string }
  | { status: 'claimed'; login: string; userId: number }
  | { status: 'failed'; reason: string }
> {
  if (await isOwnerClaimed()) {
    return { status: 'skipped', reason: 'owner already claimed' };
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

    const claimed = await claimOwner({
      userId: data.id,
      login: data.login,
      avatarUrl: data.avatar_url,
    });

    if (!claimed) {
      return { status: 'skipped', reason: 'owner was claimed concurrently' };
    }

    return { status: 'claimed', login: data.login, userId: data.id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: 'failed', reason };
  }
}

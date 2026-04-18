import { Octokit } from '@octokit/rest';
import { config } from '../config.js';
import { getInstallationToken, createInstallationOctokit } from './app.js';
import type { PrMetadata } from './types.js';

/**
 * Fetch PR metadata using an installation token.
 */
export async function getPrMetadata(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PrMetadata> {
  const token = await getInstallationToken(installationId);
  const octokit = createInstallationOctokit(token);

  const { data: pr } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  return {
    owner,
    repo,
    number: prNumber,
    title: pr.title,
    author: pr.user?.login ?? 'unknown',
    baseRef: pr.base.ref,
    headRef: pr.head.ref,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    installationId,
  };
}

/**
 * Get the current head SHA for a PR (to detect staleness).
 */
export async function getPrHeadSha(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string> {
  const token = await getInstallationToken(installationId);
  const octokit = createInstallationOctokit(token);

  const { data: pr } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  return pr.head.sha;
}

/**
 * Post or update the walkthrough link comment on a PR.
 */
export async function postWalkthroughComment(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<void> {
  const token = await getInstallationToken(installationId);
  const octokit = createInstallationOctokit(token);

  const walkthroughUrl = `${config.appUrl}/${owner}/${repo}/pull/${prNumber}`;
  const marker = '<!-- cruise-line-walkthrough -->';
  const body = `${marker}\n### Cruise Line\n[View guided walkthrough](${walkthroughUrl}) of this pull request.`;

  // Check for existing comment
  const comments = await octokit.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = comments.data.find((c) => c.body?.includes(marker));

  if (existing) {
    await octokit.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
  }
}

/**
 * Look up the installation ID for a given repository.
 */
export async function getInstallationForRepo(
  owner: string,
  repo: string,
): Promise<number> {
  const { generateAppJwt } = await import('./app.js');
  const jwt = await generateAppJwt();
  const octokit = new Octokit({
    baseUrl: config.github.baseUrl,
    auth: jwt,
  });

  const { data } = await octokit.apps.getRepoInstallation({ owner, repo });
  return data.id;
}

/**
 * Verify a user has read access to a repository using their OAuth token.
 */
export async function verifyRepoAccess(
  userToken: string,
  owner: string,
  repo: string,
): Promise<boolean> {
  const octokit = new Octokit({
    baseUrl: config.github.baseUrl,
    auth: userToken,
  });

  try {
    await octokit.repos.get({ owner, repo });
    return true;
  } catch {
    return false;
  }
}

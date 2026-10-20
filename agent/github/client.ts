import { Octokit } from '@octokit/rest';
import { config } from '../config.js';
import { getInstallationToken, createInstallationOctokit } from './app.js';
import type { PrMetadata } from './types.js';
import { mapWithConcurrency } from '../concurrency.js';
import { buildCommentBody, COMMENT_MARKER, type CommentState } from './pr-comment.js';

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
    body: pr.body ?? undefined,
    authorAvatarUrl: pr.user?.avatar_url ?? null,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    state: pr.merged_at ? 'merged' : pr.state === 'closed' ? 'closed' : 'open',
    mergedAt: pr.merged_at,
    closedAt: pr.closed_at,
    updatedAt: pr.updated_at,
  };
}

/**
 * How many commits `head` is ahead of `base`, or null when GitHub can't
 * compare them (a force-push can leave `base` unreachable).
 */
export async function countCommitsBetween(
  installationId: number,
  owner: string,
  repo: string,
  base: string,
  head: string,
): Promise<number | null> {
  const token = await getInstallationToken(installationId);
  const octokit = createInstallationOctokit(token);
  try {
    const { data } = await octokit.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${base}...${head}`,
      per_page: 1,
    });
    return data.ahead_by;
  } catch {
    return null;
  }
}

// GitHub caps the response at 3,000 files; larger PRs are silently truncated.
export async function listPrChangedFiles(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string[]> {
  const token = await getInstallationToken(installationId);
  const octokit = createInstallationOctokit(token);

  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  return files.map((f) => f.filename);
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

export type { AnalysisSummary, CommentState } from './pr-comment.js';

/**
 * Post or update the Cruise Line analysis comment on a PR.
 */
export async function postAnalysisComment(
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  state: CommentState = { status: 'ready' },
): Promise<void> {
  const token = await getInstallationToken(installationId);
  const octokit = createInstallationOctokit(token);

  const analysisUrl = `${config.appUrl}/${owner}/${repo}/pull/${prNumber}`;
  const body = buildCommentBody(state, analysisUrl);

  // One update at a time per PR, so two events that both find no comment
  // don't both create one
  await serializeForPr(`${owner}/${repo}#${prNumber}`, async () => {
    // Our comment can be anywhere in a long thread. Only the app's own
    // comments count; a user quoting the marker must not be edited.
    let existing: { id: number } | undefined;
    for await (const page of octokit.paginate.iterator(octokit.issues.listComments, {
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    })) {
      existing = page.data.find((c) => c.user?.type === 'Bot' && c.body?.includes(COMMENT_MARKER));
      if (existing) break;
    }

    if (existing) {
      await octokit.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    } else {
      await octokit.issues.createComment({ owner, repo, issue_number: prNumber, body });
    }
  });
}

const prQueues = new Map<string, Promise<void>>();

/** Run fn after any earlier call for the same key has finished */
async function serializeForPr(key: string, fn: () => Promise<void>): Promise<void> {
  const run = (prQueues.get(key) ?? Promise.resolve()).then(fn);
  const tail = run.catch(() => {});
  prQueues.set(key, tail);
  try {
    await run;
  } finally {
    if (prQueues.get(key) === tail) prQueues.delete(key);
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

export interface ConnectedRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
}

export interface ConnectedInstallation {
  id: number;
  account: {
    login: string;
    type: string;
    avatarUrl: string;
    htmlUrl: string;
  };
  repositories: ConnectedRepo[];
}

/**
 * Enumerate every GitHub App installation along with the repositories it can
 * access. One App-JWT call to list installations, then one installation-token
 * call per installation to list its repos. Auto-paginated.
 */
export async function listInstallationsWithRepos(): Promise<ConnectedInstallation[]> {
  const { generateAppJwt } = await import('./app.js');
  const jwt = await generateAppJwt();
  const appOctokit = new Octokit({ baseUrl: config.github.baseUrl, auth: jwt });

  const installations = await appOctokit.paginate(appOctokit.apps.listInstallations, {
    per_page: 100,
  });

  const result: ConnectedInstallation[] = [];
  for (const installation of installations) {
    const account = installation.account;
    // SimpleUser has `login`; Enterprise accounts don't and aren't relevant here.
    if (!account || !('login' in account)) continue;

    const token = await getInstallationToken(installation.id);
    const instOctokit = createInstallationOctokit(token);

    const repos = await instOctokit.paginate(
      instOctokit.apps.listReposAccessibleToInstallation,
      { per_page: 100 },
    );

    result.push({
      id: installation.id,
      account: {
        login: account.login,
        type: account.type ?? 'User',
        avatarUrl: account.avatar_url ?? '',
        htmlUrl: account.html_url ?? '',
      },
      repositories: repos.map((r) => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        htmlUrl: r.html_url,
      })),
    });
  }

  return result;
}

/**
 * Verify a user is a collaborator (write or admin) on a repository.
 * Uses the App installation token so team-based and org-level permissions
 * are correctly resolved — user-to-server tokens don't always reflect these.
 */
export async function verifyRepoAccess(
  owner: string,
  repo: string,
  username: string,
): Promise<boolean> {
  try {
    const installationId = await getInstallationForRepo(owner, repo);
    return await verifyRepoAccessForInstallation(installationId, owner, repo, username);
  } catch (err: any) {
    console.error(`Repo access check failed for ${username} on ${owner}/${repo}:`, err?.status, err?.message);
    return false;
  }
}

/**
 * Same check as verifyRepoAccess but when the installation ID is already
 * known — skips the extra `apps.getRepoInstallation` lookup. Callers doing
 * batch filtering (see listInstallationsWithReposForUser) already have this
 * ID from their prior enumeration and shouldn't pay for a second GitHub call.
 */
async function verifyRepoAccessForInstallation(
  installationId: number,
  owner: string,
  repo: string,
  username: string,
): Promise<boolean> {
  try {
    const token = await getInstallationToken(installationId);
    const octokit = createInstallationOctokit(token);

    const { data } = await octokit.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username,
    });

    return data.permission === 'write' || data.permission === 'maintain' || data.permission === 'admin';
  } catch (err: any) {
    // A 404 here is the normal "user is not a collaborator" path — GitHub
    // returns 404, not a permission=none row. Log at debug so scoping-heavy
    // endpoints don't spam production logs.
    if (err?.status !== 404) {
      console.error(`Repo access check failed for ${username} on ${owner}/${repo}:`, err?.status, err?.message);
    }
    return false;
  }
}

// Concurrency cap for the per-repo permission checks. GitHub's secondary
// (abuse) rate limit is triggered by many concurrent requests to the same
// endpoint — an install with hundreds of repos would blow through it if
// we fanned out all at once, and the resulting 403s would be swallowed as
// "no access", silently dropping repos the user actually can see.
const REPO_ACCESS_CONCURRENCY = 8;

/**
 * Same as listInstallationsWithRepos, but scoped: only include repositories
 * the given username has write/maintain/admin permission on. Installations
 * that end up with zero visible repos are dropped. This is what the
 * CLI-reachable `/api/cli/repos` endpoint returns — it must never leak the
 * names of repositories the caller can't already see on GitHub.
 *
 * Permission checks run with bounded concurrency per installation so a
 * large install (hundreds of repos) doesn't fan out into an equally large
 * number of simultaneous GitHub API calls and trip secondary rate limits.
 */
export async function listInstallationsWithReposForUser(
  username: string,
): Promise<ConnectedInstallation[]> {
  const all = await listInstallationsWithRepos();
  const scoped: ConnectedInstallation[] = [];

  for (const inst of all) {
    const checks = await mapWithConcurrency(
      inst.repositories,
      REPO_ACCESS_CONCURRENCY,
      async (repo) => {
        const has = await verifyRepoAccessForInstallation(
          inst.id,
          inst.account.login,
          repo.name,
          username,
        );
        return has ? repo : null;
      },
    );
    const visible = checks.filter((r): r is ConnectedRepo => r !== null);
    if (visible.length > 0) {
      scoped.push({ ...inst, repositories: visible });
    }
  }

  return scoped;
}

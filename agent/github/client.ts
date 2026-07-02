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
    body: pr.body ?? undefined,
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

export interface AnalysisSummary {
  verdict: 'approve' | 'request_changes' | 'needs_discussion';
  verdictRationale: string;
  findingCounts: { critical: number; high: number; medium: number; low: number; info: number };
}

export type CommentState =
  | { status: 'ready' }
  | { status: 'running' }
  | { status: 'complete'; summary: AnalysisSummary }
  | { status: 'stale'; summary: AnalysisSummary }
  | { status: 'failed' };

const MARKER = '<!-- cruise-line-analysis -->';

const VERDICT_LABELS: Record<string, { emoji: string; label: string }> = {
  approve: { emoji: '\u2705', label: 'Looks good to merge' },
  request_changes: { emoji: '\uD83D\uDEA8', label: 'Changes requested' },
  needs_discussion: { emoji: '\uD83D\uDCAC', label: 'Needs discussion' },
};

function buildCommentBody(state: CommentState, analysisUrl: string): string {
  switch (state.status) {
    case 'running':
      return `${MARKER}
## \u2693 Cruise Line

Analysis in progress\u2026

[\u2192 View progress](${analysisUrl})`;

    case 'complete': {
      const v = VERDICT_LABELS[state.summary.verdict] ?? VERDICT_LABELS.needs_discussion;
      const counts: string[] = [];
      if (state.summary.findingCounts.critical > 0) counts.push(`${state.summary.findingCounts.critical} critical`);
      if (state.summary.findingCounts.high > 0) counts.push(`${state.summary.findingCounts.high} high`);
      if (state.summary.findingCounts.medium > 0) counts.push(`${state.summary.findingCounts.medium} medium`);
      if (state.summary.findingCounts.low > 0) counts.push(`${state.summary.findingCounts.low} low`);
      if (state.summary.findingCounts.info > 0) counts.push(`${state.summary.findingCounts.info} info`);
      const total = Object.values(state.summary.findingCounts).reduce((a, b) => a + b, 0);

      return `${MARKER}
## ${v.emoji} Cruise Line \u2014 ${v.label}

${state.summary.verdictRationale}

${total > 0 ? `**${total} finding${total === 1 ? '' : 's'}:** ${counts.join(' \u00B7 ')}` : 'No findings.'}

[\u2192 View full analysis](${analysisUrl})`;
    }

    case 'stale': {
      const sv = VERDICT_LABELS[state.summary.verdict] ?? VERDICT_LABELS.needs_discussion;
      const sCounts: string[] = [];
      if (state.summary.findingCounts.critical > 0) sCounts.push(`${state.summary.findingCounts.critical} critical`);
      if (state.summary.findingCounts.high > 0) sCounts.push(`${state.summary.findingCounts.high} high`);
      if (state.summary.findingCounts.medium > 0) sCounts.push(`${state.summary.findingCounts.medium} medium`);
      if (state.summary.findingCounts.low > 0) sCounts.push(`${state.summary.findingCounts.low} low`);
      if (state.summary.findingCounts.info > 0) sCounts.push(`${state.summary.findingCounts.info} info`);
      const sTotal = Object.values(state.summary.findingCounts).reduce((a, b) => a + b, 0);

      return `${MARKER}
## ${sv.emoji} Cruise Line \u2014 ${sv.label}

> \u26A0\uFE0F **Stale** \u2014 New commits have been pushed since this analysis was run. Click below to re-analyze.

${state.summary.verdictRationale}

${sTotal > 0 ? `**${sTotal} finding${sTotal === 1 ? '' : 's'}:** ${sCounts.join(' \u00B7 ')}` : 'No findings.'}

[\u2192 Re-run analysis](${analysisUrl})`;
    }

    case 'failed':
      return `${MARKER}
## \u26A0\uFE0F Cruise Line \u2014 Analysis failed

Something went wrong during the analysis. Click below to retry.

[\u2192 View details](${analysisUrl})`;

    case 'ready':
    default:
      return `${MARKER}
## \u2693 Cruise Line

[\u2192 Click to start Cruise Line analysis](${analysisUrl})`;
  }
}

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

  // Check for existing comment
  const comments = await octokit.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = comments.data.find((c) => c.body?.includes(MARKER));

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
 * Run `worker` on each input with at most `limit` in flight at once. Preserves
 * input order in the output so callers can zip results back to inputs.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

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

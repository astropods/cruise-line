import { Hono } from 'hono';
import { config } from '../config.js';
import { requireAuth, requireRepoAccess, requireCookieSession, hasRepoAccess } from '../middleware/session.js';
import {
  upsertWalkthrough,
  getLatestWalkthrough,
  getLatestReviewedWalkthrough,
  listPrSummaries,
  getWalkthroughById,
  deleteWalkthrough,
} from '../db/walkthroughs.js';
import { upsertTrackedPr } from '../db/tracked-prs.js';
import { getPrMetadata, getInstallationForRepo } from '../github/client.js';
import { jobManager } from '../analysis/jobs.js';
import { AppError } from '../middleware/error.js';
import { rateLimit } from '../middleware/rate-limit.js';
import type { AppEnv } from '../env.js';

export const walkthroughRoutes = new Hono<AppEnv>();

// 5 generation requests per minute per user
const generateLimiter = rateLimit<AppEnv>('generate', {
  windowMs: 60_000,
  max: 5,
  keyFn: (c) => {
    const session = c.get('session');
    return session?.userId ? String(session.userId) : 'unknown';
  },
});


// All walkthrough routes require authentication and repo access
walkthroughRoutes.use('/:owner/:repo/:pr/*', requireAuth, requireRepoAccess);

/**
 * GET /api/walkthroughs
 * Every PR with a walkthrough, limited to repos the caller can push to.
 */
walkthroughRoutes.get('/', requireAuth, async (c) => {
  const session = c.get('session');
  const rows = await listPrSummaries();

  const repoKeys = [...new Set(rows.map((r) => `${r.owner}/${r.repo}`))];
  const access = new Map(
    await Promise.all(
      repoKeys.map(async (key) => {
        const [owner, repo] = key.split('/');
        return [key, await hasRepoAccess(session, owner, repo)] as const;
      }),
    ),
  );

  const prs = rows
    .filter((r) => access.get(`${r.owner}/${r.repo}`))
    .map((r) => ({
      owner: r.owner,
      repo: r.repo,
      number: r.pr_number,
      status: r.status ?? 'none',
      prState: r.pr_state,
      headSha: r.head_sha,
      updatedAt: r.updated_at,
      title: r.title,
      author: r.author,
      verdict: r.verdict,
      findingCount: r.finding_count,
    }));

  return c.json({ prs, githubUrl: config.github.htmlUrl });
});

/**
 * GET /api/walkthroughs/:owner/:repo/:pr
 * Returns the latest walkthrough row for a PR (the current or most recent job),
 * the latest review that has content (`latestReview`, which may be an older
 * row while a new one runs), the PR's title/author, and the current head SHA
 * for staleness detection.
 *
 * `walkthrough.data` is only set once that row is complete, so API callers
 * never mistake a previous run's output for the one in progress.
 */
walkthroughRoutes.get('/:owner/:repo/:pr', async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));

  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

  const [walkthrough, reviewed] = await Promise.all([
    getLatestWalkthrough(owner, repo, prNumber),
    getLatestReviewedWalkthrough(owner, repo, prNumber),
  ]);

  // Also fetch current head SHA to detect staleness
  let currentHeadSha: string | null = null;
  let pr: { title: string; author: string } | null = null;
  try {
    const installationId = await getInstallationForRepo(owner, repo);
    const meta = await getPrMetadata(installationId, owner, repo, prNumber);
    currentHeadSha = meta.headSha;
    pr = { title: meta.title, author: meta.author };
  } catch {
    // If we can't fetch the PR (e.g., it's closed), that's fine
  }

  return c.json({
    walkthrough: walkthrough && {
      id: walkthrough.id,
      status: walkthrough.status,
      headSha: walkthrough.head_sha,
      error: walkthrough.error,
      data: walkthrough.status === 'complete' ? walkthrough.data : null,
      createdAt: walkthrough.created_at,
      updatedAt: walkthrough.updated_at,
    },
    latestReview: reviewed && {
      id: reviewed.id,
      headSha: reviewed.head_sha,
      data: reviewed.data,
      updatedAt: reviewed.updated_at,
    },
    pr,
    currentHeadSha,
    githubUrl: config.github.htmlUrl,
  });
});

/**
 * POST /api/walkthroughs/:owner/:repo/:pr/generate
 * Triggers walkthrough generation. Idempotent — won't duplicate running jobs.
 *
 * Reachable via CLI bearer tokens: this is the loop-closing action for
 * coding agents (open PR → trigger review → poll status → read walkthrough).
 * DELETE below stays cookie-only — CLI callers should never destroy work.
 */
walkthroughRoutes.post('/:owner/:repo/:pr/generate', generateLimiter, async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));
  const force = c.req.query('force') === 'true';

  if (!owner || !repo) throw new AppError(400, 'Missing route parameters');
  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

  // force=true replaces an existing completed walkthrough once the rerun
  // succeeds — and spends a full analysis on a SHA that already has one.
  // CLI tokens can start work but never overwrite it, so this branch stays
  // cookie-only.
  // Non-force /generate remains reachable via bearer, which is what coding
  // agents need for the open-PR → trigger → poll loop.
  //
  // Polarity matters: this checks !== 'cookie' rather than === 'cli' so a
  // future authKind (say, an API-key session) doesn't silently inherit the
  // destructive branch. Same shape as requireCookieSession.
  if (force && c.get('authKind') !== 'cookie') {
    throw new AppError(403, 'force=true is only available from a browser session; run this from the browser to re-generate an existing walkthrough');
  }

  // Fetch current PR metadata
  const installationId = await getInstallationForRepo(owner, repo);
  const pr = await getPrMetadata(installationId, owner, repo, prNumber);

  // Check if we already have a completed walkthrough for this exact SHA (skip if force)
  if (!force) {
    const existing = await getLatestWalkthrough(owner, repo, prNumber);
    if (existing && existing.head_sha === pr.headSha && existing.status === 'complete') {
      return c.json({
        walkthroughId: existing.id,
        status: 'complete',
      });
    }
  }

  // Check if a job is already running for this SHA
  const runningJob = jobManager.getJob(owner, repo, prNumber, pr.headSha);
  if (runningJob) {
    return c.json(
      {
        walkthroughId: runningJob.walkthroughId,
        status: runningJob.state,
      },
      202,
    );
  }

  // Covers PRs opened before tracking existed. Best-effort, like the webhook.
  await upsertTrackedPr(pr).catch((err) =>
    console.error(`Failed to track ${owner}/${repo}#${prNumber}:`, err),
  );

  // Create DB row and enqueue job
  const row = await upsertWalkthrough(owner, repo, prNumber, pr.headSha, force);
  jobManager.enqueue(row.id, pr);

  return c.json({ walkthroughId: row.id, status: 'queued' }, 202);
});

/**
 * GET /api/walkthroughs/:owner/:repo/:pr/status
 * Poll endpoint for generation progress.
 */
walkthroughRoutes.get('/:owner/:repo/:pr/status', async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));

  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

  const walkthrough = await getLatestWalkthrough(owner, repo, prNumber);
  if (!walkthrough) {
    return c.json({ status: 'none' });
  }

  // Include live progress from the job manager if still running
  const activeJob = jobManager.getActiveJob(owner, repo, prNumber);
  const progress = activeJob?.progress ?? [];

  return c.json({
    walkthroughId: walkthrough.id,
    status: walkthrough.status,
    headSha: walkthrough.head_sha,
    error: walkthrough.error,
    progress,
  });
});

/**
 * DELETE /api/walkthroughs/:owner/:repo/:pr
 * Deletes the walkthrough record for a PR.
 */
walkthroughRoutes.delete('/:owner/:repo/:pr', requireCookieSession, async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));

  if (!owner || !repo) throw new AppError(400, 'Missing route parameters');
  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

  await deleteWalkthrough(owner, repo, prNumber);
  return c.json({ ok: true });
});

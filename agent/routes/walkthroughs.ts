import { Hono } from 'hono';
import { config } from '../config.js';
import { requireAuth, requireRepoAccess } from '../middleware/session.js';
import {
  upsertWalkthrough,
  getLatestWalkthrough,
  getWalkthroughById,
  deleteWalkthrough,
} from '../db/walkthroughs.js';
import { getPrMetadata, getInstallationForRepo } from '../github/client.js';
import { jobManager } from '../analysis/jobs.js';
import { AppError } from '../middleware/error.js';

export const walkthroughRoutes = new Hono();

// All walkthrough routes require authentication and repo access
walkthroughRoutes.use('/:owner/:repo/:pr/*', requireAuth, requireRepoAccess);
walkthroughRoutes.use('/:owner/:repo/:pr', requireAuth, requireRepoAccess);

/**
 * GET /api/walkthroughs/:owner/:repo/:pr
 * Returns the latest walkthrough for a PR, plus the current head SHA for staleness detection.
 */
walkthroughRoutes.get('/:owner/:repo/:pr', async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));

  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

  const walkthrough = await getLatestWalkthrough(owner, repo, prNumber);

  // Also fetch current head SHA to detect staleness
  let currentHeadSha: string | null = null;
  try {
    const installationId = await getInstallationForRepo(owner, repo);
    const pr = await getPrMetadata(installationId, owner, repo, prNumber);
    currentHeadSha = pr.headSha;
  } catch {
    // If we can't fetch the PR (e.g., it's closed), that's fine
  }

  if (!walkthrough) {
    return c.json({ walkthrough: null, currentHeadSha, githubUrl: config.github.htmlUrl });
  }

  return c.json({
    walkthrough: {
      id: walkthrough.id,
      status: walkthrough.status,
      headSha: walkthrough.head_sha,
      error: walkthrough.error,
      data: walkthrough.data,
      createdAt: walkthrough.created_at,
      updatedAt: walkthrough.updated_at,
    },
    currentHeadSha,
    githubUrl: config.github.htmlUrl,
  });
});

/**
 * POST /api/walkthroughs/:owner/:repo/:pr/generate
 * Triggers walkthrough generation. Idempotent — won't duplicate running jobs.
 */
walkthroughRoutes.post('/:owner/:repo/:pr/generate', async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));
  const force = c.req.query('force') === 'true';

  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

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
walkthroughRoutes.delete('/:owner/:repo/:pr', async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));

  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

  await deleteWalkthrough(owner, repo, prNumber);
  return c.json({ ok: true });
});

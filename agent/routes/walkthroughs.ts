import { Hono } from 'hono';
import { config } from '../config.js';
import { requireAuth, requireRepoAccess, requireCookieSession } from '../middleware/session.js';
import {
  upsertWalkthrough,
  getLatestWalkthrough,
  getWalkthroughById,
  deleteWalkthrough,
} from '../db/walkthroughs.js';
import { getPrMetadata, getInstallationForRepo, getPrDiff } from '../github/client.js';
import { jobManager } from '../analysis/jobs.js';
import { AppError } from '../middleware/error.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { buildUserPrompt } from '../analysis/prompt.js';
import { listRules } from '../db/rules.js';
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

  // force=true wipes an existing completed walkthrough (upsertWalkthrough
  // nulls out `data` when force is set) — a destructive action. CLI tokens
  // can start work but never destroy it, so this branch stays cookie-only.
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

  // Create DB row and enqueue job
  const row = await upsertWalkthrough(owner, repo, prNumber, pr.headSha, force);
  jobManager.enqueue(row.id, pr);

  return c.json({ walkthroughId: row.id, status: 'queued' }, 202);
});

/**
 * GET /api/walkthroughs/:owner/:repo/:pr/prompt
 *
 * Returns the exact user prompt the server would feed to its analysis job
 * for this PR — PR metadata, description, configured rules, and the diff,
 * all assembled by the same `buildUserPrompt` helper the analyzer uses.
 * The local-review skill hands this straight to a sub-agent so the review
 * behaves identically to a server-driven run.
 *
 * Inherits requireAuth + requireRepoAccess from the router-level use()
 * calls above — bearer callers reach it, non-collaborators don't.
 */
walkthroughRoutes.get('/:owner/:repo/:pr/prompt', async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));

  if (!owner || !repo) throw new AppError(400, 'Missing route parameters');
  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

  const installationId = await getInstallationForRepo(owner, repo);
  const pr = await getPrMetadata(installationId, owner, repo, prNumber);
  const diff = await getPrDiff(installationId, owner, repo, prNumber);
  const repoRules = await listRules(owner, repo);
  const rules = repoRules.map((r) => ({ ruleNumber: r.ruleNumber, rule: r.rule }));

  const userPrompt = buildUserPrompt(
    pr,
    diff,
    pr.body,
    rules.length > 0 ? rules : undefined,
  );

  return c.json({ userPrompt });
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

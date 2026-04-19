import { Hono } from 'hono';
import { Octokit } from '@octokit/rest';
import { config } from '../config.js';
import { requireAuth, requireRepoAccess } from '../middleware/session.js';
import { AppError } from '../middleware/error.js';
import type { SessionPayload } from '../github/oauth.js';

export const commentRoutes = new Hono();

commentRoutes.use('/:owner/:repo/:pr/*', requireAuth, requireRepoAccess);
commentRoutes.use('/:owner/:repo/:pr', requireAuth, requireRepoAccess);

/**
 * GET /api/comments/:owner/:repo/:pr
 * Fetch all review comments for the PR.
 */
commentRoutes.get('/:owner/:repo/:pr', async (c) => {
  const session = c.get('session') as SessionPayload;
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));

  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

  const octokit = new Octokit({
    baseUrl: config.github.baseUrl,
    auth: session.githubToken,
  });

  const { data } = await octokit.pulls.listReviewComments({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  const comments = data.map((c: any) => ({
    id: c.id,
    body: c.body,
    path: c.path,
    line: c.line ?? c.original_line,
    side: c.side ?? 'RIGHT',
    user: {
      login: c.user?.login ?? 'unknown',
      avatarUrl: c.user?.avatar_url ?? '',
    },
    createdAt: c.created_at,
    inReplyToId: c.in_reply_to_id ?? null,
  }));

  return c.json({ comments });
});

/**
 * POST /api/comments/:owner/:repo/:pr
 * Create a review comment on a specific line.
 */
commentRoutes.post('/:owner/:repo/:pr', async (c) => {
  const session = c.get('session') as SessionPayload;
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));

  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

  const { body, path, line, side, commitId } = await c.req.json<{
    body: string;
    path: string;
    line: number;
    side: 'LEFT' | 'RIGHT';
    commitId: string;
  }>();

  if (!body?.trim()) throw new AppError(400, 'Comment body is required');
  if (!path) throw new AppError(400, 'File path is required');
  if (!line) throw new AppError(400, 'Line number is required');
  if (!commitId) throw new AppError(400, 'Commit ID is required');

  const octokit = new Octokit({
    baseUrl: config.github.baseUrl,
    auth: session.githubToken,
  });

  const { data } = await octokit.pulls.createReviewComment({
    owner,
    repo,
    pull_number: prNumber,
    body: body.trim(),
    path,
    line,
    side: side ?? 'RIGHT',
    commit_id: commitId,
  });

  return c.json({
    comment: {
      id: data.id,
      body: data.body,
      path: data.path,
      line: data.line ?? data.original_line,
      side: data.side ?? 'RIGHT',
      user: {
        login: data.user?.login ?? session.login,
        avatarUrl: data.user?.avatar_url ?? session.avatarUrl,
      },
      createdAt: data.created_at,
      inReplyToId: data.in_reply_to_id ?? null,
    },
  }, 201);
});

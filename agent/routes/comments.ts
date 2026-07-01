import { Hono } from 'hono';
import { Octokit } from '@octokit/rest';
import { config } from '../config.js';
import { requireAuth, requireRepoAccess, requireCookieSession } from '../middleware/session.js';
import { AppError } from '../middleware/error.js';
import type { AppEnv } from '../env.js';

export const commentRoutes = new Hono<AppEnv>();

// All comment routes proxy GitHub as the user (session.githubToken). CLI-token
// callers don't carry a GitHub OAuth token, and by design the CLI surface only
// exposes CruiseLine data — coding agents talk to GitHub directly via `gh`.
commentRoutes.use('/:owner/:repo/:pr/*', requireAuth, requireCookieSession, requireRepoAccess);
commentRoutes.use('/:owner/:repo/:pr', requireAuth, requireCookieSession, requireRepoAccess);

function formatComment(c: any) {
  return {
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
    htmlUrl: c.html_url ?? '',
  };
}

/**
 * GET /api/comments/:owner/:repo/:pr
 * Fetch all review comments for the PR.
 */
commentRoutes.get('/:owner/:repo/:pr', async (c) => {
  const session = c.get('session');
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

  return c.json({ comments: data.map(formatComment) });
});

/**
 * POST /api/comments/:owner/:repo/:pr
 * Create a review comment on a specific line.
 */
commentRoutes.post('/:owner/:repo/:pr', async (c) => {
  const session = c.get('session');
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

  return c.json({ comment: formatComment(data) }, 201);
});

/**
 * POST /api/comments/:owner/:repo/:pr/:commentId/reply
 * Reply to an existing review comment.
 */
commentRoutes.post('/:owner/:repo/:pr/:commentId/reply', async (c) => {
  const session = c.get('session');
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));
  const commentId = Number(c.req.param('commentId'));

  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');
  if (isNaN(commentId)) throw new AppError(400, 'Invalid comment ID');

  const { body } = await c.req.json<{ body: string }>();
  if (!body?.trim()) throw new AppError(400, 'Reply body is required');

  const octokit = new Octokit({
    baseUrl: config.github.baseUrl,
    auth: session.githubToken,
  });

  const { data } = await octokit.pulls.createReplyForReviewComment({
    owner,
    repo,
    pull_number: prNumber,
    comment_id: commentId,
    body: body.trim(),
  });

  return c.json({ comment: formatComment(data) }, 201);
});

import { Hono } from 'hono';
import { requireAuth, requireRepoAccess } from '../middleware/session.js';
import { AppError } from '../middleware/error.js';
import { sandboxFileContent, sandboxRepoPath } from '../sandbox-client.js';

export const fileRoutes = new Hono();

fileRoutes.use('/:owner/:repo/:pr/*', requireAuth, requireRepoAccess);

/**
 * GET /api/files/:owner/:repo/:pr/content?path=some/file.ts
 * Returns file content and metadata for a single file from the PR clone.
 * Proxied through the sandbox container which owns the repo clones.
 */
fileRoutes.get('/:owner/:repo/:pr/content', async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));
  const filePath = c.req.query('path');

  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');
  if (!filePath) throw new AppError(400, 'path query parameter is required');

  // Normalize the path: strip leading ./ or /, collapse double slashes
  let normalizedPath = filePath
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .replace(/\/+/g, '/');

  // Prevent directory traversal
  if (normalizedPath.includes('..')) {
    throw new AppError(400, 'Invalid file path');
  }

  const repoPath = sandboxRepoPath(owner, repo, prNumber);

  try {
    const result = await sandboxFileContent(repoPath, normalizedPath);
    return c.json(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) {
      throw new AppError(404, 'File not found');
    }
    throw new AppError(502, 'Failed to read file from sandbox');
  }
});

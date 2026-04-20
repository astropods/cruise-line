import { Hono } from 'hono';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { requireAuth, requireRepoAccess } from '../middleware/session.js';
import { AppError } from '../middleware/error.js';
import { getRepoDir } from '../repo/manager.js';

export const fileRoutes = new Hono();

fileRoutes.use('/:owner/:repo/:pr/*', requireAuth, requireRepoAccess);

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  java: 'java', kt: 'kotlin', swift: 'swift', cs: 'csharp',
  cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
  sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash',
  yml: 'yaml', yaml: 'yaml', json: 'json', toml: 'toml',
  md: 'markdown', css: 'css', scss: 'scss', html: 'html',
  xml: 'xml', graphql: 'graphql', proto: 'protobuf',
  dockerfile: 'dockerfile', makefile: 'makefile',
};

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const basename = filePath.split('/').pop()?.toLowerCase() ?? '';
  if (basename === 'dockerfile') return 'dockerfile';
  if (basename === 'makefile') return 'makefile';
  return LANGUAGE_MAP[ext] ?? ext;
}

/**
 * GET /api/files/:owner/:repo/:pr/content?path=some/file.ts
 * Returns file content and metadata for a single file from the PR clone.
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

  const repoDir = getRepoDir(owner, repo, prNumber);
  const filePathToRead = normalizedPath;

  let after: string | undefined;
  try {
    after = await readFile(join(repoDir, filePathToRead), 'utf-8');
  } catch {
    // File doesn't exist at HEAD — might be deleted
  }

  // Get the diff patch for this file — try multiple base ref formats
  let patch: string | undefined;
  for (const baseRef of ['origin/main', 'origin/master', 'FETCH_HEAD']) {
    try {
      const proc = Bun.spawn(
        ['git', 'diff', `${baseRef}...HEAD`, '--', filePathToRead],
        { cwd: repoDir, stdout: 'pipe', stderr: 'pipe' },
      );
      const exitCode = await proc.exited;
      if (exitCode === 0) {
        const output = await new Response(proc.stdout).text();
        if (output.trim()) { patch = output; break; }
      }
    } catch {
      continue;
    }
  }

  if (!after && !patch) {
    throw new AppError(404, 'File not found');
  }

  return c.json({
    after,
    language: detectLanguage(filePathToRead),
    patch,
  });
});

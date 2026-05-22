/**
 * Chat Sandbox — Isolated Claude Agent SDK runner.
 *
 * This container has NO access to databases, GitHub tokens, app source code,
 * or session secrets. It only has:
 *   - ANTHROPIC_API_KEY (for Claude API calls)
 *   - Persistent /data volume (repo clones + session files)
 *   - git (for repo operations)
 *
 * The main agent calls this via HTTP to run chat/analysis queries in isolation.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { query, getSessionMessages, getSessionInfo } from '@anthropic-ai/claude-agent-sdk';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { symlink, readlink, lstat, mkdir, rm } from 'fs/promises';
import { join, resolve } from 'path';

const app = new Hono();

const DATA_ROOT = resolve(process.env.DATA_ROOT ?? '/data');
const REPOS_ROOT = join(DATA_ROOT, 'repos');
const SESSIONS_ROOT = join(DATA_ROOT, 'sessions');
const PORT = Number(process.env.PORT ?? 3000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validate that a repo path is within our repos directory */
function validateRepoPath(repoPath: string): boolean {
  const normalized = resolve(repoPath);
  return normalized.startsWith(REPOS_ROOT);
}

/** Resolve a relative-or-absolute repo path to an absolute path under REPOS_ROOT */
function resolveRepoPath(repoPath: string): string {
  if (repoPath.startsWith('/')) return repoPath;
  return join(REPOS_ROOT, repoPath);
}

/** Derive session dir from repo path: /data/repos/a/b/1 → /data/sessions/a/b/1 */
function sessionDirFromRepoPath(repoPath: string): string {
  const relative = repoPath.slice(REPOS_ROOT.length); // /a/b/1
  return join(SESSIONS_ROOT, relative);
}

/** Ensure .claude/ symlink in repo points to session dir */
async function ensureSymlink(repoDir: string, sessionDir: string): Promise<void> {
  await mkdir(sessionDir, { recursive: true });
  const linkPath = join(repoDir, '.claude');

  try {
    const stat = await lstat(linkPath);
    if (stat.isSymbolicLink()) {
      const target = await readlink(linkPath);
      if (target === sessionDir) return;
    }
    await rm(linkPath, { recursive: true, force: true });
  } catch { /* doesn't exist */ }

  await symlink(sessionDir, linkPath);
}

/** Reset working tree to clean state */
async function resetRepo(repoDir: string): Promise<void> {
  const checkout = Bun.spawn(['git', 'checkout', '.'], { cwd: repoDir, stdout: 'pipe', stderr: 'pipe' });
  await checkout.exited;
  const clean = Bun.spawn(['git', 'clean', '-fd'], { cwd: repoDir, stdout: 'pipe', stderr: 'pipe' });
  await clean.exited;
}

/** Run a shell command and return stdout/stderr/ok */
async function exec(cmd: string[], cwd?: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { ok: exitCode === 0, stdout: stdout.trim(), stderr: stderr.trim() };
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const result = await exec(['git', 'rev-parse', '--git-dir'], dir);
    return result.ok;
  } catch {
    return false;
  }
}

async function getCurrentSha(dir: string): Promise<string | null> {
  const result = await exec(['git', 'rev-parse', 'HEAD'], dir);
  return result.ok ? result.stdout : null;
}

// Per-PR mutex to prevent concurrent clone operations
const cloneLocks = new Map<string, Promise<void>>();

async function withCloneLock<T>(repoDir: string, fn: () => Promise<T>): Promise<T> {
  const existing = cloneLocks.get(repoDir);
  if (existing) await existing;

  let resolveLock: () => void;
  const lock = new Promise<void>((r) => { resolveLock = r; });
  cloneLocks.set(repoDir, lock);

  try {
    return await fn();
  } finally {
    cloneLocks.delete(repoDir);
    resolveLock!();
  }
}

/** Extract human-readable detail from tool input */
function formatToolDetail(name: string, input: Record<string, any>): string {
  switch (name) {
    case 'Read': return input.file_path ?? '';
    case 'Bash': return String(input.command ?? '').slice(0, 150);
    case 'Grep': return `/${input.pattern ?? ''}/ ${input.path ? 'in ' + input.path : ''}`.trim();
    case 'Glob': return `${input.pattern ?? ''} ${input.path ? 'in ' + input.path : ''}`.trim();
    case 'Write':
    case 'Edit': return input.file_path ?? '';
    default: return input.file_path ?? input.path ?? input.pattern ?? '';
  }
}

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

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get('/health', (c) => c.json({ ok: true }));

// ---------------------------------------------------------------------------
// POST /ensure-clone — Clone or update a repo in the sandbox volume.
// ---------------------------------------------------------------------------

app.post('/ensure-clone', async (c) => {
  const { cloneUrl, repoPath, headSha, headRef, prNumber, baseRef } = await c.req.json<{
    cloneUrl: string;
    repoPath: string;
    headSha: string;
    headRef: string;
    prNumber?: number;
    baseRef?: string;
  }>();

  if (!cloneUrl || !repoPath || !headSha || !headRef) {
    return c.json({ error: 'cloneUrl, repoPath, headSha, and headRef are required' }, 400);
  }

  const repoDir = resolveRepoPath(repoPath);
  if (!validateRepoPath(repoDir)) {
    return c.json({ error: 'Invalid repoPath' }, 403);
  }

  try {
    await withCloneLock(repoDir, async () => {
      // Check if clone exists at correct SHA
      if (await isGitRepo(repoDir)) {
        const currentSha = await getCurrentSha(repoDir);
        if (currentSha === headSha) {
          // Already at correct SHA — just ensure symlink
          await ensureSymlink(repoDir, sessionDirFromRepoPath(repoDir));
          return;
        }

        // Try to update — fetch PR ref (works for forks) with branch fallback
        const fetchArgs = prNumber
          ? ['git', 'fetch', 'origin', '--depth=50', `+refs/pull/${prNumber}/head:refs/remotes/origin/pr-head`]
          : ['git', 'fetch', 'origin', '--depth=50'];
        const fetchResult = await exec(fetchArgs, repoDir);
        if (fetchResult.ok) {
          const checkoutResult = await exec(['git', 'checkout', headSha], repoDir);
          if (checkoutResult.ok) {
            await ensureSymlink(repoDir, sessionDirFromRepoPath(repoDir));
            return;
          }
        }
        // Update failed — fall through to fresh clone
      }

      // Fresh clone
      await mkdir(repoDir, { recursive: true });
      await rm(repoDir, { recursive: true, force: true });
      await mkdir(repoDir, { recursive: true });

      // Clone the base repo, then fetch the PR head ref (works for fork PRs
      // where headRef branch only exists on the fork, not the base repo).
      const cloneResult = await exec(
        ['git', 'clone', '--depth=50', cloneUrl, '.'],
        repoDir,
      );
      if (!cloneResult.ok) {
        throw new Error(`git clone failed: ${cloneResult.stderr}`);
      }

      // Fetch the PR head — refs/pull/N/head always exists on the base repo
      if (prNumber) {
        await exec(
          ['git', 'fetch', 'origin', '--depth=50', `+refs/pull/${prNumber}/head:refs/remotes/origin/pr-head`],
          repoDir,
        );
      }
      await exec(['git', 'checkout', headSha], repoDir);
      await ensureSymlink(repoDir, sessionDirFromRepoPath(repoDir));
    });

    // Fetch base branch and compute diff (outside the clone lock)
    let diff = '';
    if (baseRef) {
      await exec(
        ['git', 'fetch', 'origin', `+refs/heads/${baseRef}:refs/remotes/origin/${baseRef}`],
        repoDir,
      );

      for (const diffCmd of [
        ['git', 'diff', `origin/${baseRef}...HEAD`],
        ['git', 'diff', `origin/${baseRef}..HEAD`],
        ['git', 'diff', `origin/${baseRef}`, 'HEAD'],
      ]) {
        const result = await exec(diffCmd, repoDir);
        if (result.ok && result.stdout.trim()) {
          diff = result.stdout;
          break;
        }
      }
    }

    return c.json({ ok: true, repoDir, diff });
  } catch (err) {
    // Self-heal: retry with a fresh clone
    try {
      await rm(repoDir, { recursive: true, force: true }).catch(() => {});
      await mkdir(repoDir, { recursive: true });
      const cloneResult = await exec(
        ['git', 'clone', '--depth=50', cloneUrl, '.'],
        repoDir,
      );
      if (!cloneResult.ok) throw new Error(cloneResult.stderr);
      if (prNumber) {
        await exec(
          ['git', 'fetch', 'origin', '--depth=50', `+refs/pull/${prNumber}/head:refs/remotes/origin/pr-head`],
          repoDir,
        );
      }
      await exec(['git', 'checkout', headSha], repoDir);
      await ensureSymlink(repoDir, sessionDirFromRepoPath(repoDir));
      return c.json({ ok: true, repoDir, diff: '' });
    } catch (retryErr) {
      return c.json({
        error: retryErr instanceof Error ? retryErr.message : 'Clone failed',
      }, 500);
    }
  }
});

// ---------------------------------------------------------------------------
// POST /query — Run a Claude Agent SDK query (chat or analysis).
// ---------------------------------------------------------------------------

app.post('/query', async (c) => {
  const {
    prompt, systemPrompt, sessionId, repoPath, model, maxTurns,
    outputFormat, allowedTools,
  } = await c.req.json<{
    prompt: string;
    systemPrompt: string;
    sessionId?: string;
    repoPath: string;
    model?: string;
    maxTurns?: number;
    outputFormat?: { type: string; schema: object };
    allowedTools?: string[];
  }>();

  if (!prompt || !repoPath) {
    return c.json({ error: 'prompt and repoPath are required' }, 400);
  }

  const repoDir = resolveRepoPath(repoPath);
  if (!validateRepoPath(repoDir)) {
    return c.json({ error: 'Invalid repoPath' }, 403);
  }

  if (!existsSync(repoDir)) {
    return c.json({ error: 'Repo not found at path' }, 404);
  }

  // Prepare repo
  await resetRepo(repoDir);
  const sessionDir = sessionDirFromRepoPath(repoDir);
  await ensureSymlink(repoDir, sessionDir);

  // Determine if this is a new or resumed session (chat mode only)
  let isResume = false;
  if (sessionId) {
    try {
      const info = await getSessionInfo(sessionId, { dir: repoDir });
      isResume = !!info;
    } catch { /* session doesn't exist yet */ }
  }

  return streamSSE(c, async (stream) => {
    // Heartbeat to keep connection alive
    const heartbeat = setInterval(async () => {
      try {
        await stream.writeSSE({ data: JSON.stringify({ type: 'heartbeat' }) });
      } catch { clearInterval(heartbeat); }
    }, 5000);

    try {
      const options: any = {
        cwd: repoDir,
        systemPrompt,
        model: model ?? 'claude-sonnet-4-5',
        tools: allowedTools ?? ['Read', 'Glob', 'Grep', 'Bash'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        maxTurns: maxTurns ?? 15,
      };

      // Structured output for analysis mode
      if (outputFormat) {
        options.outputFormat = outputFormat;
      }

      // Session handling (chat mode)
      if (sessionId) {
        if (isResume) {
          options.resume = sessionId;
        } else {
          options.sessionId = sessionId;
        }
      }

      for await (const msg of query({ prompt, options })) {
        const m = msg as any;

        if (m.type === 'assistant') {
          const blocks = m.message?.content ?? [];
          for (const block of blocks) {
            if (block.type === 'text' && block.text) {
              await stream.writeSSE({
                data: JSON.stringify({ type: 'text', content: block.text }),
              });
            } else if (block.type === 'tool_use') {
              await stream.writeSSE({
                data: JSON.stringify({
                  type: 'tool_call',
                  name: block.name,
                  detail: formatToolDetail(block.name, block.input ?? {}),
                  input: block.input,
                }),
              });
            }
          }
        } else if (m.type === 'result') {
          if (m.subtype === 'success') {
            const donePayload: any = {
              type: 'done',
              text: m.result ?? '',
              numTurns: m.num_turns,
              costUsd: m.total_cost_usd,
            };
            if (outputFormat && m.structured_output) {
              donePayload.structuredOutput = m.structured_output;
            }
            await stream.writeSSE({ data: JSON.stringify(donePayload) });
          } else {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'error', message: `Stopped: ${m.subtype}` }),
            });
          }
        }
      }
    } catch (err) {
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'error',
          message: err instanceof Error ? err.message : 'Sandbox query failed',
        }),
      });
    }

    clearInterval(heartbeat);
  });
});

// ---------------------------------------------------------------------------
// POST /file-content — Read a single file + diff patch from a cloned repo.
// ---------------------------------------------------------------------------

app.post('/file-content', async (c) => {
  const { repoPath, filePath, baseRef } = await c.req.json<{
    repoPath: string;
    filePath: string;
    baseRef?: string;
  }>();

  if (!repoPath || !filePath) {
    return c.json({ error: 'repoPath and filePath are required' }, 400);
  }

  // Prevent directory traversal
  const normalizedPath = filePath.replace(/^\.\//, '').replace(/^\//, '').replace(/\/+/g, '/');
  if (normalizedPath.includes('..')) {
    return c.json({ error: 'Invalid file path' }, 400);
  }

  const repoDir = resolveRepoPath(repoPath);
  if (!validateRepoPath(repoDir)) {
    return c.json({ error: 'Invalid repoPath' }, 403);
  }

  let after: string | undefined;
  try {
    after = await readFile(join(repoDir, normalizedPath), 'utf-8');
  } catch {
    // File doesn't exist at HEAD — might be deleted
  }

  // Compute diff patch
  let patch: string | undefined;
  const refsToTry = baseRef
    ? [`origin/${baseRef}`, baseRef, 'FETCH_HEAD']
    : ['origin/main', 'origin/master', 'FETCH_HEAD'];

  for (const ref of refsToTry) {
    const result = await exec(
      ['git', 'diff', `${ref}...HEAD`, '--', normalizedPath],
      repoDir,
    );
    if (result.ok && result.stdout.trim()) {
      patch = result.stdout;
      break;
    }
  }

  if (!after && !patch) {
    return c.json({ error: 'File not found' }, 404);
  }

  return c.json({ after, language: detectLanguage(normalizedPath), patch });
});

// ---------------------------------------------------------------------------
// POST /collect-files — Batch read files + patches for post-analysis.
// ---------------------------------------------------------------------------

app.post('/collect-files', async (c) => {
  const { repoPath, baseRef, filePaths } = await c.req.json<{
    repoPath: string;
    baseRef: string;
    filePaths: string[];
  }>();

  if (!repoPath || !baseRef || !filePaths?.length) {
    return c.json({ error: 'repoPath, baseRef, and filePaths are required' }, 400);
  }

  const repoDir = resolveRepoPath(repoPath);
  if (!validateRepoPath(repoDir)) {
    return c.json({ error: 'Invalid repoPath' }, 403);
  }

  const files: Record<string, { after?: string; language: string; patch?: string }> = {};

  await Promise.all(
    filePaths.map(async (fp) => {
      const normalizedPath = fp.replace(/^\.\//, '').replace(/^\//, '').replace(/\/+/g, '/');
      if (normalizedPath.includes('..')) return;

      const [afterResult, patchResult] = await Promise.all([
        readFile(join(repoDir, normalizedPath), 'utf-8').catch(() => undefined),
        (async () => {
          for (const ref of [baseRef, `origin/${baseRef}`, 'FETCH_HEAD']) {
            const result = await exec(
              ['git', 'diff', `${ref}...HEAD`, '--', normalizedPath],
              repoDir,
            );
            if (result.ok && result.stdout.trim()) return result.stdout;
          }
          return undefined;
        })(),
      ]);

      files[fp] = {
        after: afterResult,
        language: detectLanguage(normalizedPath),
        patch: patchResult,
      };
    }),
  );

  return c.json({ files });
});

// ---------------------------------------------------------------------------
// POST /cleanup — Remove a clone and its session data.
// ---------------------------------------------------------------------------

app.post('/cleanup', async (c) => {
  const { repoPath } = await c.req.json<{ repoPath: string }>();

  if (!repoPath) {
    return c.json({ error: 'repoPath is required' }, 400);
  }

  const repoDir = resolveRepoPath(repoPath);
  if (!validateRepoPath(repoDir)) {
    return c.json({ error: 'Invalid repoPath' }, 403);
  }

  const sessionDir = sessionDirFromRepoPath(repoDir);
  await rm(repoDir, { recursive: true, force: true }).catch(() => {});
  await rm(sessionDir, { recursive: true, force: true }).catch(() => {});

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /session-messages — Retrieve conversation history from SDK session files.
// ---------------------------------------------------------------------------

app.post('/session-messages', async (c) => {
  const { sessionId, repoPath } = await c.req.json<{
    sessionId: string;
    repoPath: string;
  }>();

  const repoDir = resolveRepoPath(repoPath);
  if (!validateRepoPath(repoDir)) {
    return c.json({ messages: [] });
  }

  if (!existsSync(repoDir)) {
    return c.json({ messages: [] });
  }

  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
    const fetch = getSessionMessages(sessionId, { dir: repoDir });
    const raw = await Promise.race([fetch, timeout]);

    if (!raw) return c.json({ messages: [] });

    const messages = raw.map(formatSessionMessage).filter(Boolean);
    return c.json({ messages });
  } catch {
    return c.json({ messages: [] });
  }
});

function formatSessionMessage(msg: any): any {
  if (msg.type === 'user' && !msg.isSynthetic) {
    const content = msg.message?.content;
    let text = '';
    if (typeof content === 'string') text = content;
    else if (Array.isArray(content)) {
      text = content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    }
    if (!text) return null;
    return { type: 'user', content: text };
  }

  if (msg.type === 'assistant') {
    const blocks = msg.message?.content ?? msg.content ?? [];
    const parts: any[] = [];
    for (const block of (Array.isArray(blocks) ? blocks : [])) {
      if (block.type === 'text' && block.text) {
        parts.push({ type: 'text', content: block.text });
      } else if (block.type === 'tool_use') {
        parts.push({
          type: 'tool_call',
          name: block.name,
          detail: formatToolDetail(block.name, block.input ?? {}),
          input: block.input,
        });
      }
    }
    if (parts.length === 0) return null;
    return { type: 'assistant', parts };
  }

  if (msg.type === 'result' && msg.subtype === 'success' && msg.result) {
    return { type: 'result', content: msg.result };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

Bun.serve({
  port: PORT,
  fetch: app.fetch,
  idleTimeout: 30, // Heartbeats keep SSE alive
});

console.log(`Chat sandbox listening on :${PORT}`);

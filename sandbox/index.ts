/**
 * Chat Sandbox — Isolated Claude Agent SDK runner.
 *
 * This container has NO access to databases, GitHub tokens, app source code,
 * or session secrets. It only has:
 *   - ANTHROPIC_API_KEY (for Claude API calls)
 *   - Shared /data volume (repo clones + session files)
 *   - git (for repo operations)
 *
 * The main agent calls this via HTTP to run chat queries in isolation.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { query, getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import { existsSync } from 'fs';
import { symlink, readlink, lstat, mkdir, rm } from 'fs/promises';
import { join, resolve } from 'path';

const app = new Hono();

const DATA_ROOT = resolve(process.env.DATA_ROOT ?? '/data');
const REPOS_ROOT = join(DATA_ROOT, 'repos');
const SESSIONS_ROOT = join(DATA_ROOT, 'sessions');
const PORT = Number(process.env.PORT ?? 3000);

/** Validate that a repo path is within our repos directory */
function validateRepoPath(repoPath: string): boolean {
  const normalized = resolve(repoPath);
  return normalized.startsWith(REPOS_ROOT);
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

// Health check
app.get('/health', (c) => c.json({ ok: true }));

/**
 * POST /query — Run a Claude Agent SDK query in the sandbox.
 * Streams results back as SSE.
 */
app.post('/query', async (c) => {
  const { prompt, systemPrompt, sessionId, repoPath, model, maxTurns } = await c.req.json<{
    prompt: string;
    systemPrompt: string;
    sessionId: string;
    repoPath: string;
    model?: string;
    maxTurns?: number;
  }>();

  if (!prompt || !repoPath) {
    return c.json({ error: 'prompt and repoPath are required' }, 400);
  }

  if (!validateRepoPath(repoPath)) {
    return c.json({ error: 'Invalid repoPath' }, 403);
  }

  if (!existsSync(repoPath)) {
    return c.json({ error: 'Repo not found at path' }, 404);
  }

  // Prepare repo
  await resetRepo(repoPath);
  const sessionDir = sessionDirFromRepoPath(repoPath);
  await ensureSymlink(repoPath, sessionDir);

  // Determine if this is a new or resumed session
  const sessionFile = join(sessionDir, 'sessions', sessionId);
  const isResume = existsSync(join(sessionDir, 'projects'));

  return streamSSE(c, async (stream) => {
    // Heartbeat to keep connection alive
    const heartbeat = setInterval(async () => {
      try {
        await stream.writeSSE({ data: JSON.stringify({ type: 'heartbeat' }) });
      } catch { clearInterval(heartbeat); }
    }, 5000);

    try {
      const options: any = {
        cwd: repoPath,
        systemPrompt,
        model: model ?? 'claude-sonnet-4-5',
        allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
        permissionMode: 'bypassPermissions',
        maxTurns: maxTurns ?? 15,
      };

      if (isResume) {
        options.resume = sessionId;
      } else {
        options.sessionId = sessionId;
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
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'done',
                text: m.result ?? '',
                numTurns: m.num_turns,
                costUsd: m.total_cost_usd,
              }),
            });
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

/**
 * POST /session-messages — Retrieve conversation history from SDK session files.
 */
app.post('/session-messages', async (c) => {
  const { sessionId, repoPath } = await c.req.json<{
    sessionId: string;
    repoPath: string;
  }>();

  if (!repoPath || !validateRepoPath(repoPath)) {
    return c.json({ messages: [] });
  }

  if (!existsSync(repoPath)) {
    return c.json({ messages: [] });
  }

  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
    const fetch = getSessionMessages(sessionId, { dir: repoPath });
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

// Start
Bun.serve({
  port: PORT,
  fetch: app.fetch,
  idleTimeout: 30, // Heartbeats keep SSE alive
});

console.log(`Chat sandbox listening on :${PORT}`);

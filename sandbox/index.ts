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
// Import the SDK via telemetry.ts so OpenInference can instrument it before use.
import {
  query,
  getSessionMessages,
  getSessionInfo,
  getTelemetryStatus,
  runTelemetryTest,
} from './telemetry.js';
import type { HookCallback } from '@astropods/adapter-claude-agent-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { existsSync } from 'fs';
import { symlink, readlink, lstat, mkdir, rm, writeFile } from 'fs/promises';
import { join, relative, resolve } from 'path';
import {
  cleanGitConfig, gitEnv, readRepoFile, redactCredentials, repoDirFor, repoFilePath, splitCloneUrl, toolStaysInRepo,
} from './paths.js';

const app = new Hono();

const DATA_ROOT = resolve(process.env.DATA_ROOT ?? '/data');
const REPOS_ROOT = join(DATA_ROOT, 'repos');
const SESSIONS_ROOT = join(DATA_ROOT, 'sessions');
const PORT = Number(process.env.PORT ?? 3000);
// Set in dev so only this machine can reach the sandbox
const HOSTNAME = process.env.HOST ?? '0.0.0.0';
// When set, every request but /health must carry it. The agent sends it from
// its own SANDBOX_TOKEN.
const SANDBOX_TOKEN = process.env.SANDBOX_TOKEN;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive session dir from repo path: /data/repos/a/b/1 → /data/sessions/a/b/1 */
function sessionDirFromRepoPath(repoDir: string): string {
  return join(SESSIONS_ROOT, relative(REPOS_ROOT, repoDir));
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

/** Reset the working tree to the commit, including ignored files a previous run left behind */
async function resetRepo(repoDir: string): Promise<void> {
  await exec(['git', 'checkout', '.'], repoDir);
  await exec(['git', 'clean', '-ffdx', '-e', '.claude'], repoDir);
}

/** Run a command and return stdout/stderr/ok. git always runs with gitEnv's protections. */
async function exec(
  cmd: string[],
  cwd?: string,
  env?: Record<string, string>,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const gitDefaults = cmd[0] === 'git' ? gitEnv() : {};
  const proc = Bun.spawn(cmd, { cwd, env: { ...process.env, ...gitDefaults, ...env }, stdout: 'pipe', stderr: 'pipe' });
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

/** Fetch the PR head ref (or all branches if no prNumber) and checkout the target SHA. */
async function fetchPrAndCheckout(
  repoDir: string,
  headSha: string,
  prNumber: number | undefined,
  auth: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  const fetchArgs = prNumber
    ? ['git', 'fetch', 'origin', '--depth=50', `+refs/pull/${prNumber}/head:refs/remotes/origin/pr-head`]
    : ['git', 'fetch', 'origin', '--depth=50'];
  const fetchResult = await exec(fetchArgs, repoDir, auth);
  if (!fetchResult.ok) {
    return { ok: false, error: `fetch failed: ${fetchResult.stderr}` };
  }
  const checkoutResult = await exec(['git', 'checkout', headSha], repoDir);
  if (!checkoutResult.ok) {
    return { ok: false, error: `checkout failed: ${checkoutResult.stderr}` };
  }
  return { ok: true };
}

// Per-PR queue so clone operations on one checkout run one at a time
const cloneLocks = new Map<string, Promise<void>>();

async function withCloneLock<T>(repoDir: string, fn: () => Promise<T>): Promise<T> {
  // Each caller waits on the one before it, so three callers can't wake together
  const run = (cloneLocks.get(repoDir) ?? Promise.resolve()).then(fn);
  const tail = run.then(() => {}, () => {});
  cloneLocks.set(repoDir, tail);
  try {
    return await run;
  } finally {
    if (cloneLocks.get(repoDir) === tail) cloneLocks.delete(repoDir);
  }
}

/** Clone into an empty repoDir and check out the PR head */
async function freshClone(
  repoDir: string,
  url: string,
  headSha: string,
  prNumber: number | undefined,
  auth: Record<string, string>,
): Promise<void> {
  await rm(repoDir, { recursive: true, force: true });
  await mkdir(repoDir, { recursive: true });
  // Clone the base repo, then fetch the PR head ref (works for fork PRs
  // where headRef branch only exists on the fork, not the base repo).
  const cloneResult = await exec(['git', 'clone', '--depth=50', '--', url, '.'], repoDir, auth);
  if (!cloneResult.ok) throw new Error(`git clone failed: ${cloneResult.stderr}`);
  const checkout = await fetchPrAndCheckout(repoDir, headSha, prNumber, auth);
  if (!checkout.ok) throw new Error(`Post-clone setup failed: ${checkout.error}`);
}

const READ_ONLY_TOOLS = ['Read', 'Glob', 'Grep'];
// Reviews ask for 60; this only stops a caller asking for unbounded runs
const MAX_TURNS = 100;

/** PreToolUse hook that denies file tools pointed outside the checkout */
function confineToRepo(repoDir: string): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PreToolUse') return {};
    const allowed = await toolStaysInRepo(repoDir, input.tool_name, (input.tool_input ?? {}) as Record<string, unknown>);
    if (allowed) return {};
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'Only files inside this repository can be read.',
      },
    };
  };
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

if (SANDBOX_TOKEN) {
  app.use('*', async (c, next) => {
    if (c.req.header('x-sandbox-token') !== SANDBOX_TOKEN) return c.json({ error: 'Unauthorized' }, 401);
    await next();
  });
} else {
  console.warn('SANDBOX_TOKEN is not set; the sandbox accepts requests from anyone who can reach it');
}

// ---------------------------------------------------------------------------
// GET /models — Models this API key can use, for the admin model picker.
// Lives here because the sandbox holds the Anthropic credentials.
// ---------------------------------------------------------------------------

const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
const MODELS_TTL_MS = 10 * 60_000;
let modelsCache: { at: number; models: unknown[] } | null = null;
let anthropic: Anthropic | null = null;

app.get('/models', async (c) => {
  if (modelsCache && Date.now() - modelsCache.at < MODELS_TTL_MS) {
    return c.json({ models: modelsCache.models });
  }
  try {
    anthropic ??= new Anthropic();
    const models = [];
    for await (const m of anthropic.models.list({ limit: 1000 })) {
      const effort = m.capabilities?.effort;
      models.push({
        id: m.id,
        displayName: m.display_name,
        createdAt: m.created_at,
        // null when the API doesn't report capabilities for this model
        effortLevels: effort
          ? effort.supported
            ? EFFORT_LEVELS.filter((l) => effort[l]?.supported)
            : []
          : null,
      });
    }
    modelsCache = { at: Date.now(), models };
    return c.json({ models });
  } catch (err) {
    console.error('Failed to list models:', err);
    return c.json({ error: err instanceof Error ? err.message : 'Failed to list models' }, 502);
  }
});

// ---------------------------------------------------------------------------
// Telemetry diagnostics — proxied through the agent at /api/debug/telemetry.
// ---------------------------------------------------------------------------

app.get('/telemetry-status', (c) => c.json(getTelemetryStatus()));

app.post('/telemetry-test', async (c) => {
  const result = await runTelemetryTest();
  return c.json(result);
});

// ---------------------------------------------------------------------------
// POST /ensure-clone — Clone or update a repo in the sandbox volume.
// ---------------------------------------------------------------------------

app.post('/ensure-clone', async (c) => {
  const { cloneUrl, repoPath, headSha, headRef, prNumber, baseRef, token } = await c.req.json<{
    /** https URL of the base repo; credentials go in `token`, not the URL */
    cloneUrl: string;
    repoPath: string;
    headSha: string;
    headRef: string;
    prNumber?: number;
    baseRef?: string;
    token?: string;
  }>();

  if (!cloneUrl || !repoPath || !headSha || !headRef) {
    return c.json({ error: 'cloneUrl, repoPath, headSha, and headRef are required' }, 400);
  }

  const remote = splitCloneUrl(cloneUrl);
  if (!remote) return c.json({ error: 'cloneUrl must be an https URL' }, 400);
  const repoDir = repoDirFor(REPOS_ROOT, repoPath);
  if (!repoDir) return c.json({ error: 'Invalid repoPath' }, 403);

  // Older agents put the token in the URL; accept it there but never store it
  const secret = token ?? remote.token;
  const auth = secret ? gitEnv({ token: secret, remoteUrl: remote.url }) : gitEnv();

  try {
    await withCloneLock(repoDir, async () => {
      try {
        if (await isGitRepo(repoDir)) {
          // Back to a config we wrote: drops old tokens in URLs and anything planted since
          await writeFile(join(repoDir, '.git', 'config'), cleanGitConfig(remote.url));
          if ((await getCurrentSha(repoDir)) === headSha) return;
          // Try to update — fetch PR ref (works for forks) with branch fallback
          if ((await fetchPrAndCheckout(repoDir, headSha, prNumber, auth)).ok) return;
          // Update failed — fall through to fresh clone
        }
        await freshClone(repoDir, remote.url, headSha, prNumber, auth);
      } catch {
        // Self-heal: one more fresh clone, inside the lock so no one else is using the checkout
        await freshClone(repoDir, remote.url, headSha, prNumber, auth);
      } finally {
        if (await isGitRepo(repoDir)) await ensureSymlink(repoDir, sessionDirFromRepoPath(repoDir));
      }
    });

    // Fetch base branch and compute diff (outside the clone lock)
    let diff = '';
    if (baseRef) {
      await exec(
        ['git', 'fetch', 'origin', `+refs/heads/${baseRef}:refs/remotes/origin/${baseRef}`],
        repoDir,
        auth,
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
    const message = err instanceof Error ? err.message : 'Clone failed';
    return c.json({ error: redactCredentials(message, secret) }, 500);
  }
});

// ---------------------------------------------------------------------------
// POST /query — Run a Claude Agent SDK query (chat or analysis).
// ---------------------------------------------------------------------------

app.post('/query', async (c) => {
  const {
    prompt, systemPrompt, sessionId, repoPath, model, effort, maxTurns,
    outputFormat, allowedTools,
  } = await c.req.json<{
    prompt: string;
    systemPrompt: string;
    sessionId?: string;
    repoPath: string;
    model?: string;
    effort?: string;
    maxTurns?: number;
    outputFormat?: { type: string; schema: object };
    allowedTools?: string[];
  }>();

  if (!prompt || !repoPath) {
    return c.json({ error: 'prompt and repoPath are required' }, 400);
  }

  const repoDir = repoDirFor(REPOS_ROOT, repoPath);
  if (!repoDir) return c.json({ error: 'Invalid repoPath' }, 403);

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
    // The agent hangs up when it gives up on a run (timeout, failed review);
    // stop the run with it instead of spending turns nobody will read
    const abortController = new AbortController();
    stream.onAbort(() => abortController.abort());

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
        model: model ?? 'claude-opus-5-5',
        // Read-only unless the caller asks for more (chat still asks for Bash)
        tools: allowedTools ?? READ_ONLY_TOOLS,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        // Don't load CLAUDE.md, settings, or hooks from the repo under review
        settingSources: [],
        hooks: { PreToolUse: [{ matcher: 'Read|Glob|Grep', hooks: [confineToRepo(repoDir)] }] },
        maxTurns: Math.min(maxTurns ?? 15, MAX_TURNS),
        abortController,
      };

      // Unknown levels are dropped rather than failing the query
      if (effort && (EFFORT_LEVELS as readonly string[]).includes(effort)) {
        options.effort = effort;
      }

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
      // An aborted run has no one left to tell
      if (!abortController.signal.aborted) {
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'error',
            message: err instanceof Error ? err.message : 'Sandbox query failed',
          }),
        });
      }
    } finally {
      clearInterval(heartbeat);
    }
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

  const normalizedPath = repoFilePath(filePath);
  if (!normalizedPath) return c.json({ error: 'Invalid file path' }, 400);
  const repoDir = repoDirFor(REPOS_ROOT, repoPath);
  if (!repoDir) return c.json({ error: 'Invalid repoPath' }, 403);

  // Undefined when the file was deleted at HEAD
  const after = await readRepoFile(repoDir, normalizedPath);

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

  const repoDir = repoDirFor(REPOS_ROOT, repoPath);
  if (!repoDir) return c.json({ error: 'Invalid repoPath' }, 403);

  const files: Record<string, { after?: string; language: string; patch?: string }> = {};

  await Promise.all(
    filePaths.map(async (fp) => {
      const normalizedPath = repoFilePath(fp);
      if (!normalizedPath) return;

      const [afterResult, patchResult] = await Promise.all([
        readRepoFile(repoDir, normalizedPath),
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

  const repoDir = repoDirFor(REPOS_ROOT, repoPath);
  if (!repoDir) return c.json({ error: 'Invalid repoPath' }, 403);

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

  const repoDir = repoDirFor(REPOS_ROOT, repoPath);
  if (!repoDir || !sessionId || !existsSync(repoDir)) {
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
  hostname: HOSTNAME,
  fetch: app.fetch,
  idleTimeout: 30, // Heartbeats keep SSE alive
});

console.log(`Chat sandbox listening on :${PORT}`);

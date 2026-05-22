/**
 * Typed HTTP client for the sandbox container.
 *
 * All Claude Code execution and repo management happens in the sandbox.
 * The agent calls these functions to interact with it.
 */

import { config } from './config.js';

function sandboxUrl(path: string): string {
  return `${config.sandbox.url}${path}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnsureCloneParams {
  cloneUrl: string;
  repoPath: string;
  headSha: string;
  headRef: string;
  prNumber: number;
  baseRef?: string;
}

export interface EnsureCloneResult {
  ok: true;
  repoDir: string;
  diff: string;
}

export interface QueryParams {
  prompt: string;
  systemPrompt: string;
  repoPath: string;
  sessionId?: string;
  model?: string;
  maxTurns?: number;
  outputFormat?: { type: string; schema: object };
  allowedTools?: string[];
}

export type SSEEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; name: string; detail: string; input: Record<string, any> }
  | { type: 'done'; text: string; numTurns: number; costUsd: number; structuredOutput?: any }
  | { type: 'error'; message: string }
  | { type: 'heartbeat' };

export interface FileContentResult {
  after?: string;
  language: string;
  patch?: string;
}

export interface CollectFilesResult {
  files: Record<string, FileContentResult>;
}

// ---------------------------------------------------------------------------
// Repo path helper
// ---------------------------------------------------------------------------

export function sandboxRepoPath(owner: string, repo: string, prNumber: number): string {
  return `${owner}/${repo}/${prNumber}`;
}

// ---------------------------------------------------------------------------
// POST /ensure-clone
// ---------------------------------------------------------------------------

export async function sandboxEnsureClone(params: EnsureCloneParams): Promise<EnsureCloneResult> {
  const res = await fetch(sandboxUrl('/ensure-clone'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'Unknown error');
    throw new Error(`Sandbox ensure-clone failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<EnsureCloneResult>;
}

// ---------------------------------------------------------------------------
// POST /query — returns an async generator of SSE events
// ---------------------------------------------------------------------------

export async function* sandboxQuery(params: QueryParams): AsyncGenerator<SSEEvent> {
  const res = await fetch(sandboxUrl('/query'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(600_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'Unknown error');
    throw new Error(`Sandbox query failed (${res.status}): ${body}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!; // Keep incomplete last line

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;

      try {
        const event = JSON.parse(data) as SSEEvent;
        if (event.type !== 'heartbeat') {
          yield event;
        }
      } catch {
        // Skip malformed events
      }
    }
  }

  // Process any remaining buffer
  if (buffer.startsWith('data:')) {
    const data = buffer.slice(5).trim();
    if (data) {
      try {
        const event = JSON.parse(data) as SSEEvent;
        if (event.type !== 'heartbeat') yield event;
      } catch { /* skip */ }
    }
  }
}

// ---------------------------------------------------------------------------
// POST /query — raw response proxy (for chat streaming to client)
// ---------------------------------------------------------------------------

export async function sandboxQueryRaw(params: QueryParams): Promise<Response> {
  const res = await fetch(sandboxUrl('/query'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(600_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'Sandbox error');
    throw new Error(`Sandbox error: ${body}`);
  }

  return res;
}

// ---------------------------------------------------------------------------
// POST /file-content
// ---------------------------------------------------------------------------

export async function sandboxFileContent(
  repoPath: string,
  filePath: string,
  baseRef?: string,
): Promise<FileContentResult> {
  const res = await fetch(sandboxUrl('/file-content'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, filePath, baseRef }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'Unknown error');
    throw new Error(`Sandbox file-content failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<FileContentResult>;
}

// ---------------------------------------------------------------------------
// POST /collect-files
// ---------------------------------------------------------------------------

export async function sandboxCollectFiles(
  repoPath: string,
  baseRef: string,
  filePaths: string[],
): Promise<CollectFilesResult> {
  const res = await fetch(sandboxUrl('/collect-files'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, baseRef, filePaths }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'Unknown error');
    throw new Error(`Sandbox collect-files failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<CollectFilesResult>;
}

// ---------------------------------------------------------------------------
// POST /cleanup
// ---------------------------------------------------------------------------

export async function sandboxCleanup(repoPath: string): Promise<void> {
  const res = await fetch(sandboxUrl('/cleanup'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    // Best-effort cleanup — log but don't throw
    console.warn(`Sandbox cleanup failed for ${repoPath}: ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// POST /session-messages
// ---------------------------------------------------------------------------

export async function sandboxSessionMessages(
  sessionId: string,
  repoPath: string,
): Promise<any[]> {
  const res = await fetch(sandboxUrl('/session-messages'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, repoPath }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return [];

  const data = await res.json() as { messages: any[] };
  return data.messages ?? [];
}

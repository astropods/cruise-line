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

function sandboxHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.sandbox.token) headers['x-sandbox-token'] = config.sandbox.token;
  return headers;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnsureCloneParams {
  /** https URL of the base repo, without credentials */
  cloneUrl: string;
  /** Installation token for the fetch; the sandbox never writes it to disk */
  token: string;
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
  /** Agent SDK effort level: low | medium | high | xhigh | max */
  effort?: string;
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
    headers: sandboxHeaders(),
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

// The sandbox sends a heartbeat every 5s, so this much silence means it's stuck
const QUERY_IDLE_MS = 2 * 60_000;
// A ceiling for runaway runs; big reviews at high effort can pass 10 minutes
const QUERY_MAX_MS = 60 * 60_000;

/**
 * Runs a query and yields its events. Stopping early (a consumer that
 * throws or returns) closes the connection, which stops the run in the
 * sandbox too.
 */
export async function* sandboxQuery(params: QueryParams): AsyncGenerator<SSEEvent> {
  const controller = new AbortController();
  const ceiling = setTimeout(() => controller.abort(new Error('Sandbox query ran over 60 minutes')), QUERY_MAX_MS);
  let idle: ReturnType<typeof setTimeout> | undefined;
  const stillAlive = () => {
    clearTimeout(idle);
    idle = setTimeout(() => controller.abort(new Error('Sandbox stopped responding')), QUERY_IDLE_MS);
  };

  try {
    stillAlive();
    const res = await fetch(sandboxUrl('/query'), {
      method: 'POST',
      headers: sandboxHeaders(),
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => 'Unknown error');
      throw new Error(`Sandbox query failed (${res.status}): ${body}`);
    }

    for await (const event of readEvents(res.body!, stillAlive)) {
      if (event.type === 'heartbeat') continue;
      // Time spent in the consumer isn't the sandbox going quiet
      clearTimeout(idle);
      yield event;
      stillAlive();
    }
  } finally {
    clearTimeout(ceiling);
    clearTimeout(idle);
    controller.abort();
  }
}

/** Parses an SSE body into events, calling onChunk whenever bytes arrive */
async function* readEvents(body: ReadableStream<Uint8Array>, onChunk: () => void): AsyncGenerator<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const parse = (line: string): SSEEvent | null => {
    if (!line.startsWith('data:')) return null;
    const data = line.slice(5).trim();
    if (!data) return null;
    try {
      return JSON.parse(data) as SSEEvent;
    } catch {
      return null; // Skip malformed events
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk();

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!; // Keep incomplete last line
    for (const line of lines) {
      const event = parse(line);
      if (event) yield event;
    }
  }

  const last = parse(buffer);
  if (last) yield last;
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
    headers: sandboxHeaders(),
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
    headers: sandboxHeaders(),
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
    headers: sandboxHeaders(),
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
    headers: sandboxHeaders(),
    body: JSON.stringify({ sessionId, repoPath }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return [];

  const data = await res.json() as { messages: any[] };
  return data.messages ?? [];
}

// ---------------------------------------------------------------------------
// GET /models
// ---------------------------------------------------------------------------

export interface SandboxModel {
  id: string;
  displayName: string;
  createdAt: string;
  /** Effort levels the model accepts; [] if none, null if the API didn't say */
  effortLevels: string[] | null;
}

export async function sandboxListModels(): Promise<SandboxModel[]> {
  const res = await fetch(sandboxUrl('/models'), {
    headers: sandboxHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Sandbox models failed (${res.status})`);
  }
  const data = await res.json() as { models: SandboxModel[] };
  return data.models;
}

// ---------------------------------------------------------------------------
// Telemetry diagnostics
// ---------------------------------------------------------------------------

export async function sandboxTelemetryStatus(): Promise<unknown> {
  const res = await fetch(sandboxUrl('/telemetry-status'), {
    headers: sandboxHeaders(),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) {
    throw new Error(`Sandbox telemetry-status failed (${res.status})`);
  }
  return res.json();
}

export async function sandboxTelemetryTest(): Promise<unknown> {
  const res = await fetch(sandboxUrl('/telemetry-test'), {
    method: 'POST',
    headers: sandboxHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Sandbox telemetry-test failed (${res.status})`);
  }
  return res.json();
}

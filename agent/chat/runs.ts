/**
 * In-memory store for chat runs.
 *
 * A run owns one chat turn from start to finish, independent of any HTTP
 * request. The browser reads its events over short SSE connections and
 * resumes by sequence number, so no single response has to outlive the
 * platform ingress's 15s response timeout.
 */

import type { SSEStreamingApi } from 'hono/streaming';

export interface ChatRunEvent {
  seq: number;
  /** JSON-encoded event payload, forwarded to the browser as-is */
  data: string;
}

export interface ChatRun {
  id: string;
  owner: string;
  repo: string;
  prNumber: number;
  userId: number;
  prompt: string;
  state: 'running' | 'done';
  events: ChatRunEvent[];
  finishedAt?: number;
}

type Emit = (event: Record<string, unknown>) => void;

// Finished runs stay readable long enough for a cut connection to reconnect
// and collect the final events.
const FINISHED_RUN_TTL_MS = 5 * 60_000;

export class ChatRunManager {
  private runs = new Map<string, ChatRun>();
  private waiters = new Map<string, Set<() => void>>();

  constructor(private finishedTtlMs = FINISHED_RUN_TTL_MS) {}

  start(
    params: Pick<ChatRun, 'owner' | 'repo' | 'prNumber' | 'userId' | 'prompt'>,
    work: (emit: Emit) => Promise<void>,
  ): ChatRun {
    this.sweep();

    const run: ChatRun = {
      ...params,
      id: crypto.randomUUID(),
      state: 'running',
      events: [],
    };
    this.runs.set(run.id, run);

    const emit: Emit = (event) => {
      if (run.state === 'done') return;
      run.events.push({ seq: run.events.length + 1, data: JSON.stringify(event) });
      this.wake(run.id);
    };

    work(emit)
      .catch((err) => {
        console.error(`Chat run ${run.id} failed for ${run.owner}/${run.repo}#${run.prNumber}:`, err);
        emit({ type: 'error', message: err instanceof Error ? err.message : 'Chat failed' });
      })
      .finally(() => {
        run.state = 'done';
        run.finishedAt = Date.now();
        this.wake(run.id);
      });

    return run;
  }

  get(id: string): ChatRun | undefined {
    return this.runs.get(id);
  }

  /** Whether anyone has a run in progress on this PR */
  hasActiveForPr(owner: string, repo: string, prNumber: number): boolean {
    for (const run of this.runs.values()) {
      if (run.state === 'running' && run.owner === owner && run.repo === repo && run.prNumber === prNumber) return true;
    }
    return false;
  }

  /** The user's in-progress run on this PR, if any */
  getActive(owner: string, repo: string, prNumber: number, userId: number): ChatRun | undefined {
    for (const run of this.runs.values()) {
      if (
        run.state === 'running' && run.owner === owner && run.repo === repo
        && run.prNumber === prNumber && run.userId === userId
      ) {
        return run;
      }
    }
    return undefined;
  }

  eventsAfter(run: ChatRun, seq: number): ChatRunEvent[] {
    return run.events.slice(Math.max(0, seq));
  }

  /** Resolves on the run's next event or completion, or after `ms`. */
  waitForChange(run: ChatRun, ms: number): Promise<void> {
    if (run.state === 'done') return Promise.resolve();
    return new Promise((resolve) => {
      let waiters = this.waiters.get(run.id);
      if (!waiters) {
        waiters = new Set();
        this.waiters.set(run.id, waiters);
      }
      const done = () => {
        clearTimeout(timer);
        waiters!.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      waiters.add(done);
    });
  }

  private wake(id: string): void {
    const waiters = this.waiters.get(id);
    if (!waiters) return;
    this.waiters.delete(id);
    for (const w of waiters) w();
  }

  private sweep(): void {
    const cutoff = Date.now() - this.finishedTtlMs;
    for (const [id, run] of this.runs) {
      if (run.state === 'done' && run.finishedAt! < cutoff) this.runs.delete(id);
    }
  }
}

export const chatRuns = new ChatRunManager();

// Each events connection closes well inside the ingress's 15s response
// timeout; EventSource reconnects and resumes from Last-Event-ID.
const EVENTS_WINDOW_MS = 10_000;
const PING_INTERVAL_MS = 5_000;

/**
 * Writes a run's events after `after` to an SSE stream until the run ends
 * (then sends an `end` event) or the window closes.
 */
export async function streamRunEvents(
  stream: SSEStreamingApi,
  manager: ChatRunManager,
  run: ChatRun,
  after: number,
  windowMs = EVENTS_WINDOW_MS,
): Promise<void> {
  const deadline = Date.now() + windowMs;
  // Reconnect quickly when this window closes (browser default is ~3s)
  await stream.write('retry: 250\n\n');

  while (!stream.aborted) {
    for (const event of manager.eventsAfter(run, after)) {
      await stream.writeSSE({ id: String(event.seq), data: event.data });
      after = event.seq;
    }
    if (run.state === 'done') {
      await stream.writeSSE({ event: 'end', data: '{}' });
      return;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) return;

    const seen = run.events.length;
    await manager.waitForChange(run, Math.min(remaining, PING_INTERVAL_MS));
    if (run.events.length === seen && run.state === 'running') {
      await stream.write(': ping\n\n');
    }
  }
}

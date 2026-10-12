import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { ChatRunManager, streamRunEvents, type ChatRun } from './chat/runs.js';

const params = { owner: 'acme', repo: 'app', prNumber: 1, userId: 42, prompt: 'hi' };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

async function waitUntilDone(manager: ChatRunManager, run: ChatRun) {
  while (run.state !== 'done') await manager.waitForChange(run, 50);
}

/** Parses an SSE body into its events (id, event name, data). */
function parseSse(body: string) {
  return body.split('\n\n').filter(Boolean).flatMap((block) => {
    const fields: Record<string, string> = {};
    for (const line of block.split('\n')) {
      const i = line.indexOf(':');
      if (i <= 0) continue; // comments (": ping") and blank lines
      fields[line.slice(0, i)] = line.slice(i + 1).trim();
    }
    return fields.data === undefined ? [] : [fields];
  });
}

function eventsApp(manager: ChatRunManager, run: ChatRun, windowMs: number) {
  const app = new Hono();
  app.get('/events', (c) => {
    const after = Number(c.req.header('last-event-id') ?? c.req.query('after') ?? 0) || 0;
    return streamSSE(c, (stream) => streamRunEvents(stream, manager, run, after, windowMs));
  });
  return app;
}

describe('ChatRunManager', () => {
  it('numbers events and marks the run done when work finishes', async () => {
    const manager = new ChatRunManager();
    const run = manager.start(params, async (emit) => {
      emit({ type: 'text', content: 'a' });
      emit({ type: 'done', text: 'a' });
    });
    await waitUntilDone(manager, run);

    expect(run.events.map((e) => e.seq)).toEqual([1, 2]);
    expect(manager.eventsAfter(run, 1).map((e) => JSON.parse(e.data).type)).toEqual(['done']);
  });

  it('turns a thrown error into an error event', async () => {
    const manager = new ChatRunManager();
    const run = manager.start(params, async () => {
      throw new Error('clone failed');
    });
    await waitUntilDone(manager, run);

    expect(run.events.map((e) => JSON.parse(e.data))).toEqual([{ type: 'error', message: 'clone failed' }]);
  });

  it('reports the active run only while it is running', async () => {
    const manager = new ChatRunManager();
    const gate = deferred();
    const run = manager.start(params, () => gate.promise);

    expect(manager.getActive('acme', 'app', 1, 42)?.id).toBe(run.id);
    expect(manager.getActive('acme', 'app', 1, 7)).toBeUndefined();

    gate.resolve();
    await waitUntilDone(manager, run);
    expect(manager.getActive('acme', 'app', 1, 42)).toBeUndefined();
    expect(manager.get(run.id)).toBe(run);
  });

  it('wakes a waiter on the next event', async () => {
    const manager = new ChatRunManager();
    const gate = deferred();
    let emit!: (e: Record<string, unknown>) => void;
    const run = manager.start(params, (e) => { emit = e; return gate.promise; });

    const started = Date.now();
    const waiting = manager.waitForChange(run, 5_000);
    emit({ type: 'text', content: 'x' });
    await waiting;
    expect(Date.now() - started).toBeLessThan(1_000);
    gate.resolve();
  });

  it('drops finished runs after the TTL', async () => {
    const manager = new ChatRunManager(0);
    const run = manager.start(params, async () => {});
    await waitUntilDone(manager, run);
    await new Promise((r) => setTimeout(r, 5));

    manager.start(params, async () => {}); // start() sweeps
    expect(manager.get(run.id)).toBeUndefined();
  });
});

describe('streamRunEvents', () => {
  it('replays a finished run and ends with an end event', async () => {
    const manager = new ChatRunManager();
    const run = manager.start(params, async (emit) => {
      emit({ type: 'text', content: 'one' });
      emit({ type: 'text', content: 'two' });
    });
    await waitUntilDone(manager, run);

    const res = await eventsApp(manager, run, 1_000).request('/events?after=0');
    const body = await res.text();

    expect(body.startsWith('retry: 250')).toBe(true);
    expect(parseSse(body)).toEqual([
      { id: '1', data: '{"type":"text","content":"one"}' },
      { id: '2', data: '{"type":"text","content":"two"}' },
      { event: 'end', data: '{}' },
    ]);
  });

  it('resumes after Last-Event-ID without repeating events', async () => {
    const manager = new ChatRunManager();
    const run = manager.start(params, async (emit) => {
      emit({ type: 'text', content: 'one' });
      emit({ type: 'text', content: 'two' });
    });
    await waitUntilDone(manager, run);

    const res = await eventsApp(manager, run, 1_000).request('/events?after=0', {
      headers: { 'Last-Event-ID': '1' },
    });
    const ids = parseSse(await res.text()).map((e) => e.id ?? e.event);
    expect(ids).toEqual(['2', 'end']);
  });

  it('closes at the window while the run is still going, then resumes on reconnect', async () => {
    const manager = new ChatRunManager();
    const gate = deferred();
    let emit!: (e: Record<string, unknown>) => void;
    const run = manager.start(params, (e) => { emit = e; return gate.promise; });
    emit({ type: 'text', content: 'early' });

    const app = eventsApp(manager, run, 100);
    const first = parseSse(await (await app.request('/events?after=0')).text());
    expect(first).toEqual([{ id: '1', data: '{"type":"text","content":"early"}' }]);

    emit({ type: 'text', content: 'late' });
    gate.resolve();
    await waitUntilDone(manager, run);

    const second = parseSse(await (await app.request('/events', { headers: { 'Last-Event-ID': '1' } })).text());
    expect(second.map((e) => e.id ?? e.event)).toEqual(['2', 'end']);
  });
});

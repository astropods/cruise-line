/**
 * In-memory stand-in for the agent API, for exercising the UI without
 * GitHub, Postgres, or Claude. Enabled by `bun run dev:mock`.
 *
 * Seeds a handful of PRs, one per UI state worth looking at, and simulates
 * analysis runs on a timer. Chat streams a canned reply. Mirrors the real routes' response shapes — see
 * agent/routes/walkthroughs.ts — but none of their auth or GitHub calls.
 *
 *   MOCK_JOB_SECONDS   how long a simulated run takes (default 15)
 *   POST /__mock/reset puts every PR back in its seeded state
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Walkthrough, ProgressEntry } from '../src/api';

const JOB_MS = Number(process.env.MOCK_JOB_SECONDS ?? 15) * 1000;
const PENDING_MS = 2000;

type Status = 'pending' | 'running' | 'complete' | 'failed';

interface MockPr {
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  currentHeadSha: string;
  /** Tracking state from webhooks; null mimics a PR reviewed before tracking existed */
  prState: 'open' | 'closed' | 'merged' | null;
  /** When the webhook last touched it */
  trackedAt: string | null;
  /** Most recent run row */
  latest: { id: number; status: Status; headSha: string; error: string | null; createdAt: string; updatedAt: string } | null;
  /** Most recent row with content */
  reviewed: { id: number; headSha: string; data: Walkthrough; updatedAt: string } | null;
  job: { startedAt: number; durationMs: number } | null;
  /** Every run on this PR fails — for the failure states */
  alwaysFail: boolean;
  runs: number;
}

const PROGRESS_SCRIPT: Omit<ProgressEntry, 'timestamp'>[] = [
  { type: 'status', text: 'Cloning repository...' },
  { type: 'tool', text: 'Bash: git diff main...HEAD --stat' },
  { type: 'status', text: 'Reading changed files...' },
  { type: 'tool', text: 'Read: agent/github/webhooks.ts' },
  { type: 'tool', text: 'Read: agent/analysis/jobs.ts' },
  { type: 'tool', text: 'Grep: retryDelay' },
  { type: 'status', text: 'Tracing call sites...' },
  { type: 'tool', text: 'Read: agent/routes/webhook.ts' },
  { type: 'tool', text: 'Glob: agent/**/*.test.ts' },
  { type: 'status', text: 'Writing findings...' },
];

let nextId = 1;
let prs: MockPr[] = [];

function sha(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, '0').repeat(5);
}

const PATCH = `@@ -10,12 +10,20 @@ export async function deliverWebhook(event: WebhookEvent) {
   const url = event.target;
-  const res = await fetch(url, { method: 'POST', body: JSON.stringify(event.payload) });
-  if (!res.ok) throw new Error(\`Delivery failed: \${res.status}\`);
+  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
+    const res = await fetch(url, { method: 'POST', body: JSON.stringify(event.payload) });
+    if (res.ok) return;
+    if (res.status < 500) throw new Error(\`Delivery rejected: \${res.status}\`);
+    await sleep(retryDelay(attempt));
+  }
+  throw new Error('Delivery failed after retries');
 }
+
+function retryDelay(attempt: number) {
+  return Math.min(30_000, 500 * 2 ** attempt);
+}
`;

const AFTER = `import { sleep } from './util';

const MAX_ATTEMPTS = 5;

interface WebhookEvent {
  target: string;
  payload: unknown;
}

export async function deliverWebhook(event: WebhookEvent) {
  const url = event.target;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(event.payload) });
    if (res.ok) return;
    if (res.status < 500) throw new Error(\`Delivery rejected: \${res.status}\`);
    await sleep(retryDelay(attempt));
  }
  throw new Error('Delivery failed after retries');
}

function retryDelay(attempt: number) {
  return Math.min(30_000, 500 * 2 ** attempt);
}
`;

function makeWalkthrough(pr: MockPr, headSha: string): Walkthrough {
  const generatedAt = new Date().toLocaleTimeString();
  const file = 'agent/github/webhooks.ts';
  return {
    pr: {
      repo: `${pr.owner}/${pr.repo}`,
      number: pr.number,
      title: pr.title,
      author: pr.author,
      baseSha: sha('base'),
      headSha,
    },
    summary:
      `**Mock review #${pr.runs + 1}**, generated at ${generatedAt}. ` +
      `This PR replaces the single-shot webhook POST with a bounded retry loop ` +
      `using exponential backoff, and stops retrying on 4xx responses.`,
    verdict: pr.runs % 2 === 0 ? 'request_changes' : 'approve',
    verdictRationale:
      'The retry loop is sound, but a network error from `fetch` escapes the loop on the first attempt, so the retries never cover the most common transient failure.',
    files: {
      [file]: { language: 'typescript', patch: PATCH, after: AFTER },
    },
    findings: [
      {
        title: 'Network errors bypass the retry loop',
        severity: 'high',
        category: 'correctness',
        body: '`fetch` rejects on DNS failures and connection resets. Those throw out of the loop on the first attempt instead of being retried, which defeats the purpose of the change.',
        files: [file],
        fixPrompt: `In ${file}, wrap the fetch call in try/catch inside the retry loop so network errors are retried like 5xx responses.`,
        commentAnchor: { file, lineStart: 13, lineEnd: 13 },
      },
      {
        title: 'No jitter on the backoff',
        severity: 'low',
        category: 'performance',
        body: 'Every failed delivery retries on the same schedule. When a receiver recovers from an outage, all queued deliveries hit it at once. Adding random jitter spreads the load.',
        files: [file],
        fixPrompt: `In ${file}, add full jitter to retryDelay: return a random value between 0 and the current cap.`,
        commentAnchor: { file, lineStart: 21, lineEnd: 23 },
      },
      {
        title: 'Retry ceiling is reasonable',
        severity: 'info',
        category: 'maintainability',
        body: 'Five attempts capped at 30s keeps the worst case under a minute, which fits inside the job timeout.',
        files: [file],
      },
    ],
  };
}

function seed() {
  nextId = 1;
  const now = Date.now();
  const base = (
    owner: string, repo: string, number: number, title: string, author: string,
    prState: MockPr['prState'] = 'open', trackedAgoMinutes = 90,
  ): MockPr => ({
    owner, repo, number, title, author, prState,
    trackedAt: prState ? new Date(now - trackedAgoMinutes * 60_000).toISOString() : null,
    currentHeadSha: sha(`${repo}${number}`),
    latest: null, reviewed: null, job: null, alwaysFail: false, runs: 0,
  });
  const withReview = (pr: MockPr, ageMinutes: number, headSha = pr.currentHeadSha) => {
    const at = new Date(now - ageMinutes * 60_000).toISOString();
    const id = nextId++;
    pr.reviewed = { id, headSha, data: makeWalkthrough(pr, headSha), updatedAt: at };
    pr.latest = { id, status: 'complete', headSha, error: null, createdAt: at, updatedAt: at };
    pr.runs = 1;
    return pr;
  };

  const ready = withReview(base('demo', 'app', 101, 'Add retry backoff to webhook delivery', 'octocat'), 42);

  const first = base('demo', 'app', 102, 'Migrate settings page to the new form library', 'hubot', 'open', 20);

  const rerunFails = withReview(base('demo', 'app', 103, 'Cache installation tokens across requests', 'monalisa'), 180);
  rerunFails.alwaysFail = true;

  const firstFails = base('demo', 'app', 104, 'Experimental: stream diffs to the viewer', 'octocat', 'open', 300);
  firstFails.alwaysFail = true;

  // Reviewed before tracking existed, so its open/closed state is unknown
  const stale = withReview(base('demo', 'web', 205, 'Dark mode color tokens', 'hubot', null), 60 * 26, sha('old-commit'));

  const inFlight = withReview(base('demo', 'web', 206, 'Rate-limit the generate endpoint', 'monalisa'), 60 * 5);
  startJob(inFlight, Math.max(JOB_MS, 60_000));

  // Opened, never reviewed: the "Start review" state
  const untouched = base('demo', 'app', 107, 'Bump dependencies for October', 'dependabot', 'open', 5);

  const merged = withReview(base('demo', 'web', 208, 'Fix flaky webhook test', 'octocat', 'merged', 60 * 30), 60 * 50);
  const closedUnreviewed = base('demo', 'app', 109, 'WIP: try a different diff renderer', 'hubot', 'closed', 60 * 72);

  prs = [ready, first, rerunFails, firstFails, stale, inFlight, untouched, merged, closedUnreviewed];
}

function startJob(pr: MockPr, durationMs = JOB_MS) {
  const at = new Date().toISOString();
  // The real /generate route tracks PRs it hasn't seen before
  if (!pr.prState) { pr.prState = 'open'; pr.trackedAt = at; }
  // Like the real force path: rerunning the same SHA reuses its row.
  if (pr.latest && pr.latest.headSha === pr.currentHeadSha) {
    pr.latest = { ...pr.latest, status: 'pending', error: null, updatedAt: at };
  } else {
    pr.latest = { id: nextId++, status: 'pending', headSha: pr.currentHeadSha, error: null, createdAt: at, updatedAt: at };
  }
  pr.job = { startedAt: Date.now(), durationMs };
}

/** Advances a PR's simulated job to wherever the clock says it should be. */
function tick(pr: MockPr) {
  if (!pr.job || !pr.latest) return;
  const elapsed = Date.now() - pr.job.startedAt;
  if (elapsed < PENDING_MS) return;
  if (elapsed < pr.job.durationMs) {
    pr.latest.status = 'running';
    return;
  }
  const at = new Date().toISOString();
  pr.job = null;
  if (pr.alwaysFail) {
    pr.latest = { ...pr.latest, status: 'failed', error: 'Sandbox exited with code 137 (mock failure)', updatedAt: at };
    return;
  }
  const data = makeWalkthrough(pr, pr.latest.headSha);
  pr.runs++;
  pr.latest = { ...pr.latest, status: 'complete', updatedAt: at };
  pr.reviewed = { id: pr.latest.id, headSha: pr.latest.headSha, data, updatedAt: at };
}

function progressFor(pr: MockPr): ProgressEntry[] {
  if (!pr.job) return [];
  const elapsed = Date.now() - pr.job.startedAt - PENDING_MS;
  if (elapsed < 0) return [];
  const span = pr.job.durationMs - PENDING_MS;
  const count = Math.min(PROGRESS_SCRIPT.length, Math.floor((elapsed / span) * PROGRESS_SCRIPT.length) + 1);
  return PROGRESS_SCRIPT.slice(0, count).map((e, i) => ({
    ...e,
    timestamp: pr.job!.startedAt + PENDING_MS + (i * span) / PROGRESS_SCRIPT.length,
  }));
}

function find(owner: string, repo: string, number: number) {
  const pr = prs.find((p) => p.owner === owner && p.repo === repo && p.number === number);
  if (pr) tick(pr);
  return pr;
}

// --- Chat: canned replies streamed over SSE, in the real run-events format ---

interface MockChatRun { events: { at: number; data: unknown }[] }
const chatRuns = new Map<string, MockChatRun>();
let nextRunId = 1;

function startChatRun(pr: MockPr, message: string): string {
  const id = `mock-run-${nextRunId++}`;
  const t0 = Date.now();
  const status = pr.reviewed ? 'There is a finished review I can lean on.' : 'The review is still running, so I am reading the code directly.';
  const reply =
    `You asked: "${message}"\n\n${status} This is a canned mock reply. ` +
    `In a real deployment the sandbox would answer from the PR checkout.`;
  chatRuns.set(id, {
    events: [
      { at: t0 + 600, data: { type: 'tool_call', name: 'Grep', detail: '/retryDelay/ in agent', input: { pattern: 'retryDelay' } } },
      { at: t0 + 1400, data: { type: 'tool_call', name: 'Read', detail: 'agent/github/webhooks.ts', input: { file_path: 'agent/github/webhooks.ts' } } },
      { at: t0 + 2400, data: { type: 'text', content: reply } },
      { at: t0 + 2500, data: { type: 'done' } },
    ],
  });
  return id;
}

function streamChatRun(run: MockChatRun, after: number, req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('retry: 250\n\n');
  let sent = after;
  const timer = setInterval(() => {
    run.events.forEach((e, i) => {
      const seq = i + 1;
      if (seq > sent && e.at <= Date.now()) {
        res.write(`id: ${seq}\ndata: ${JSON.stringify(e.data)}\n\n`);
        sent = seq;
      }
    });
    if (sent === run.events.length) {
      res.write('event: end\ndata: {}\n\n');
      clearInterval(timer);
      res.end();
    }
  }, 150);
  req.on('close', () => clearInterval(timer));
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

const ALL_EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'];
const MOCK_MODELS = [
  { id: 'claude-opus-5-5', displayName: 'Claude Opus 5.5', createdAt: '2026-09-21T00:00:00Z', effortLevels: ALL_EFFORT },
  { id: 'claude-sonnet-5-5', displayName: 'Claude Sonnet 5.5', createdAt: '2026-09-21T00:00:00Z', effortLevels: ALL_EFFORT },
  { id: 'claude-haiku-5-5', displayName: 'Claude Haiku 5.5', createdAt: '2026-09-21T00:00:00Z', effortLevels: ['low', 'medium', 'high', 'max'] },
  { id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8', createdAt: '2026-05-01T00:00:00Z', effortLevels: ALL_EFFORT },
  { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', createdAt: '2026-02-17T00:00:00Z', effortLevels: ['low', 'medium', 'high', 'max'] },
  { id: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5', createdAt: '2025-10-15T00:00:00Z', effortLevels: [] },
];
const modelSettings: Record<string, { model: string | null; effort: string | null }> = {
  review: { model: null, effort: null },
  chat: { model: null, effort: null },
};

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
  });
}

const USER = { userId: 1, login: 'you', avatarUrl: 'https://github.com/ghost.png', role: 'owner', isOwner: true };
const GITHUB_URL = 'https://github.com';

function handle(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? '/', 'http://mock');
  const path = url.pathname;
  const method = req.method ?? 'GET';
  let m: RegExpMatchArray | null;

  if (path === '/__mock/reset' && method === 'POST') {
    seed();
    modelSettings.review = { model: null, effort: null };
    modelSettings.chat = { model: null, effort: null };
    send(res, 200, { ok: true });
    return true;
  }
  if (!path.startsWith('/api/')) return false;

  if (path === '/api/setup/status') {
    send(res, 200, { configured: true, appSlug: 'cruise-line-mock', appUrl: 'http://localhost:5174', githubUrl: GITHUB_URL, installUrl: null, hasOwner: true });
    return true;
  }
  if (path === '/api/auth/me') { send(res, 200, USER); return true; }
  if (path === '/api/auth/logout') { send(res, 200, { ok: true }); return true; }
  if (path === '/api/cli/tokens') { send(res, 200, { tokens: [] }); return true; }

  if (path === '/api/settings/repos') { send(res, 200, { installations: [] }); return true; }
  if (path === '/api/settings/users') {
    send(res, 200, { users: [{ ...USER, lastSeenAt: new Date().toISOString(), loginCount: 1 }] });
    return true;
  }
  if (path === '/api/settings/models' && method === 'GET') {
    send(res, 200, {
      settings: modelSettings,
      defaults: { model: 'claude-opus-5-5', effort: 'high' },
      models: MOCK_MODELS,
      modelsError: null,
    });
    return true;
  }
  if ((m = path.match(/^\/api\/settings\/models\/(review|chat)$/)) && method === 'PUT') {
    const use = m[1];
    readJson(req).then((body) => {
      const model = body.model ?? 'claude-opus-5-5';
      const effort = body.effort ?? 'high';
      const info = MOCK_MODELS.find((x) => x.id === model);
      if (!info) return send(res, 400, { error: `${model} is not available to this API key` });
      if (effort !== 'auto' && !info.effortLevels.includes(effort)) {
        return send(res, 400, {
          error: info.effortLevels.length === 0
            ? `${info.displayName} doesn't support an effort setting`
            : `${info.displayName} doesn't support ${effort} effort`,
        });
      }
      modelSettings[use] = { model: body.model ?? null, effort: body.effort ?? null };
      send(res, 200, { settings: modelSettings });
    });
    return true;
  }

  if (path === '/api/walkthroughs' && method === 'GET') {
    prs.forEach(tick);
    const updatedAt = (p: MockPr) => [p.latest?.updatedAt, p.trackedAt].filter(Boolean).sort().at(-1)!;
    const list = [...prs]
      .filter((p) => p.latest || p.prState)
      .sort((a, b) => updatedAt(b).localeCompare(updatedAt(a)))
      .map((p) => ({
        owner: p.owner, repo: p.repo, number: p.number,
        status: p.latest?.status ?? 'none',
        prState: p.prState,
        headSha: p.latest?.headSha ?? p.currentHeadSha,
        updatedAt: updatedAt(p),
        title: p.prState ? p.title : p.reviewed?.data.pr.title ?? null,
        author: p.prState ? p.author : p.reviewed?.data.pr.author ?? null,
        verdict: p.reviewed?.data.verdict ?? null,
        findingCount: p.reviewed?.data.findings.length ?? null,
      }));
    send(res, 200, { prs: list, githubUrl: GITHUB_URL });
    return true;
  }

  if ((m = path.match(/^\/api\/walkthroughs\/([^/]+)\/([^/]+)\/(\d+)(\/generate|\/status)?$/))) {
    const pr = find(m[1], m[2], Number(m[3]));
    if (!pr) { send(res, 404, { error: 'No such PR in the mock (POST /__mock/reset to restore seeds)' }); return true; }
    const sub = m[4];

    if (sub === '/generate' && method === 'POST') {
      const force = url.searchParams.get('force') === 'true';
      if (pr.job) { send(res, 202, { walkthroughId: pr.latest!.id, status: pr.latest!.status }); return true; }
      if (!force && pr.latest?.status === 'complete' && pr.latest.headSha === pr.currentHeadSha) {
        send(res, 200, { walkthroughId: pr.latest.id, status: 'complete' });
        return true;
      }
      startJob(pr);
      send(res, 202, { walkthroughId: pr.latest!.id, status: 'queued' });
      return true;
    }

    if (sub === '/status') {
      if (!pr.latest) { send(res, 200, { status: 'none' }); return true; }
      send(res, 200, { walkthroughId: pr.latest.id, status: pr.latest.status, headSha: pr.latest.headSha, error: pr.latest.error, progress: progressFor(pr) });
      return true;
    }

    send(res, 200, {
      walkthrough: pr.latest && {
        ...pr.latest,
        data: pr.latest.status === 'complete' ? pr.reviewed?.data ?? null : null,
      },
      latestReview: pr.reviewed,
      pr: { title: pr.title, author: pr.author },
      currentHeadSha: pr.currentHeadSha,
      githubUrl: GITHUB_URL,
    });
    return true;
  }

  if ((m = path.match(/^\/api\/files\/([^/]+)\/([^/]+)\/(\d+)\/content$/))) {
    const pr = find(m[1], m[2], Number(m[3]));
    const file = pr?.reviewed?.data.files[url.searchParams.get('path') ?? ''];
    if (!file) { send(res, 404, { error: 'File not in mock review' }); return true; }
    send(res, 200, file);
    return true;
  }

  if (path.startsWith('/api/rules/')) {
    if (method === 'GET') send(res, 200, { rules: [] });
    else send(res, 501, { error: 'Rules are read-only in mock mode' });
    return true;
  }

  if (path.startsWith('/api/comments/')) {
    if (method === 'GET') send(res, 200, { comments: [] });
    else send(res, 501, { error: 'Posting comments is disabled in mock mode' });
    return true;
  }

  if ((m = path.match(/^\/api\/chat\/([^/]+)\/([^/]+)\/(\d+)\/(session|message|runs\/([^/]+)\/events)$/))) {
    const pr = find(m[1], m[2], Number(m[3]));
    if (!pr) { send(res, 404, { error: 'No such PR in the mock' }); return true; }
    // History isn't kept: a refresh starts the conversation over.
    if (m[4] === 'session') {
      send(res, 200, method === 'GET' ? { session: null, messages: [], activeRun: null } : { ok: true });
      return true;
    }
    if (m[4] === 'message' && method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const message = (JSON.parse(body || '{}') as { message?: string }).message ?? '';
        send(res, 202, { runId: startChatRun(pr, message) });
      });
      return true;
    }
    const run = m[5] ? chatRuns.get(m[5]) : undefined;
    if (!run) { send(res, 404, { error: 'Chat run not found' }); return true; }
    const after = Number(req.headers['last-event-id'] ?? url.searchParams.get('after') ?? 0) || 0;
    streamChatRun(run, after, req, res);
    return true;
  }

  send(res, 501, { error: `Not mocked: ${method} ${path}` });
  return true;
}

export function mockApi(): Plugin {
  return {
    name: 'cruise-line-mock-api',
    apply: 'serve',
    configureServer(server) {
      seed();
      server.middlewares.use((req, res, next) => {
        if (!handle(req, res)) next();
      });
      server.httpServer?.once('listening', () => {
        console.log('\n  Mock API on. Seeded PRs (open /reviews):');
        for (const p of prs) console.log(`    /${p.owner}/${p.repo}/pull/${p.number}  ${p.title}`);
        console.log(`  Simulated runs take ${JOB_MS / 1000}s. POST /__mock/reset to start over.\n`);
      });
    },
  };
}

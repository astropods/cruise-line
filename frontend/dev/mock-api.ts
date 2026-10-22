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
import type { Walkthrough, ProgressEntry, Finding, Severity } from '../src/api';
import { PR_FIXTURES, type PrFixture } from './fixtures/prs';

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
  fixture: PrFixture;
  mergedAt: string | null;
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

// Real patches come from `git diff -- <path>`, headers included; the
// slideout's diff parser needs them.
const PATCH = `diff --git a/agent/github/webhooks.ts b/agent/github/webhooks.ts
--- a/agent/github/webhooks.ts
+++ b/agent/github/webhooks.ts
@@ -10,12 +10,20 @@ export async function deliverWebhook(event: WebhookEvent) {
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
    verdict: pr.fixture.review?.findings === 'clean' ? 'approve' : pr.runs % 2 === 0 ? 'request_changes' : 'approve',
    verdictRationale:
      'The retry loop is sound, but a network error from `fetch` escapes the loop on the first attempt, so the retries never cover the most common transient failure.',
    files: {
      [file]: { language: 'typescript', patch: PATCH, after: AFTER },
    },
    findings: (pr.fixture.review?.findings === 'clean'
      ? (f: Finding[]) => f.filter((x) => x.severity !== 'high')
      : (f: Finding[]) => f)([
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
    ]),
  };
}

function seed() {
  nextId = 1;
  const now = Date.now();
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

  prs = PR_FIXTURES.map((f) => {
    const pr: MockPr = {
      owner: f.owner, repo: f.repo, number: f.number, title: f.title, author: f.author,
      prState: f.state,
      trackedAt: f.state ? ago(f.trackedAgoMinutes) : null,
      currentHeadSha: sha(`${f.repo}${f.number}`),
      latest: null, reviewed: null, job: null, alwaysFail: !!f.alwaysFail, runs: 0,
      fixture: f,
      mergedAt: f.mergedAgoMinutes != null ? ago(f.mergedAgoMinutes) : null,
    };
    if (f.review) {
      const at = ago(f.review.ageMinutes);
      const headSha = f.review.stale ? sha(`old-${f.number}`) : pr.currentHeadSha;
      const id = nextId++;
      pr.reviewed = { id, headSha, data: makeWalkthrough(pr, headSha), updatedAt: at };
      pr.latest = { id, status: 'complete', headSha, error: null, createdAt: at, updatedAt: at };
      pr.runs = 1;
    }
    if (f.runningForSeconds) startJob(pr, Math.max(JOB_MS, f.runningForSeconds * 1000));
    return pr;
  });
}

function severityCounts(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

/** Commits since the reviewed head: the fixture's count while stale, else null */
function commitsSinceReview(pr: MockPr): number | null {
  if (!pr.reviewed || pr.reviewed.headSha === pr.currentHeadSha) return null;
  return pr.fixture.review?.stale?.commits ?? null;
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

// --- Settings: one installation, per-repo scope, a few users ---

const INSTALLATION = {
  id: 1,
  account: { login: 'demo', type: 'Organization', avatarUrl: `https://github.com/github.png?size=40`, htmlUrl: 'https://github.com/demo' },
  repositories: [
    { id: 11, name: 'app', fullName: 'demo/app', private: false, htmlUrl: 'https://github.com/demo/app' },
    { id: 12, name: 'web', fullName: 'demo/web', private: true, htmlUrl: 'https://github.com/demo/web' },
  ],
};
let repoScopes: Record<string, string[]> = {};
let users: { userId: number; login: string; avatarUrl: string; role: 'owner' | 'user'; loginCount: number; lastSeenAgoMinutes: number }[] = [];

function seedSettings() {
  repoScopes = { 'demo/app': [], 'demo/web': ['charts', 'terraform/modules'] };
  users = [
    { userId: 1, login: 'you', avatarUrl: 'https://github.com/ghost.png', role: 'owner', loginCount: 214, lastSeenAgoMinutes: 0 },
    { userId: 2, login: 'monalisa', avatarUrl: 'https://github.com/monalisa.png', role: 'owner', loginCount: 88, lastSeenAgoMinutes: 120 },
    { userId: 3, login: 'hubot', avatarUrl: 'https://github.com/hubot.png', role: 'user', loginCount: 41, lastSeenAgoMinutes: 60 * 26 },
    { userId: 4, login: 'octocat', avatarUrl: 'https://github.com/octocat.png', role: 'user', loginCount: 2, lastSeenAgoMinutes: 60 * 24 * 20 },
  ];
}
seedSettings();

function userJson(u: (typeof users)[number]) {
  return {
    userId: u.userId, login: u.login, avatarUrl: u.avatarUrl, role: u.role, loginCount: u.loginCount,
    firstSeenAt: new Date(Date.now() - 90 * 86_400_000).toISOString(),
    lastSeenAt: new Date(Date.now() - u.lastSeenAgoMinutes * 60_000).toISOString(),
  };
}
const GITHUB_URL = 'https://github.com';

function handle(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? '/', 'http://mock');
  const path = url.pathname;
  const method = req.method ?? 'GET';
  let m: RegExpMatchArray | null;

  if (path === '/__mock/reset' && method === 'POST') {
    seed();
    seedSettings();
    modelSettings.review = { model: null, effort: null };
    modelSettings.chat = { model: null, effort: null };
    send(res, 200, { ok: true });
    return true;
  }
  if (!path.startsWith('/api/')) return false;

  // Repos for trying the PR page's error states: private/* is a repo the
  // signed-in user can't access (after a GitHub-length pause), outage/* is down
  if ((m = path.match(/^\/api\/(?:walkthroughs|rules|comments|chat|files)\/(private|outage)\//))) {
    const [status, body] = m[1] === 'private'
      ? [403, { error: 'You must be a collaborator on this repository to access Cruise Line' }]
      : [503, { error: 'Service unavailable' }];
    setTimeout(() => send(res, status, body), 1500);
    return true;
  }

  if (path === '/api/setup/status') {
    send(res, 200, { configured: true, appSlug: 'cruise-line-mock', appUrl: 'http://localhost:5174', githubUrl: GITHUB_URL, installUrl: `${GITHUB_URL}/apps/cruise-line-mock/installations/new`, hasOwner: true });
    return true;
  }
  if (path === '/api/auth/me') { send(res, 200, USER); return true; }
  if (path === '/api/auth/logout') { send(res, 200, { ok: true }); return true; }
  if (path === '/api/cli/tokens') { send(res, 200, { tokens: [] }); return true; }

  if (path === '/api/settings/repos') { send(res, 200, { installations: [INSTALLATION] }); return true; }
  if ((m = path.match(/^\/api\/settings\/repos\/([^/]+)\/([^/]+)(\/scope)?$/))) {
    const key = `${m[1]}/${m[2]}`;
    const reply = () => send(res, 200, { settings: { owner: m![1], repo: m![2], scopePaths: repoScopes[key] ?? [], updatedAt: null } });
    if (m[3] && method === 'PATCH') {
      readJson(req).then((body) => {
        repoScopes[key] = [...new Set((body.scopePaths as string[] ?? []).map((p) => p.trim().replace(/^\.?\/+|\/+$/g, '')).filter(Boolean))];
        reply();
      });
    } else {
      reply();
    }
    return true;
  }
  if (path === '/api/settings/users') {
    send(res, 200, { users: users.map(userJson) });
    return true;
  }
  if ((m = path.match(/^\/api\/settings\/users\/(\d+)\/role$/)) && method === 'PATCH') {
    const target = users.find((u) => u.userId === Number(m![1]));
    readJson(req).then((body) => {
      if (!target) return send(res, 400, { error: 'Target user has not signed in to Cruise Line yet' });
      if (target.role === 'owner' && body.role === 'user' && users.filter((u) => u.role === 'owner').length <= 1) {
        return send(res, 400, { error: 'Cannot demote the last owner — promote another user to owner first' });
      }
      target.role = body.role;
      send(res, 200, { ok: true, user: userJson(target) });
    });
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
        severityCounts: p.reviewed ? severityCounts(p.reviewed.data.findings) : null,
        // Like the real list: details exist once the PR is tracked
        authorAvatarUrl: p.prState ? `${GITHUB_URL}/${p.author}.png?size=64` : null,
        headRef: p.prState ? p.fixture.headRef : null,
        baseRef: p.prState ? 'main' : null,
        additions: p.prState ? p.fixture.additions : null,
        deletions: p.prState ? p.fixture.deletions : null,
        changedFiles: p.prState ? p.fixture.changedFiles : null,
        mergedAt: p.mergedAt,
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
      pr: {
        title: pr.title,
        author: pr.author,
        authorAvatarUrl: `${GITHUB_URL}/${pr.author}.png?size=64`,
        headRef: pr.fixture.headRef,
        baseRef: 'main',
        additions: pr.fixture.additions,
        deletions: pr.fixture.deletions,
        changedFiles: pr.fixture.changedFiles,
        state: pr.prState ?? 'open',
        mergedAt: pr.mergedAt,
      },
      currentHeadSha: pr.currentHeadSha,
      commitsSinceReview: commitsSinceReview(pr),
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

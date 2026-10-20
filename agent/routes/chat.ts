import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { config } from '../config.js';
import { requireAuth, requireRepoAccess, requireCookieSession } from '../middleware/session.js';
import { AppError } from '../middleware/error.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { ensurePrCheckout } from '../pr-checkout.js';
import { sandboxRepoPath, sandboxQuery, sandboxSessionMessages } from '../sandbox-client.js';
import { chatRuns, streamRunEvents } from '../chat/runs.js';
import { getOrCreateChatSession, getChatSession, touchChatSession, deleteChatSession } from '../db/chat-sessions.js';
import { getLatestWalkthrough } from '../db/walkthroughs.js';
import { listRules } from '../db/rules.js';
import { resolveModel } from '../db/model-settings.js';
import { getInstallationForRepo, getPrMetadata } from '../github/client.js';
import { buildChatSystemPrompt } from '../chat/prompt.js';
import type { AppEnv } from '../env.js';

export const chatRoutes = new Hono<AppEnv>();

// 20 messages per minute per user
const chatLimiter = rateLimit<AppEnv>('chat', {
  windowMs: 60_000,
  max: 20,
  keyFn: (c) => {
    const session = c.get('session');
    return session?.userId ? String(session.userId) : 'unknown';
  },
});

// Chat is an interactive browser feature — GitHub OAuth token is needed to
// fetch PR context, and the surface (streaming SSE, session management) is not
// meant for headless callers. Block Bearer callers at the router level.
chatRoutes.use('/:owner/:repo/:pr/*', requireAuth, requireCookieSession, requireRepoAccess);

/**
 * POST /api/chat/:owner/:repo/:pr/message
 * Starts a chat run and returns its id right away. The run (clone, sandbox
 * query) continues in the background; the browser reads it from /runs/:id/events.
 */
chatRoutes.post('/:owner/:repo/:pr/message', chatLimiter, async (c) => {
  const session = c.get('session');
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));

  if (!owner || !repo) throw new AppError(400, 'Missing route parameters');
  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

  const { message } = await c.req.json<{ message: string }>();
  if (!message?.trim()) throw new AppError(400, 'Message is required');

  if (chatRuns.getActive(owner, repo, prNumber, session.userId)) {
    throw new AppError(409, 'A reply is already in progress');
  }

  const chatSession = await getOrCreateChatSession(
    owner, repo, prNumber, session.userId, session.login,
  );
  const prompt = message.trim();

  const run = chatRuns.start(
    { owner, repo, prNumber, userId: session.userId, prompt },
    async (emit) => {
      const installationId = await getInstallationForRepo(owner, repo);
      const pr = await getPrMetadata(installationId, owner, repo, prNumber);

      // Ensure clone exists in the sandbox's persistent volume
      const cloneResult = await ensurePrCheckout(pr);

      const walkthrough = await getLatestWalkthrough(owner, repo, prNumber);
      const summary = walkthrough?.data?.summary ?? undefined;
      const repoRules = await listRules(owner, repo);
      const rules = repoRules.map((r) => ({ ruleNumber: r.ruleNumber, rule: r.rule }));
      const systemPrompt = buildChatSystemPrompt(owner, repo, prNumber, pr.title, summary, rules.length > 0 ? rules : undefined);
      const modelChoice = await resolveModel('chat');

      try {
        for await (const event of sandboxQuery({
          prompt,
          systemPrompt,
          sessionId: chatSession.session_id,
          repoPath: cloneResult.repoDir,
          ...modelChoice,
          // Bash lets chat run git log and git diff; reviews stay read-only
          allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
          maxTurns: 30,
        })) {
          emit(event);
        }
      } finally {
        await touchChatSession(chatSession.session_id);
      }
    },
  );

  return c.json({ runId: run.id }, 202);
});

/**
 * GET /api/chat/:owner/:repo/:pr/runs/:runId/events
 * Streams a run's events as SSE, starting after `Last-Event-ID` (reconnects)
 * or `?after=` (first connect). Sends an `end` event once the run is done.
 */
chatRoutes.get('/:owner/:repo/:pr/runs/:runId/events', async (c) => {
  const session = c.get('session');
  const run = chatRuns.get(c.req.param('runId'));
  if (
    !run || run.userId !== session.userId || run.owner !== c.req.param('owner')
    || run.repo !== c.req.param('repo') || run.prNumber !== Number(c.req.param('pr'))
  ) {
    throw new AppError(404, 'Chat run not found');
  }

  const after = Number(c.req.header('last-event-id') ?? c.req.query('after') ?? 0) || 0;

  return streamSSE(c, (stream) => streamRunEvents(stream, chatRuns, run, after));
});

/**
 * GET /api/chat/:owner/:repo/:pr/session
 * Proxies session history retrieval to the sandbox.
 */
chatRoutes.get('/:owner/:repo/:pr/session', async (c) => {
  const session = c.get('session');
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));

  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

  const chatSession = await getChatSession(owner, repo, prNumber, session.userId);
  if (!chatSession) {
    return c.json({ session: null, messages: [], activeRun: null });
  }

  const repoPath = sandboxRepoPath(owner, repo, prNumber);
  const messages = await sandboxSessionMessages(chatSession.session_id, repoPath);
  const activeRun = chatRuns.getActive(owner, repo, prNumber, session.userId);

  return c.json({
    session: {
      id: chatSession.id,
      sessionId: chatSession.session_id,
      createdAt: chatSession.created_at,
      lastMessageAt: chatSession.last_message_at,
    },
    messages,
    activeRun: activeRun ? { id: activeRun.id, prompt: activeRun.prompt } : null,
  });
});

/**
 * DELETE /api/chat/:owner/:repo/:pr/session
 */
chatRoutes.delete('/:owner/:repo/:pr/session', async (c) => {
  const session = c.get('session');
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));

  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

  const chatSession = await getChatSession(owner, repo, prNumber, session.userId);
  if (chatSession) {
    await deleteChatSession(chatSession.session_id);
  }

  return c.json({ ok: true });
});

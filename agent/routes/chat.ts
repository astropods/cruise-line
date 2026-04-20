import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { config } from '../config.js';
import { requireAuth, requireRepoAccess } from '../middleware/session.js';
import { AppError } from '../middleware/error.js';
import { ensureClone } from '../repo/manager.js';
import { getOrCreateChatSession, getChatSession, touchChatSession, deleteChatSession } from '../db/chat-sessions.js';
import { getLatestWalkthrough } from '../db/walkthroughs.js';
import { listRules } from '../db/rules.js';
import { getInstallationForRepo, getPrMetadata } from '../github/client.js';
import { buildChatSystemPrompt } from '../chat/prompt.js';
import type { SessionPayload } from '../github/oauth.js';

export const chatRoutes = new Hono();

chatRoutes.use('/:owner/:repo/:pr/*', requireAuth, requireRepoAccess);
chatRoutes.use('/:owner/:repo/:pr', requireAuth, requireRepoAccess);

/**
 * POST /api/chat/:owner/:repo/:pr/message
 * Proxies the chat query to the sandbox container and streams results back.
 */
chatRoutes.post('/:owner/:repo/:pr/message', async (c) => {
  const session = c.get('session') as SessionPayload;
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));

  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

  const { message } = await c.req.json<{ message: string }>();
  if (!message?.trim()) throw new AppError(400, 'Message is required');

  const chatSession = await getOrCreateChatSession(
    owner, repo, prNumber, session.userId, session.login,
  );

  const installationId = await getInstallationForRepo(owner, repo);
  const pr = await getPrMetadata(installationId, owner, repo, prNumber);

  // Ensure clone exists (main agent manages clones, sandbox only reads them)
  const repoDir = await ensureClone(
    owner, repo, prNumber, pr.headSha, pr.headRef, installationId,
  );

  const walkthrough = await getLatestWalkthrough(owner, repo, prNumber);
  const summary = walkthrough?.data?.summary ?? undefined;
  const repoRules = await listRules(owner, repo);
  const rules = repoRules.map((r) => ({ ruleNumber: r.ruleNumber, rule: r.rule }));
  const systemPrompt = buildChatSystemPrompt(owner, repo, prNumber, pr.title, summary, rules.length > 0 ? rules : undefined);

  // Proxy the query to the sandbox container
  const sandboxRes = await fetch(`${config.sandbox.url}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: message.trim(),
      systemPrompt,
      sessionId: chatSession.session_id,
      repoPath: repoDir,
      model: config.claude.model,
      maxTurns: 15,
    }),
  });

  if (!sandboxRes.ok) {
    const body = await sandboxRes.text().catch(() => 'Sandbox error');
    throw new AppError(502, `Sandbox error: ${body}`);
  }

  // Stream the sandbox SSE response through to the client
  return streamSSE(c, async (stream) => {
    try {
      const reader = sandboxRes.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Forward raw SSE data — the sandbox already formats as SSE
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            await stream.writeSSE({ data: line.slice(5).trim() });
          }
        }
      }
    } catch (err) {
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'error',
          message: err instanceof Error ? err.message : 'Stream failed',
        }),
      });
    }

    await touchChatSession(chatSession.session_id);
  });
});

/**
 * GET /api/chat/:owner/:repo/:pr/session
 * Proxies session history retrieval to the sandbox.
 */
chatRoutes.get('/:owner/:repo/:pr/session', async (c) => {
  const session = c.get('session') as SessionPayload;
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));

  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

  const chatSession = await getChatSession(owner, repo, prNumber, session.userId);
  if (!chatSession) {
    return c.json({ session: null, messages: [] });
  }

  const { getRepoDir } = await import('../repo/manager.js');
  const repoDir = getRepoDir(owner, repo, prNumber);

  let messages: any[] = [];

  try {
    const sandboxRes = await fetch(`${config.sandbox.url}/session-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: chatSession.session_id,
        repoPath: repoDir,
      }),
    });

    if (sandboxRes.ok) {
      const data = await sandboxRes.json() as { messages: any[] };
      messages = data.messages ?? [];
    }
  } catch { /* Sandbox may not be available */ }

  return c.json({
    session: {
      id: chatSession.id,
      sessionId: chatSession.session_id,
      createdAt: chatSession.created_at,
      lastMessageAt: chatSession.last_message_at,
    },
    messages,
  });
});

/**
 * DELETE /api/chat/:owner/:repo/:pr/session
 */
chatRoutes.delete('/:owner/:repo/:pr/session', async (c) => {
  const session = c.get('session') as SessionPayload;
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

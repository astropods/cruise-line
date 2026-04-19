import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { config } from '../config.js';
import { requireAuth, requireRepoAccess } from '../middleware/session.js';
import { AppError } from '../middleware/error.js';
import { ensureClone } from '../repo/manager.js';
import { getOrCreateChatSession, getChatSession, touchChatSession, deleteChatSession } from '../db/chat-sessions.js';
import { getLatestWalkthrough } from '../db/walkthroughs.js';
import { getInstallationForRepo, getPrMetadata } from '../github/client.js';
import { buildChatSystemPrompt } from '../chat/prompt.js';
import type { SessionPayload } from '../github/oauth.js';

export const chatRoutes = new Hono();

chatRoutes.use('/:owner/:repo/:pr/*', requireAuth, requireRepoAccess);
chatRoutes.use('/:owner/:repo/:pr', requireAuth, requireRepoAccess);

/**
 * POST /api/chat/:owner/:repo/:pr/message
 * Send a chat message. Response streams via SSE.
 */
chatRoutes.post('/:owner/:repo/:pr/message', async (c) => {
  const session = c.get('session') as SessionPayload;
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));

  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

  const { message } = await c.req.json<{ message: string }>();
  if (!message?.trim()) throw new AppError(400, 'Message is required');

  // Get or create chat session
  const chatSession = await getOrCreateChatSession(
    owner, repo, prNumber, session.userId, session.login,
  );

  // Get PR metadata for clone
  const installationId = await getInstallationForRepo(owner, repo);
  const pr = await getPrMetadata(installationId, owner, repo, prNumber);

  // Ensure clone is ready
  const repoDir = await ensureClone(
    owner, repo, prNumber, pr.headSha, pr.headRef, installationId,
  );

  // Get walkthrough summary for context (if available)
  const walkthrough = await getLatestWalkthrough(owner, repo, prNumber);
  const summary = walkthrough?.data?.summary ?? undefined;

  const systemPrompt = buildChatSystemPrompt(owner, repo, prNumber, pr.title, summary);

  // Determine if this is a resume or new session
  const isFirstMessage = chatSession.created_at.getTime() === chatSession.last_message_at.getTime();

  return streamSSE(c, async (stream) => {
    try {
      const options: any = {
        cwd: repoDir,
        systemPrompt,
        model: config.claude.model,
        allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
        permissionMode: 'bypassPermissions',
        maxTurns: 15,
      };

      if (isFirstMessage) {
        // New session — set the session ID
        options.sessionId = chatSession.session_id;
      } else {
        // Existing session — resume
        options.resume = chatSession.session_id;
      }

      for await (const msg of query({ prompt: message.trim(), options })) {
        if (msg.type === 'assistant' && msg.content) {
          const blocks = Array.isArray(msg.content) ? msg.content : [msg.content];
          for (const block of blocks) {
            if (typeof block === 'string') {
              await stream.writeSSE({ data: JSON.stringify({ type: 'delta', text: block }) });
            } else if (block && typeof block === 'object' && 'type' in block) {
              if (block.type === 'text' && 'text' in block) {
                await stream.writeSSE({ data: JSON.stringify({ type: 'delta', text: block.text }) });
              } else if (block.type === 'tool_use') {
                const toolBlock = block as { name?: string; input?: Record<string, unknown> };
                const name = toolBlock.name ?? 'tool';
                let detail = '';
                const input = toolBlock.input ?? {};
                if ('file_path' in input) detail = String(input.file_path);
                else if ('pattern' in input) detail = String(input.pattern);
                else if ('command' in input) detail = String(input.command).slice(0, 80);
                await stream.writeSSE({
                  data: JSON.stringify({ type: 'tool', name, detail }),
                });
              }
            }
          }
        }

        if (msg.type === 'result') {
          if (msg.subtype === 'success') {
            const result = (msg as any).result ?? '';
            await stream.writeSSE({
              data: JSON.stringify({ type: 'done', text: result }),
            });
          } else {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'error', message: `Stopped: ${msg.subtype}` }),
            });
          }
        }
      }
    } catch (err) {
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'error',
          message: err instanceof Error ? err.message : 'Chat failed',
        }),
      });
    }

    // Update last message timestamp
    await touchChatSession(chatSession.session_id);
  });
});

/**
 * GET /api/chat/:owner/:repo/:pr/session
 * Get the current user's chat session info.
 */
chatRoutes.get('/:owner/:repo/:pr/session', async (c) => {
  const session = c.get('session') as SessionPayload;
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const prNumber = Number(c.req.param('pr'));

  if (isNaN(prNumber)) throw new AppError(400, 'Invalid PR number');

  const chatSession = await getChatSession(owner, repo, prNumber, session.userId);

  if (!chatSession) {
    return c.json({ session: null });
  }

  return c.json({
    session: {
      id: chatSession.id,
      sessionId: chatSession.session_id,
      createdAt: chatSession.created_at,
      lastMessageAt: chatSession.last_message_at,
    },
  });
});

/**
 * DELETE /api/chat/:owner/:repo/:pr/session
 * Reset the chat session (start fresh).
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

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { query, getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import { config } from '../config.js';
import { requireAuth, requireRepoAccess } from '../middleware/session.js';
import { AppError } from '../middleware/error.js';
import { ensureClone, getRepoDir } from '../repo/manager.js';
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
 * Send a chat message. Response streams all events via SSE.
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

  const repoDir = await ensureClone(
    owner, repo, prNumber, pr.headSha, pr.headRef, installationId,
  );

  const walkthrough = await getLatestWalkthrough(owner, repo, prNumber);
  const summary = walkthrough?.data?.summary ?? undefined;
  const systemPrompt = buildChatSystemPrompt(owner, repo, prNumber, pr.title, summary);

  const isFirstMessage = chatSession.created_at.getTime() === chatSession.last_message_at.getTime();

  return streamSSE(c, async (stream) => {
    const heartbeat = setInterval(async () => {
      try {
        await stream.writeSSE({ data: JSON.stringify({ type: 'heartbeat' }) });
      } catch {
        clearInterval(heartbeat);
      }
    }, 5000);

    try {
      const options: any = {
        cwd: repoDir,
        systemPrompt,
        model: config.claude.model,
        allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
        permissionMode: 'bypassPermissions',
        maxTurns: 15,
        includePartialMessages: true,
      };

      if (isFirstMessage) {
        options.sessionId = chatSession.session_id;
      } else {
        options.resume = chatSession.session_id;
      }

      for await (const msg of query({ prompt: message.trim(), options })) {
        if (msg.type === 'stream_event') {
          const event = msg.event as any;

          if (event.type === 'content_block_start' && event.content_block) {
            if (event.content_block.type === 'tool_use') {
              await stream.writeSSE({
                data: JSON.stringify({
                  type: 'tool_start',
                  name: event.content_block.name,
                  toolId: event.content_block.id,
                }),
              });
            }
          } else if (event.type === 'content_block_delta' && event.delta) {
            if (event.delta.type === 'text_delta') {
              await stream.writeSSE({
                data: JSON.stringify({ type: 'text_delta', text: event.delta.text }),
              });
            } else if (event.delta.type === 'input_json_delta') {
              await stream.writeSSE({
                data: JSON.stringify({ type: 'tool_input', json: event.delta.partial_json }),
              });
            }
          }
        } else if (msg.type === 'assistant' && msg.content) {
          // Complete assistant message — extract tool calls with their full inputs
          const blocks = Array.isArray(msg.content) ? msg.content : [msg.content];
          for (const block of blocks) {
            if (block && typeof block === 'object' && 'type' in block) {
              if (block.type === 'tool_use') {
                const tb = block as { name?: string; input?: Record<string, unknown> };
                let detail = '';
                const input = tb.input ?? {};
                if ('file_path' in input) detail = String(input.file_path);
                else if ('path' in input) detail = String(input.path);
                else if ('pattern' in input) detail = String(input.pattern);
                else if ('command' in input) detail = String(input.command).slice(0, 100);
                await stream.writeSSE({
                  data: JSON.stringify({ type: 'tool_call', name: tb.name, detail }),
                });
              }
            }
          }
        } else if (msg.type === 'user') {
          // Tool results come back as user messages
          const userMsg = msg as any;
          if (userMsg.tool_use_result || userMsg.isSynthetic) {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'tool_result' }),
            });
          }
        } else if (msg.type === 'result') {
          if (msg.subtype === 'success') {
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'done',
                text: (msg as any).result ?? '',
                numTurns: (msg as any).num_turns,
                costUsd: (msg as any).total_cost_usd,
              }),
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

    clearInterval(heartbeat);
    await touchChatSession(chatSession.session_id);
  });
});

/**
 * GET /api/chat/:owner/:repo/:pr/session
 * Get session info and full conversation history from the SDK.
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

  // Load conversation history from the Claude SDK's session files
  const repoDir = getRepoDir(owner, repo, prNumber);
  let messages: any[] = [];

  try {
    const raw = await getSessionMessages(chatSession.session_id, { dir: repoDir });
    messages = (raw ?? []).map(formatSessionMessage).filter(Boolean);
  } catch {
    // Session files may not exist yet or be corrupted
  }

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
 * Reset the chat session.
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

/**
 * Format an SDK session message into a simplified structure for the frontend.
 */
function formatSessionMessage(msg: any): any {
  if (msg.type === 'user' && !msg.isSynthetic) {
    // Real user message
    const content = msg.message?.content;
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
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
        let detail = '';
        const input = block.input ?? {};
        if (input.file_path) detail = input.file_path;
        else if (input.path) detail = input.path;
        else if (input.pattern) detail = input.pattern;
        else if (input.command) detail = String(input.command).slice(0, 100);
        parts.push({ type: 'tool_call', name: block.name, detail });
      }
    }

    if (parts.length === 0) return null;
    return { type: 'assistant', parts };
  }

  if (msg.type === 'result') {
    if (msg.subtype === 'success' && msg.result) {
      return { type: 'result', content: msg.result };
    }
  }

  return null;
}

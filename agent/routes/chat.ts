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

/** Extract a human-readable detail string from a tool's input */
function formatToolDetail(name: string, input: Record<string, any>): string {
  switch (name) {
    case 'Read':
      return input.file_path ?? '';
    case 'Bash':
      return String(input.command ?? '').slice(0, 150);
    case 'Grep':
      return `/${input.pattern ?? ''}/ ${input.path ? 'in ' + input.path : ''}`.trim();
    case 'Glob':
      return `${input.pattern ?? ''} ${input.path ? 'in ' + input.path : ''}`.trim();
    case 'Write':
    case 'Edit':
      return input.file_path ?? '';
    default: {
      if (input.file_path) return input.file_path;
      if (input.path) return input.path;
      if (input.pattern) return input.pattern;
      if (input.command) return String(input.command).slice(0, 150);
      return '';
    }
  }
}

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
      };

      if (isFirstMessage) {
        options.sessionId = chatSession.session_id;
      } else {
        options.resume = chatSession.session_id;
      }

      for await (const msg of query({ prompt: message.trim(), options })) {
        const m = msg as any;

        if (m.type === 'assistant') {
          // Assistant turn: content is at msg.message.content (array of blocks)
          const blocks = m.message?.content ?? [];
          for (const block of blocks) {
            if (block.type === 'text' && block.text) {
              await stream.writeSSE({
                data: JSON.stringify({ type: 'text', content: block.text }),
              });
            } else if (block.type === 'tool_use') {
              await stream.writeSSE({
                data: JSON.stringify({
                  type: 'tool_call',
                  name: block.name,
                  detail: formatToolDetail(block.name, block.input ?? {}),
                  input: block.input,
                }),
              });
            }
          }
        } else if (m.type === 'result') {
          if (m.subtype === 'success') {
            // result.result contains the final text if present
            await stream.writeSSE({
              data: JSON.stringify({
                type: 'done',
                text: m.result ?? '',
                numTurns: m.num_turns,
                costUsd: m.total_cost_usd,
              }),
            });
          } else {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'error', message: `Stopped: ${m.subtype}` }),
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

  const repoDir = getRepoDir(owner, repo, prNumber);
  let messages: any[] = [];

  try {
    // Check if the repo dir exists before trying to read session files
    const { existsSync } = await import('fs');
    if (existsSync(repoDir)) {
      // Add a timeout to prevent hanging if SDK has issues
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
      const fetch = getSessionMessages(chatSession.session_id, { dir: repoDir });
      const raw = await Promise.race([fetch, timeout]);
      if (raw) {
        messages = raw.map(formatSessionMessage).filter(Boolean);
      }
    }
  } catch { /* Session files may not exist yet */ }

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

function formatSessionMessage(msg: any): any {
  if (msg.type === 'user' && !msg.isSynthetic) {
    const content = msg.message?.content;
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (Array.isArray(content)) {
      text = content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
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
        parts.push({
          type: 'tool_call',
          name: block.name,
          detail: formatToolDetail(block.name, block.input ?? {}),
          input: block.input,
        });
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

import { sql } from '../db/client.js';
import { config } from '../config.js';
import { createChatArchive } from '../db/chat-archives.js';
import type { ChatSessionRow } from '../db/chat-sessions.js';

/**
 * Archive all chat sessions for a PR before cleanup.
 * Fetches messages from the sandbox for each session and stores them in the DB.
 */
export async function archiveChatSessionsForPr(
  owner: string,
  repo: string,
  prNumber: number,
  repoDir: string,
): Promise<void> {
  // Find all active sessions for this PR
  const sessions = await sql<ChatSessionRow[]>`
    SELECT * FROM chat_sessions
    WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${prNumber}
  `;

  if (sessions.length === 0) return;

  for (const session of sessions) {
    try {
      const messages = await fetchSessionMessages(session.session_id, repoDir);
      if (messages.length === 0) continue;

      await createChatArchive(
        owner,
        repo,
        prNumber,
        session.user_id,
        session.user_login,
        messages,
        session.created_at,
      );

      console.log(`Archived chat session for ${owner}/${repo}#${prNumber} (user: ${session.user_login})`);
    } catch (err) {
      // Don't let a single session failure block other archives
      console.error(`Failed to archive chat session ${session.session_id}:`, err);
    }
  }
}

/**
 * Fetch messages from the sandbox for a given session.
 */
async function fetchSessionMessages(sessionId: string, repoPath: string): Promise<any[]> {
  try {
    const res = await fetch(`${config.sandbox.url}/session-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, repoPath }),
    });

    if (!res.ok) return [];

    const data = await res.json() as { messages: any[] };
    return data.messages ?? [];
  } catch {
    return [];
  }
}

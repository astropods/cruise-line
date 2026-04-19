import { sql } from './client.js';

export interface ChatSessionRow {
  id: number;
  session_id: string;
  owner: string;
  repo: string;
  pr_number: number;
  user_id: number;
  user_login: string;
  created_at: Date;
  last_message_at: Date;
}

export async function getOrCreateChatSession(
  owner: string,
  repo: string,
  prNumber: number,
  userId: number,
  userLogin: string,
): Promise<ChatSessionRow> {
  // Try to find existing session for this user + PR
  const [existing] = await sql<ChatSessionRow[]>`
    SELECT * FROM chat_sessions
    WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${prNumber} AND user_id = ${userId}
    LIMIT 1
  `;

  if (existing) return existing;

  // Create new session with a random UUID
  const sessionId = crypto.randomUUID();
  const [row] = await sql<ChatSessionRow[]>`
    INSERT INTO chat_sessions (session_id, owner, repo, pr_number, user_id, user_login)
    VALUES (${sessionId}, ${owner}, ${repo}, ${prNumber}, ${userId}, ${userLogin})
    RETURNING *
  `;
  return row;
}

export async function getChatSession(
  owner: string,
  repo: string,
  prNumber: number,
  userId: number,
): Promise<ChatSessionRow | null> {
  const [row] = await sql<ChatSessionRow[]>`
    SELECT * FROM chat_sessions
    WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${prNumber} AND user_id = ${userId}
    LIMIT 1
  `;
  return row ?? null;
}

export async function touchChatSession(sessionId: string): Promise<void> {
  await sql`
    UPDATE chat_sessions SET last_message_at = NOW() WHERE session_id = ${sessionId}
  `;
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await sql`DELETE FROM chat_sessions WHERE session_id = ${sessionId}`;
}

export async function deleteChatSessionsForPr(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<void> {
  await sql`
    DELETE FROM chat_sessions
    WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${prNumber}
  `;
}

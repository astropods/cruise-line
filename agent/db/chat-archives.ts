import { sql } from './client.js';

export interface ChatArchiveRow {
  id: number;
  owner: string;
  repo: string;
  pr_number: number;
  user_id: number;
  user_login: string;
  messages: any[];
  session_created_at: Date;
  archived_at: Date;
}

export async function createChatArchive(
  owner: string,
  repo: string,
  prNumber: number,
  userId: number,
  userLogin: string,
  messages: any[],
  sessionCreatedAt: Date,
): Promise<ChatArchiveRow> {
  const [row] = await sql<ChatArchiveRow[]>`
    INSERT INTO chat_archives (owner, repo, pr_number, user_id, user_login, messages, session_created_at)
    VALUES (${owner}, ${repo}, ${prNumber}, ${userId}, ${userLogin}, ${JSON.stringify(messages)}, ${sessionCreatedAt})
    RETURNING *
  `;
  return row;
}

export async function getChatArchives(
  owner: string,
  repo: string,
  prNumber: number,
  userId: number,
): Promise<ChatArchiveRow[]> {
  return sql<ChatArchiveRow[]>`
    SELECT * FROM chat_archives
    WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${prNumber} AND user_id = ${userId}
    ORDER BY session_created_at DESC
  `;
}

export async function getAllChatArchivesForPr(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<ChatArchiveRow[]> {
  return sql<ChatArchiveRow[]>`
    SELECT * FROM chat_archives
    WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${prNumber}
    ORDER BY session_created_at DESC
  `;
}

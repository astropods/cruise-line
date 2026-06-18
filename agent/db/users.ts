import { sql } from './client.js';

export interface UserRecord {
  userId: number;
  login: string;
  avatarUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
  loginCount: number;
}

interface UserRow {
  user_id: number;
  login: string;
  avatar_url: string;
  first_seen_at: Date;
  last_seen_at: Date;
  login_count: number;
}

function rowToRecord(row: UserRow): UserRecord {
  return {
    userId: row.user_id,
    login: row.login,
    avatarUrl: row.avatar_url,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    loginCount: row.login_count,
  };
}

/**
 * Record a successful OAuth login. Inserts the user on first sight, or bumps
 * last_seen_at + login_count on repeat logins. Login/avatar are refreshed
 * each time so renames and avatar changes propagate.
 */
export async function recordUserLogin(input: {
  userId: number;
  login: string;
  avatarUrl: string;
}): Promise<void> {
  await sql`
    INSERT INTO users (user_id, login, avatar_url, login_count)
    VALUES (${input.userId}, ${input.login}, ${input.avatarUrl}, 1)
    ON CONFLICT (user_id) DO UPDATE SET
      login         = EXCLUDED.login,
      avatar_url    = EXCLUDED.avatar_url,
      last_seen_at  = NOW(),
      login_count   = users.login_count + 1
  `;
}

export async function listUsers(): Promise<UserRecord[]> {
  const rows = await sql<UserRow[]>`
    SELECT user_id, login, avatar_url, first_seen_at, last_seen_at, login_count
    FROM users
    ORDER BY last_seen_at DESC
  `;
  return rows.map(rowToRecord);
}

export async function getUser(userId: number): Promise<UserRecord | null> {
  const [row] = await sql<UserRow[]>`
    SELECT user_id, login, avatar_url, first_seen_at, last_seen_at, login_count
    FROM users
    WHERE user_id = ${userId}
  `;
  return row ? rowToRecord(row) : null;
}

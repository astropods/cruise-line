import { sql } from './client.js';

export type UserRole = 'user' | 'owner';

export interface UserRecord {
  userId: number;
  login: string;
  avatarUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
  loginCount: number;
  role: UserRole;
}

interface UserRow {
  user_id: number;
  login: string;
  avatar_url: string;
  first_seen_at: Date;
  last_seen_at: Date;
  login_count: number;
  role: UserRole;
}

function rowToRecord(row: UserRow): UserRecord {
  return {
    userId: row.user_id,
    login: row.login,
    avatarUrl: row.avatar_url,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    loginCount: row.login_count,
    role: row.role,
  };
}

/**
 * Record a successful OAuth login. Inserts the user on first sight, or bumps
 * last_seen_at + login_count on repeat logins. Login/avatar are refreshed
 * each time so renames and avatar changes propagate. Role is intentionally
 * left untouched on conflict so a re-login never changes someone's role.
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

/**
 * Mark a user as active without bumping login_count. Used by the requireAuth
 * middleware so users with long-lived session cookies (who don't trip the
 * OAuth callback for days) still appear in the dashboard. Same row-shape as
 * recordUserLogin so the schema constraints don't drift, but the conflict
 * branch only refreshes login/avatar/last_seen.
 */
export async function touchUser(input: {
  userId: number;
  login: string;
  avatarUrl: string;
}): Promise<void> {
  await sql`
    INSERT INTO users (user_id, login, avatar_url)
    VALUES (${input.userId}, ${input.login}, ${input.avatarUrl})
    ON CONFLICT (user_id) DO UPDATE SET
      login         = EXCLUDED.login,
      avatar_url    = EXCLUDED.avatar_url,
      last_seen_at  = NOW()
  `;
}

export async function listUsers(): Promise<UserRecord[]> {
  const rows = await sql<UserRow[]>`
    SELECT user_id, login, avatar_url, first_seen_at, last_seen_at, login_count, role
    FROM users
    ORDER BY last_seen_at DESC
  `;
  return rows.map(rowToRecord);
}

export async function getUser(userId: number): Promise<UserRecord | null> {
  const [row] = await sql<UserRow[]>`
    SELECT user_id, login, avatar_url, first_seen_at, last_seen_at, login_count, role
    FROM users
    WHERE user_id = ${userId}
  `;
  return row ? rowToRecord(row) : null;
}

export async function setUserRole(userId: number, role: UserRole): Promise<void> {
  await sql`UPDATE users SET role = ${role} WHERE user_id = ${userId}`;
}

export async function countUsersByRole(role: UserRole): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::INTEGER AS count FROM users WHERE role = ${role}
  `;
  return row?.count ?? 0;
}

/**
 * Promote a user to owner only if no other user currently holds the role.
 * Race-safe: a single UPDATE statement with a subquery guard.
 *
 * Used by the OAuth-first-login claim path and the manual /api/setup/claim
 * endpoint. Returns true if this call did the promotion, false if someone
 * else got there first.
 */
export async function claimOwnerIfNone(userId: number): Promise<boolean> {
  const [row] = await sql<{ user_id: number }[]>`
    UPDATE users
    SET role = 'owner'
    WHERE user_id = ${userId}
      AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'owner')
    RETURNING user_id
  `;
  return !!row;
}

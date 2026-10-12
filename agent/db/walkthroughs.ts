import { sql } from './client.js';
import type { Walkthrough } from '../analysis/types.js';

export interface WalkthroughRow {
  id: number;
  owner: string;
  repo: string;
  pr_number: number;
  head_sha: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  error: string | null;
  data: Walkthrough | null;
  created_at: Date;
  updated_at: Date;
}

export async function upsertWalkthrough(
  owner: string,
  repo: string,
  prNumber: number,
  headSha: string,
  force = false,
): Promise<WalkthroughRow> {
  if (force) {
    // Reset existing row to pending, clear old data
    const [existing] = await sql<WalkthroughRow[]>`
      UPDATE walkthroughs
      SET status = 'pending', data = NULL, error = NULL, updated_at = NOW()
      WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${prNumber} AND head_sha = ${headSha}
      RETURNING *
    `;
    if (existing) return existing;
  }

  const [row] = await sql<WalkthroughRow[]>`
    INSERT INTO walkthroughs (owner, repo, pr_number, head_sha)
    VALUES (${owner}, ${repo}, ${prNumber}, ${headSha})
    ON CONFLICT (owner, repo, pr_number, head_sha)
    DO UPDATE SET updated_at = NOW()
    RETURNING *
  `;
  return row;
}

export async function getLatestWalkthrough(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<WalkthroughRow | null> {
  const [row] = await sql<WalkthroughRow[]>`
    SELECT * FROM walkthroughs
    WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${prNumber}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return row ?? null;
}

export async function getWalkthroughById(id: number): Promise<WalkthroughRow | null> {
  const [row] = await sql<WalkthroughRow[]>`
    SELECT * FROM walkthroughs WHERE id = ${id}
  `;
  return row ?? null;
}

export async function deleteWalkthrough(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<void> {
  await sql`
    DELETE FROM walkthroughs
    WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${prNumber}
  `;
}

// Postgres TEXT/JSONB can't hold U+0000, so a NUL byte in a patch or file
// fails the whole save. Swap it for the visible ␀ (U+2400); one char for one,
// so line and column positions in patches are unchanged.
export function replaceNul<T>(value: T): T {
  if (typeof value === 'string') return value.replace(/\u0000/g, '␀') as T;
  if (Array.isArray(value)) return value.map(replaceNul) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [replaceNul(k), replaceNul(v)]),
    ) as T;
  }
  return value;
}

export async function updateWalkthroughStatus(
  id: number,
  status: WalkthroughRow['status'],
  data?: Walkthrough,
  error?: string,
): Promise<void> {
  await sql`
    UPDATE walkthroughs
    SET status = ${status},
        data = ${data ? sql.json(replaceNul(data)) : null},
        error = ${error ? replaceNul(error) : null},
        updated_at = NOW()
    WHERE id = ${id}
  `;
}

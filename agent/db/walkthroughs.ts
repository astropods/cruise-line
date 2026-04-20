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

export async function updateWalkthroughStatus(
  id: number,
  status: WalkthroughRow['status'],
  data?: Walkthrough,
  error?: string,
): Promise<void> {
  await sql`
    UPDATE walkthroughs
    SET status = ${status},
        data = ${data ? sql.json(data) : null},
        error = ${error ?? null},
        updated_at = NOW()
    WHERE id = ${id}
  `;
}

import { sql } from './client.js';
import { replaceNul } from './replace-nul.js';
import type { Walkthrough } from '../analysis/types.js';
import { summarizeReview } from '../analysis/summary.js';

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
    // Reset existing row to pending. Old data stays so the viewer can keep
    // showing the previous review while the new one runs; a successful run
    // overwrites it.
    const [existing] = await sql<WalkthroughRow[]>`
      UPDATE walkthroughs
      SET status = 'pending', error = NULL, updated_at = NOW()
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

/**
 * The most recent walkthrough that has content, whatever its current status.
 * A row being regenerated (or whose regeneration failed) keeps its previous
 * data, so it still counts.
 */
export async function getLatestReviewedWalkthrough(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<WalkthroughRow | null> {
  const [row] = await sql<WalkthroughRow[]>`
    SELECT * FROM walkthroughs
    WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${prNumber}
      AND data IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return row ?? null;
}

export interface PrSummaryRow {
  owner: string;
  repo: string;
  pr_number: number;
  /** Status of the most recent walkthrough row; null if a review was never triggered */
  status: WalkthroughRow['status'] | null;
  head_sha: string;
  updated_at: Date;
  /** Null for PRs reviewed before tracking began, until their next webhook event */
  pr_state: 'open' | 'closed' | 'merged' | null;
  /** Live title from tracking, else from the latest review; null if neither exists */
  title: string | null;
  author: string | null;
  verdict: Walkthrough['verdict'] | null;
  /** Severity → count for the latest review; null when there's no review */
  severity_counts: Record<string, number> | null;
  author_avatar_url: string | null;
  head_ref: string | null;
  base_ref: string | null;
  additions: number | null;
  deletions: number | null;
  changed_files: number | null;
  merged_at: Date | null;
}

/**
 * One row per PR that is tracked (seen via webhook) or has ever had a
 * walkthrough, most recently active first.
 */
export async function listPrSummaries(): Promise<PrSummaryRow[]> {
  return sql<PrSummaryRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON (owner, repo, pr_number)
        owner, repo, pr_number, status, head_sha, updated_at
      FROM walkthroughs
      ORDER BY owner, repo, pr_number, created_at DESC
    ),
    prs AS (
      SELECT owner, repo, pr_number FROM latest
      UNION
      SELECT owner, repo, pr_number FROM tracked_prs
    )
    SELECT
      prs.owner, prs.repo, prs.pr_number,
      latest.status,
      COALESCE(latest.head_sha, t.head_sha) AS head_sha,
      GREATEST(latest.updated_at, t.updated_at) AS updated_at,
      t.state AS pr_state,
      COALESCE(t.title, reviewed.summary->>'title') AS title,
      COALESCE(t.author, reviewed.summary->>'author') AS author,
      reviewed.summary->>'verdict' AS verdict,
      reviewed.summary->'severityCounts' AS severity_counts,
      t.author_avatar_url, t.head_ref, t.base_ref,
      t.additions, t.deletions, t.changed_files, t.merged_at
    FROM prs
    LEFT JOIN latest USING (owner, repo, pr_number)
    LEFT JOIN tracked_prs t USING (owner, repo, pr_number)
    LEFT JOIN LATERAL (
      -- summary, not data: data holds file contents and is large
      SELECT summary FROM walkthroughs w
      WHERE w.owner = prs.owner AND w.repo = prs.repo
        AND w.pr_number = prs.pr_number AND w.summary IS NOT NULL
      ORDER BY w.created_at DESC
      LIMIT 1
    ) reviewed ON TRUE
    ORDER BY updated_at DESC
  `;
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

/** Leaves `data` untouched when none is passed, so a failed rerun keeps the previous review. */
export async function updateWalkthroughStatus(
  id: number,
  status: WalkthroughRow['status'],
  data?: Walkthrough,
  error?: string,
): Promise<void> {
  await sql`
    UPDATE walkthroughs
    SET status = ${status},
        data = ${data ? sql.json(replaceNul(data)) : sql`data`},
        summary = ${data ? sql.json(replaceNul(summarizeReview(data)) as any) : sql`summary`},
        error = ${error ? replaceNul(error) : null},
        updated_at = NOW()
    WHERE id = ${id}
  `;
}

/**
 * Marks every pending or running row failed. Jobs live in memory, so after a
 * restart nothing will ever finish these; left alone they'd spin forever.
 */
export async function failInterruptedWalkthroughs(): Promise<WalkthroughRow[]> {
  return sql<WalkthroughRow[]>`
    UPDATE walkthroughs
    SET status = 'failed', error = 'Interrupted by a restart. Run the review again.', updated_at = NOW()
    WHERE status IN ('pending', 'running')
    RETURNING id, owner, repo, pr_number, head_sha, status, error, NULL::jsonb AS data, created_at, updated_at
  `;
}

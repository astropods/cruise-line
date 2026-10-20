import { sql } from './client.js';

export type TrackedPrState = 'open' | 'closed' | 'merged';

/**
 * What callers know about a PR. The webhook payload and a live GitHub
 * lookup (PrMetadata) both fit this shape. Optional fields a caller leaves
 * out keep their stored values.
 */
export interface TrackedPrInput {
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  headSha: string;
  authorAvatarUrl?: string | null;
  headRef?: string | null;
  baseRef?: string | null;
  additions?: number | null;
  deletions?: number | null;
  changedFiles?: number | null;
  /** Defaults to open: opened, reopened, and new commits all mean open */
  state?: TrackedPrState;
  mergedAt?: string | null;
  closedAt?: string | null;
  /**
   * GitHub's updated_at for the PR as the caller saw it. A write older than
   * the stored one is ignored, so a late or redelivered webhook can't undo
   * newer state.
   */
  updatedAt?: string | null;
}

/**
 * Records a PR, refreshing everything the caller knows about it. Returns
 * false when the stored row is newer than this write and was left alone.
 */
export async function upsertTrackedPr(pr: TrackedPrInput): Promise<boolean> {
  const state = pr.state ?? 'open';
  const rows = await sql`
    INSERT INTO tracked_prs (
      owner, repo, pr_number, title, author, head_sha, state,
      author_avatar_url, head_ref, base_ref, additions, deletions, changed_files,
      merged_at, closed_at, pr_updated_at
    )
    VALUES (
      ${pr.owner}, ${pr.repo}, ${pr.number}, ${pr.title}, ${pr.author}, ${pr.headSha}, ${state},
      ${pr.authorAvatarUrl ?? null}, ${pr.headRef ?? null}, ${pr.baseRef ?? null},
      ${pr.additions ?? null}, ${pr.deletions ?? null}, ${pr.changedFiles ?? null},
      ${pr.mergedAt ?? null}, ${pr.closedAt ?? null}, ${pr.updatedAt ?? null}
    )
    ON CONFLICT (owner, repo, pr_number)
    DO UPDATE SET
      title = EXCLUDED.title,
      author = EXCLUDED.author,
      head_sha = EXCLUDED.head_sha,
      state = EXCLUDED.state,
      author_avatar_url = COALESCE(EXCLUDED.author_avatar_url, tracked_prs.author_avatar_url),
      head_ref = COALESCE(EXCLUDED.head_ref, tracked_prs.head_ref),
      base_ref = COALESCE(EXCLUDED.base_ref, tracked_prs.base_ref),
      additions = COALESCE(EXCLUDED.additions, tracked_prs.additions),
      deletions = COALESCE(EXCLUDED.deletions, tracked_prs.deletions),
      changed_files = COALESCE(EXCLUDED.changed_files, tracked_prs.changed_files),
      merged_at = CASE WHEN EXCLUDED.state = 'open' THEN NULL
                       ELSE COALESCE(EXCLUDED.merged_at, tracked_prs.merged_at) END,
      closed_at = CASE WHEN EXCLUDED.state = 'open' THEN NULL
                       ELSE COALESCE(EXCLUDED.closed_at, tracked_prs.closed_at) END,
      pr_updated_at = COALESCE(EXCLUDED.pr_updated_at, tracked_prs.pr_updated_at),
      updated_at = NOW()
    WHERE tracked_prs.pr_updated_at IS NULL
       OR EXCLUDED.pr_updated_at IS NULL
       OR EXCLUDED.pr_updated_at >= tracked_prs.pr_updated_at
    RETURNING 1
  `;
  return rows.length > 0;
}

/** Updates a tracked PR's title; a no-op for PRs that were never tracked. */
export async function updateTrackedPrTitle(
  owner: string,
  repo: string,
  prNumber: number,
  title: string,
): Promise<void> {
  await sql`
    UPDATE tracked_prs SET title = ${title}, updated_at = NOW()
    WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${prNumber}
  `;
}

/** Marks a tracked PR closed or merged; a no-op for PRs that were never tracked. */
export async function setTrackedPrState(
  owner: string,
  repo: string,
  prNumber: number,
  state: Exclude<TrackedPrState, 'open'>,
  at: { mergedAt?: string | null; closedAt?: string | null; updatedAt?: string | null } = {},
): Promise<void> {
  await sql`
    UPDATE tracked_prs
    SET state = ${state},
        merged_at = ${at.mergedAt ?? null},
        closed_at = ${at.closedAt ?? null},
        pr_updated_at = COALESCE(${at.updatedAt ?? null}::timestamptz, pr_updated_at),
        updated_at = NOW()
    WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${prNumber}
      AND (pr_updated_at IS NULL OR ${at.updatedAt ?? null}::timestamptz IS NULL
           OR ${at.updatedAt ?? null}::timestamptz >= pr_updated_at)
  `;
}

/**
 * PRs missing the details from migration 012: tracked rows the backfill
 * hasn't reached, and PRs reviewed before tracking existed.
 */
export async function listPrsNeedingDetails(limit: number): Promise<{ owner: string; repo: string; pr_number: number }[]> {
  return sql<{ owner: string; repo: string; pr_number: number }[]>`
    SELECT owner, repo, pr_number FROM (
      -- Rows that failed recently wait a day, and go after untried ones
      SELECT owner, repo, pr_number, details_checked_at FROM tracked_prs
      WHERE head_ref IS NULL
        AND (details_checked_at IS NULL OR details_checked_at < NOW() - INTERVAL '1 day')
      UNION
      SELECT DISTINCT w.owner, w.repo, w.pr_number, NULL::timestamptz FROM walkthroughs w
      WHERE NOT EXISTS (
        SELECT 1 FROM tracked_prs t
        WHERE t.owner = w.owner AND t.repo = w.repo AND t.pr_number = w.pr_number
      )
    ) pending
    ORDER BY details_checked_at NULLS FIRST
    LIMIT ${limit}
  `;
}

/** Notes that the backfill couldn't fill this PR, so it waits before trying again */
export async function markDetailsChecked(owner: string, repo: string, prNumber: number): Promise<void> {
  await sql`
    UPDATE tracked_prs SET details_checked_at = NOW()
    WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${prNumber}
  `;
}

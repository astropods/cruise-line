import { sql } from './client.js';

export type TrackedPrState = 'open' | 'closed' | 'merged';

/** Records a PR as open, refreshing its title, author, and head. */
export async function upsertTrackedPr(pr: {
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  headSha: string;
}): Promise<void> {
  await sql`
    INSERT INTO tracked_prs (owner, repo, pr_number, title, author, head_sha)
    VALUES (${pr.owner}, ${pr.repo}, ${pr.number}, ${pr.title}, ${pr.author}, ${pr.headSha})
    ON CONFLICT (owner, repo, pr_number)
    DO UPDATE SET title = EXCLUDED.title, author = EXCLUDED.author,
                  head_sha = EXCLUDED.head_sha, state = 'open', updated_at = NOW()
  `;
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
): Promise<void> {
  await sql`
    UPDATE tracked_prs SET state = ${state}, updated_at = NOW()
    WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${prNumber}
  `;
}

import { failInterruptedWalkthroughs, type WalkthroughRow } from '../db/walkthroughs.js';
import { getInstallationForRepo, postAnalysisComment } from '../github/client.js';

/**
 * Review jobs live in memory, so a restart drops any in flight. Call before
 * the server takes requests: it fails those rows so the UI offers a rerun
 * instead of spinning. Returns them for commentOnInterruptedReviews.
 */
export async function failInterruptedReviews(): Promise<WalkthroughRow[]> {
  const rows = await failInterruptedWalkthroughs();
  if (rows.length > 0) console.warn(`Marked ${rows.length} interrupted review(s) failed`);
  return rows;
}

/** Point each interrupted PR's comment at a retry. Best-effort, one PR at a time. */
export async function commentOnInterruptedReviews(rows: WalkthroughRow[]): Promise<void> {
  const prs = new Map(rows.map((r) => [`${r.owner}/${r.repo}#${r.pr_number}`, r]));
  for (const row of prs.values()) {
    try {
      const installationId = await getInstallationForRepo(row.owner, row.repo);
      await postAnalysisComment(installationId, row.owner, row.repo, row.pr_number, { status: 'failed' });
    } catch (err) {
      console.warn(`Couldn't update the comment on ${row.owner}/${row.repo}#${row.pr_number}:`, err instanceof Error ? err.message : err);
    }
  }
}

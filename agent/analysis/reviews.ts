/**
 * Reviews as the API sees them: what a PR page shows, and starting a run.
 * Routes handle HTTP and auth; this handles GitHub, the database, and jobs.
 */
import { getLatestReviewedWalkthrough, getLatestWalkthrough, upsertWalkthrough, type WalkthroughRow } from '../db/walkthroughs.js';
import { upsertTrackedPr } from '../db/tracked-prs.js';
import { countCommitsBetween, getInstallationForRepo, getPrMetadata } from '../github/client.js';
import type { PrMetadata } from '../github/types.js';
import { jobManager } from './jobs.js';

export type PrDetails = Pick<
  PrMetadata,
  'title' | 'author' | 'authorAvatarUrl' | 'headRef' | 'baseRef' | 'additions' | 'deletions' | 'changedFiles' | 'state' | 'mergedAt'
>;

export interface PrView {
  /** The current or most recent run */
  latest: WalkthroughRow | null;
  /** The newest run with content, which may be older than `latest` while a rerun runs */
  reviewed: WalkthroughRow | null;
  /** Live from GitHub; null when GitHub can't be reached or the PR is gone */
  pr: PrDetails | null;
  currentHeadSha: string | null;
  /** Commits since the reviewed head; null when unknown or not stale */
  commitsSinceReview: number | null;
}

/**
 * Everything the PR page needs. Also refreshes tracked_prs from the live
 * lookup, so the inbox catches up whenever someone opens a PR.
 */
export async function loadPrView(owner: string, repo: string, prNumber: number): Promise<PrView> {
  const [latest, reviewed] = await Promise.all([
    getLatestWalkthrough(owner, repo, prNumber),
    getLatestReviewedWalkthrough(owner, repo, prNumber),
  ]);
  const view: PrView = { latest, reviewed, pr: null, currentHeadSha: null, commitsSinceReview: null };

  try {
    const installationId = await getInstallationForRepo(owner, repo);
    const meta = await getPrMetadata(installationId, owner, repo, prNumber);
    view.currentHeadSha = meta.headSha;
    view.pr = {
      title: meta.title,
      author: meta.author,
      authorAvatarUrl: meta.authorAvatarUrl,
      headRef: meta.headRef,
      baseRef: meta.baseRef,
      additions: meta.additions,
      deletions: meta.deletions,
      changedFiles: meta.changedFiles,
      state: meta.state,
      mergedAt: meta.mergedAt,
    };
    upsertTrackedPr(meta).catch((err) =>
      console.error(`Failed to refresh tracked ${owner}/${repo}#${prNumber}:`, err),
    );
    if (reviewed && reviewed.head_sha !== meta.headSha) {
      view.commitsSinceReview = await countCommitsBetween(installationId, owner, repo, reviewed.head_sha, meta.headSha);
    }
  } catch {
    // The stored review still shows when GitHub can't be reached
  }
  return view;
}

export type TriggerResult =
  /** The current head already has a finished review */
  | { outcome: 'already-reviewed'; walkthroughId: number }
  /** A run for the current head is queued or running */
  | { outcome: 'in-progress'; walkthroughId: number; state: string }
  | { outcome: 'queued'; walkthroughId: number };

/**
 * Start a review of the PR's current head, unless one exists or is running.
 * `force` reruns a head that already has a review; the old one stays visible
 * until the new one succeeds.
 */
export async function triggerReview(
  owner: string,
  repo: string,
  prNumber: number,
  { force = false }: { force?: boolean } = {},
): Promise<TriggerResult> {
  const installationId = await getInstallationForRepo(owner, repo);
  const pr = await getPrMetadata(installationId, owner, repo, prNumber);

  if (!force) {
    const existing = await getLatestWalkthrough(owner, repo, prNumber);
    if (existing && existing.head_sha === pr.headSha && existing.status === 'complete') {
      return { outcome: 'already-reviewed', walkthroughId: existing.id };
    }
  }

  const runningJob = jobManager.getJob(owner, repo, prNumber, pr.headSha);
  if (runningJob) {
    return { outcome: 'in-progress', walkthroughId: runningJob.walkthroughId, state: runningJob.state };
  }

  // Covers PRs opened before tracking existed. Best-effort, like the webhook.
  await upsertTrackedPr(pr).catch((err) =>
    console.error(`Failed to track ${owner}/${repo}#${prNumber}:`, err),
  );

  const row = await upsertWalkthrough(owner, repo, prNumber, pr.headSha, force);
  jobManager.enqueue(row.id, pr);
  return { outcome: 'queued', walkthroughId: row.id };
}

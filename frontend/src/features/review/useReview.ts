import { useCallback } from 'react';
import type { PrDetails, ProgressEntry, RunStatus, Walkthrough } from '../../api';
import { isRunning } from '../../domain/prStatus';
import { usePr, useReviewProgress } from './usePr';
import { useStartReview } from './useStartReview';

interface WalkthroughState {
  /** The review to display — the latest one with content, even while a newer run is in flight */
  walkthrough: Walkthrough | null;
  /**
   * Status of the most recent run. 'loading' until the first fetch returns,
   * 'unavailable' when it failed (no access, or an outage: see `loadError`).
   * 'failed' is a run, or starting one, that failed, with the message in `error`.
   */
  status: 'loading' | 'unavailable' | RunStatus;
  /** Why the PR couldn't be loaded; the page shows this instead of the PR */
  loadError: Error | null;
  error: string | null;
  currentHeadSha: string | null;
  /** The displayed review predates the PR's current head */
  isStale: boolean;
  /** Commits since the reviewed head; null when not stale or unknown */
  commitsSinceReview: number | null;
  progress: ProgressEntry[];
  githubUrl: string;
  /** When the current run started (ISO string) */
  startedAt: string | null;
  /** Live PR details, so the header can render before the first review lands */
  prInfo: PrDetails | null;
}

/**
 * The PR page's view of a review: usePr, useReviewProgress, and
 * useStartReview combined into what the page renders.
 */
export function useReview(owner: string, repo: string, pr: number) {
  const prQuery = usePr(owner, repo, pr);
  const res = prQuery.data;
  const run = res?.walkthrough ?? null;
  const runStatus: RunStatus = run?.status ?? 'none';
  const inFlight = isRunning(runStatus);
  const start = useStartReview();
  // Poll only once the start request lands: before that the server still
  // reports the previous run, which would read as already finished
  const progress = useReviewProgress(owner, repo, pr, inFlight && !start.isPending);

  const review = res?.latestReview ?? null;
  // The progress poll sees pending → running before the PR refetches
  const liveStatus = inFlight && progress.data && isRunning(progress.data.status as RunStatus)
    ? (progress.data.status as RunStatus)
    : runStatus;

  let status: WalkthroughState['status'] = liveStatus;
  let error = run?.error ?? null;
  if (prQuery.isPending) status = 'loading';
  else if (prQuery.isError) status = 'unavailable';
  else if (start.isError) {
    status = 'failed';
    error = start.error.message;
  }

  const state: WalkthroughState = {
    walkthrough: review?.data ?? null,
    status,
    error,
    loadError: prQuery.isError ? prQuery.error : null,
    currentHeadSha: res?.currentHeadSha ?? null,
    isStale: !!(review && res?.currentHeadSha && review.headSha !== res.currentHeadSha),
    commitsSinceReview: res?.commitsSinceReview ?? null,
    progress: inFlight ? progress.data?.progress ?? [] : [],
    githubUrl: res?.githubUrl ?? 'https://github.com',
    // A forced rerun reuses its row, so created_at can be long past;
    // updated_at is bumped when the run is queued and again when it starts.
    startedAt: inFlight ? run!.updatedAt : null,
    prInfo: res?.pr ?? null,
  };

  const generate = useCallback(() => {
    const force = runStatus === 'complete' || runStatus === 'failed';
    start.reset();
    start.mutate({ owner, repo, number: pr, force });
  }, [owner, repo, pr, runStatus, start]);

  return { ...state, generate, retryLoad: prQuery.refetch };
}

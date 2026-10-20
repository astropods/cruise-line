import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchWalkthrough,
  generateWalkthrough,
  fetchStatus,
  type Walkthrough,
  type ProgressEntry,
} from '../api';

type RunStatus = 'none' | 'pending' | 'running' | 'complete' | 'failed';

interface WalkthroughState {
  /** The review to display — the latest one with content, even while a newer run is in flight */
  walkthrough: Walkthrough | null;
  /**
   * Status of the most recent run. 'loading' until the first fetch returns;
   * 'failed' also covers a failed fetch, with the message in `error`.
   */
  status: 'loading' | RunStatus;
  error: string | null;
  currentHeadSha: string | null;
  walkthroughHeadSha: string | null;
  /** The displayed review predates the PR's current head */
  isStale: boolean;
  progress: ProgressEntry[];
  githubUrl: string;
  /** When the current run started (ISO string) */
  startedAt: string | null;
  /** Live PR metadata, so the header can render before the first review lands */
  prInfo: { title: string; author: string } | null;
}

export function useWalkthrough(owner: string, repo: string, pr: number) {
  const [state, setState] = useState<WalkthroughState>({
    walkthrough: null,
    status: 'loading',
    error: null,
    currentHeadSha: null,
    walkthroughHeadSha: null,
    isStale: false,
    progress: [],
    githubUrl: 'https://github.com',
    startedAt: null,
    prInfo: null,
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetchWalkthrough(owner, repo, pr);
      const wt = res.walkthrough;
      const review = res.latestReview;
      const status: RunStatus = wt?.status ?? 'none';
      const inFlight = status === 'pending' || status === 'running';

      setState({
        walkthrough: review?.data ?? null,
        status,
        error: wt?.error ?? null,
        currentHeadSha: res.currentHeadSha,
        walkthroughHeadSha: review?.headSha ?? null,
        isStale: !!(review && res.currentHeadSha && review.headSha !== res.currentHeadSha),
        progress: [],
        githubUrl: res.githubUrl,
        // A forced rerun reuses its row, so created_at can be long past;
        // updated_at is bumped when the run is queued and again when it starts.
        startedAt: inFlight ? wt!.updatedAt : null,
        prInfo: res.pr,
      });

      if (inFlight) {
        startPolling();
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Failed to load',
      }));
    }
  }, [owner, repo, pr]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetchStatus(owner, repo, pr);
        if (res.status === 'complete' || res.status === 'failed') {
          stopPolling();
          await load();
        } else {
          setState((s) => ({
            ...s,
            status: res.status as any,
            progress: res.progress ?? s.progress,
          }));
        }
      } catch {
        stopPolling();
      }
    }, 2000);
  }, [owner, repo, pr, stopPolling, load]);

  const generate = useCallback(async () => {
    const needsForce = state.status === 'complete' || state.status === 'failed';
    setState((s) => ({
      ...s,
      status: 'pending',
      error: null,
      progress: [],
      startedAt: new Date().toISOString(),
    }));
    try {
      await generateWalkthrough(owner, repo, pr, needsForce);
      startPolling();
    } catch (err) {
      setState((s) => ({
        ...s,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Failed to generate',
      }));
    }
  }, [owner, repo, pr, state.status, startPolling]);

  useEffect(() => {
    load();
    return stopPolling;
  }, [load, stopPolling]);

  return { ...state, generate, reload: load };
}

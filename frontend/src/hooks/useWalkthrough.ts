import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchWalkthrough,
  generateWalkthrough,
  fetchStatus,
  type Walkthrough,
  type ProgressEntry,
} from '../api';

interface WalkthroughState {
  walkthrough: Walkthrough | null;
  status: 'loading' | 'none' | 'pending' | 'running' | 'complete' | 'failed';
  error: string | null;
  currentHeadSha: string | null;
  walkthroughHeadSha: string | null;
  isStale: boolean;
  progress: ProgressEntry[];
  githubUrl: string;
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

      if (!wt) {
        setState({
          walkthrough: null,
          status: 'none',
          error: null,
          currentHeadSha: res.currentHeadSha,
          walkthroughHeadSha: null,
          isStale: false,
          progress: [],
          githubUrl: res.githubUrl,
        });
        return;
      }

      const isStale = !!(res.currentHeadSha && wt.headSha !== res.currentHeadSha);

      setState({
        walkthrough: wt.data,
        status: wt.status,
        error: wt.error,
        currentHeadSha: res.currentHeadSha,
        walkthroughHeadSha: wt.headSha,
        isStale,
        progress: [],
        githubUrl: res.githubUrl,
      });

      if (wt.status === 'pending' || wt.status === 'running') {
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
    const needsForce = state.status === 'complete';
    setState((s) => ({ ...s, status: 'pending', error: null, progress: [] }));
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

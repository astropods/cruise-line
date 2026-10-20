import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchStatus, fetchWalkthrough, queryKeys } from '../../api';

/** One PR: its latest run, latest review, and live GitHub details */
export function usePr(owner: string, repo: string, number: number) {
  return useQuery({
    queryKey: queryKeys.pr(owner, repo, number),
    queryFn: () => fetchWalkthrough(owner, repo, number),
  });
}

/**
 * Live progress for a running review. Polls every 2s while `enabled`; once
 * the run finishes, refreshes the PR and the list so both show the result.
 */
export function useReviewProgress(owner: string, repo: string, number: number, enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.prProgress(owner, repo, number),
    queryFn: () => fetchStatus(owner, repo, number),
    enabled,
    refetchInterval: enabled ? 2_000 : false,
  });

  const finished = query.data?.status === 'complete' || query.data?.status === 'failed';
  useEffect(() => {
    if (!enabled || !finished) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.pr(owner, repo, number), exact: true });
    queryClient.invalidateQueries({ queryKey: queryKeys.prList });
  }, [enabled, finished, owner, repo, number, queryClient]);

  return query;
}

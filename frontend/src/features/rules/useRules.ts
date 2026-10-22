import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { fetchRules, queryKeys } from '../../api';

/** A repo's review rules: the panel edits them, rule pills show them on hover */
export function useRules(owner: string, repo: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.repoRules(owner, repo),
    queryFn: () => fetchRules(owner, repo).then((r) => r.rules),
    enabled,
  });
}

/** Refetch a repo's rules after changing them */
export function useInvalidateRules(owner: string, repo: string) {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.repoRules(owner, repo) }),
    [queryClient, owner, repo],
  );
}

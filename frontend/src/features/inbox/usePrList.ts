import { useQuery } from '@tanstack/react-query';
import { fetchPrSummaries, queryKeys } from '../../api';
import { isRunning } from '../../domain/prStatus';

/**
 * Every PR the viewer can see. Shared by the sidebar and anything else that
 * lists PRs; polls only while a review is running.
 */
export function usePrList() {
  return useQuery({
    queryKey: queryKeys.prList,
    queryFn: fetchPrSummaries,
    refetchInterval: (query) =>
      query.state.data?.prs.some((p) => isRunning(p.status)) ? 5_000 : false,
  });
}
